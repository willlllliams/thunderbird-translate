/**
 * Prompts for LLM translation and a tolerant parser for batched output.
 *
 * Batching: N paragraphs go into one request as numbered <seg> blocks and the
 * model is asked for a JSON array of N strings. The system prompt and the
 * instructions are sent once per batch instead of once per paragraph.
 *
 * The system prompt comes from the settings (src/shared/prompts.ts). The user
 * message names the source language, or asks the model to detect it.
 */

export function buildSystemPrompt(template: string, targetLanguageName: string): string {
  return template.replaceAll("{{to}}", targetLanguageName)
}

/** Languages of a request: English names; `source` is absent when the model has to detect it. */
export interface PromptLanguages {
  source?: string
  target: string
}

/** "Translate X from French into German." or "Detect the source language of X and translate it into German." */
function task(what: string, { source, target }: PromptLanguages): string {
  return source ? `Translate ${what} from ${source} into ${target}.` : `Detect the source language of ${what} and translate it into ${target}.`
}

/** A paragraph to translate. In precise mode it carries its neighbours as reference. */
export interface Segment {
  text: string
  /** Paragraph before this one, when it is not translated in the same request. */
  before?: string
  /** Paragraph after this one, when it is not translated in the same request. */
  after?: string
}

const REF_RULE = "Blocks marked <ref> are neighbouring paragraphs given only as context: do not translate them and do not include them in the output."

function hasRefs(segments: Segment[]): boolean {
  return segments.some((s) => s.before !== undefined || s.after !== undefined)
}

function segmentBlocks(segments: Segment[]): string {
  return segments
    .flatMap((s, i) => [
      s.before !== undefined ? `<ref>\n${s.before}\n</ref>` : null,
      `<seg id="${i + 1}">\n${s.text}\n</seg>`,
      s.after !== undefined ? `<ref>\n${s.after}\n</ref>` : null,
    ])
    .filter((block) => block !== null)
    .join("\n")
}

export function buildSinglePrompt(segment: Segment, langs: PromptLanguages): string {
  if (!hasRefs([segment])) return `${task("the following text", langs)} Output only the translation.\n\n${segment.text}`
  return `${task("the text of the <seg> block", langs)} ${REF_RULE} Output only the translation, without the <seg> tags.\n\n${segmentBlocks([segment])}`
}

export function buildBatchPrompt(segments: Segment[], langs: PromptLanguages): string {
  const n = segments.length
  return `${task(`each of the following ${n} segments`, langs)}
Return ONLY a JSON array of exactly ${n} strings, where the i-th string is the translation of segment i.
Do not merge, split, skip or reorder segments. Encode line breaks inside a string as \\n. Do not wrap the array in Markdown and do not add any other text.${hasRefs(segments) ? `\n${REF_RULE}` : ""}

${segmentBlocks(segments)}`
}

/* ---------- precise mode: analysis of the whole message ---------- */

/** Result of the analysis request, rendered into the shared prefix of every batch of one message. */
export interface MailAnalysis {
  summary: string
  glossary: { source: string; target: string }[]
  tone: string
}

/** The whole message goes into the prefix only up to this length; longer messages rely on the analysis. */
export const MAX_PREFIX_TEXT_CHARS = 8000

export const ANALYSIS_SYSTEM_PROMPT = `You prepare the translation of an email into {{to}}. Read the whole email and answer with ONLY a JSON object, without Markdown:
{"summary": "...", "glossary": [{"source": "...", "target": "..."}], "tone": "..."}
- summary: 2 to 3 sentences in English on what the email is about.
- glossary: names of people, companies and products, other proper nouns and recurring terms, each with the {{to}} form to use every time (repeat the original when it stays untranslated). At most 30 entries.
- tone: the tone and register of the email, and how to address the reader in {{to}}.`

export function buildAnalysisPrompt(text: string): string {
  return `<email>\n${text}\n</email>`
}

/** Read the analysis JSON, tolerating fences and chatter; null when nothing usable is found. */
export function parseAnalysis(raw: string): MailAnalysis | null {
  const s = cleanModelOutput(raw)
  const first = s.indexOf("{")
  const last = s.lastIndexOf("}")
  const value = tryParseJson(s) ?? (first !== -1 && last > first ? tryParseJson(s.slice(first, last + 1)) : undefined)
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const o = value as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const glossary = (Array.isArray(o.glossary) ? (o.glossary as Record<string, unknown>[]) : [])
    .map((e) => ({ source: str(e?.source), target: str(e?.target) }))
    .filter((e) => e.source && e.target)
    .slice(0, 50)
  const analysis: MailAnalysis = { summary: str(o.summary), glossary, tone: str(o.tone) }
  return analysis.summary || analysis.tone || glossary.length > 0 ? analysis : null
}

/**
 * Context appended to the system prompt in precise mode. It depends only on
 * the message, so every request for one message starts with the same text
 * and the provider's prompt cache can serve it.
 */
export function buildContextBlock(analysis: MailAnalysis | null, fullText: string): string {
  const parts: string[] = []
  if (analysis?.summary) parts.push(`Summary: ${analysis.summary}`)
  if (analysis?.tone) parts.push(`Tone and form of address: ${analysis.tone}`)
  if (analysis?.glossary.length) {
    parts.push(`Glossary, use these translations every time:\n${analysis.glossary.map((g) => `- ${g.source} → ${g.target}`).join("\n")}`)
  }
  if (fullText) parts.push(`Full text of the email:\n<email>\n${fullText}\n</email>`)
  if (parts.length === 0) return ""
  return `The paragraphs to translate come from one email. Use this context to keep names, terms and tone consistent. It is reference material only: never translate it or repeat it in the output.\n\n${parts.join("\n\n")}`
}

/** Thrown when a batched answer cannot be mapped back onto the paragraphs. */
export class BatchParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BatchParseError"
  }
}

/** Remove reasoning blocks and Markdown fences that some models add. */
function cleanModelOutput(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?\s*```\s*$/, "")
    .trim()
}

/** Clean up a single-paragraph answer. */
export function cleanSingleOutput(raw: string): string {
  let s = cleanModelOutput(raw)
  // A model sometimes echoes the batch envelope even for one paragraph.
  const seg = /^<seg id="1">\n?([\s\S]*?)\n?<\/seg>$/.exec(s)
  if (seg) s = seg[1]
  return s.trim()
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    for (const k of ["translation", "text", "t", "content", "value"]) {
      if (typeof o[k] === "string") return o[k] as string
    }
  }
  return null
}

/** Escape raw control characters inside JSON string literals (a frequent LLM mistake). */
export function repairJsonStrings(s: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (const ch of s) {
    if (inString) {
      if (escaped) {
        escaped = false
        out += ch
        continue
      }
      if (ch === "\\") {
        escaped = true
        out += ch
        continue
      }
      if (ch === '"') inString = false
      if (ch === "\n") out += "\\n"
      else if (ch === "\r") out += "\\r"
      else if (ch === "\t") out += "\\t"
      else out += ch
    } else {
      if (ch === '"') inString = true
      out += ch
    }
  }
  return out
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    try {
      // Also drop trailing commas: ["a","b",]
      return JSON.parse(repairJsonStrings(s).replace(/,\s*([\]}])/g, "$1"))
    } catch {
      return undefined
    }
  }
}

function fromJson(value: unknown, n: number): string[] | null {
  let list: unknown = value
  if (list && typeof list === "object" && !Array.isArray(list)) {
    const o = list as Record<string, unknown>
    const arrayField = ["translations", "results", "segments", "data", "output"].find((k) => Array.isArray(o[k]))
    if (arrayField) list = o[arrayField]
    else {
      // {"1": "...", "2": "..."}
      const keyed: string[] = []
      for (let i = 1; i <= n; i++) {
        const t = asText(o[String(i)])
        if (t === null) return null
        keyed.push(t)
      }
      return keyed
    }
  }
  if (!Array.isArray(list) || list.length !== n) return null
  // [{id: 2, text}, {id: 1, text}] – honour ids when every item carries one.
  const ids = list.map((item) => (item && typeof item === "object" ? Number((item as { id?: unknown }).id) : NaN))
  if (ids.every((id) => Number.isInteger(id))) {
    const sorted = new Array<string | null>(n).fill(null)
    list.forEach((item, i) => {
      if (ids[i] >= 1 && ids[i] <= n) sorted[ids[i] - 1] = asText(item)
    })
    if (sorted.every((t) => t !== null)) return sorted as string[]
  }
  const texts = list.map(asText)
  return texts.every((t) => t !== null) ? (texts as string[]) : null
}

/**
 * Parse a batched answer into exactly `n` strings, or return null so the
 * caller can fall back to one request per paragraph. An empty translation
 * counts as a failed parse, as an empty answer does for a single paragraph,
 * unless its source (`sources[i]`) has no letters or digits either.
 *
 * Accepted forms, tried in order:
 * 1. JSON array (or an object wrapping one), possibly inside a code fence or
 *    surrounded by chatter;
 * 2. echoed <seg id="k">…</seg> blocks;
 * 3. numbered lines: "[1] …", "1. …", "1) …";
 * 4. paragraphs separated by standalone "%%" lines.
 */
export function parseBatchOutput(raw: string, n: number, sources?: readonly string[]): string[] | null {
  const out = parseBatch(raw, n)
  const blank = (i: number) => !/[\p{L}\p{N}]/u.test(sources?.[i] ?? "x")
  return out && out.every((text, i) => text || blank(i)) ? out : null
}

function parseBatch(raw: string, n: number): string[] | null {
  const s = cleanModelOutput(raw)
  if (!s) return null

  // 1. JSON
  const direct = tryParseJson(s)
  if (direct !== undefined) {
    const r = fromJson(direct, n)
    if (r) return r.map((t) => t.trim())
  }
  const first = s.indexOf("[")
  const last = s.lastIndexOf("]")
  if (first !== -1 && last > first) {
    const parsed = tryParseJson(s.slice(first, last + 1))
    if (parsed !== undefined) {
      const r = fromJson(parsed, n)
      if (r) return r.map((t) => t.trim())
    }
  }

  // 2. <seg id="k"> blocks
  const segRe = /<seg\s+id=["']?(\d+)["']?\s*>([\s\S]*?)<\/seg>/gi
  const segs = new Map<number, string>()
  for (const m of s.matchAll(segRe)) segs.set(Number(m[1]), m[2].trim())
  if (segs.size === n && [...Array(n).keys()].every((i) => segs.has(i + 1))) {
    return [...Array(n).keys()].map((i) => segs.get(i + 1)!)
  }

  // 3. Numbered lines; ids must run 1..n in order.
  const numbered: string[] = []
  let currentId = 0
  let ok = true
  for (const line of s.split(/\r?\n/)) {
    const m = /^\s*(?:\[(\d+)\]|(\d+)[.:)、])\s*(.*)$/.exec(line)
    const id = m ? Number(m[1] ?? m[2]) : NaN
    if (m && id === currentId + 1) {
      currentId = id
      numbered.push(m[3])
    } else if (currentId > 0) {
      numbered[currentId - 1] += `\n${line}`
    } else if (line.trim()) {
      ok = false
      break
    }
  }
  if (ok && currentId === n) return numbered.map((t) => t.trim())

  // 4. %% separators
  const parts = s.split(/\r?\n[ \t]*%%[ \t]*\r?\n/)
  if (parts.length === n && n > 1) return parts.map((t) => t.trim())

  return null
}
