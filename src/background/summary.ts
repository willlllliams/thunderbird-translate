/**
 * The requests of the summary and to-dos of a message, and the reading of
 * the answer. The AI service answers with a JSON object (the summary prompt
 * of src/shared/prompts.ts); parseSummary() keeps what it can check field
 * by field, and the content script draws it (content/summary.ts). The AI
 * SDK's structured output is not used: it depends on a JSON mode of the
 * server, which OpenAI-compatible and local services offer unevenly.
 */

import { SUMMARY_PARTS, type SummaryPart } from "../shared/settings"
import type { MailSummary } from "../shared/summary"
import { type MailAnalysis, parseJsonObject } from "./translators/llm-prompt"

/** What the header of the message tells the model: who wrote it and when, so that "next Wednesday" becomes a date. */
export interface MailHeader {
  author: string
  /** ISO 8601. */
  date: string
  subject: string
}

/** Entries per list of a summary; the rest of a longer list is dropped. */
export const MAX_SUMMARY_ITEMS = 10

/** Characters of the quote an entry rests on. */
const MAX_QUOTE = 120

/** The system prompt: the template in the target language, with the parts the user left out asked empty. */
export function buildSummarySystem(template: string, targetLanguage: string, parts: readonly SummaryPart[]): string {
  const base = template.replaceAll("{{to}}", targetLanguage)
  const left = SUMMARY_PARTS.filter((part) => !parts.includes(part))
  return left.length > 0 ? `${base}\nLeave ${left.map((part) => `"${part}"`).join(", ")} as [].` : base
}

const attribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/**
 * The user message: the message with its sender, date and subject; with precise translation, the glossary of its
 * analysis. A closing tag inside the message is broken, so the message cannot end the email early for the model.
 */
export function buildSummaryPrompt(text: string, header: MailHeader | null, glossary: MailAnalysis["glossary"] = []): string {
  const attrs = header ? ` from="${attribute(header.author)}" date="${attribute(header.date)}" subject="${attribute(header.subject)}"` : ""
  const email = `<email${attrs}>\n${text.replace(/<\/(email)/gi, "<\\/$1")}\n</email>`
  if (glossary.length === 0) return email
  return `${email}\n\nWrite these names and terms as the translation of the email does:\n${glossary.map((g) => `- ${g.source} → ${g.target}`).join("\n")}`
}

const DATE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?$/

/** An ISO date with an optional time, as "YYYY-MM-DD" or "YYYY-MM-DD HH:MM"; "" for anything else. */
function isoDate(value: string): string {
  const m = DATE.exec(value)
  return m ? (m[2] ? `${m[1]} ${m[2]}` : m[1]) : ""
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

/**
 * The summary in an answer of the model: fences and chatter around the JSON
 * are dropped, an entry without its main field (task, question, what) is
 * left out, a date that is not ISO is left empty, each list is cut to
 * MAX_SUMMARY_ITEMS, and the parts not asked for stay empty. Null when the
 * answer holds no object with any of the four lists. With the `source` text
 * of the message, a to-do whose quote is not in it, spaces aside, loses the
 * quote and is marked unverified: an instruction hidden in the message may
 * have made it up.
 */
export function parseSummary(raw: string, parts: readonly SummaryPart[] = SUMMARY_PARTS, source?: string): MailSummary | null {
  const squeeze = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase()
  const original = source === undefined ? null : squeeze(source)
  const verified = (quote: string) => original === null || !quote || original.includes(squeeze(quote))
  const o = parseJsonObject(raw)
  if (!o || !SUMMARY_PARTS.some((part) => part in o)) return null
  const list = <T>(part: SummaryPart, read: (item: Record<string, unknown> | string) => T | null): T[] => {
    const value = o[part]
    if (!parts.includes(part) || value === null || value === undefined) return []
    const items = (Array.isArray(value) ? value : [value]).filter((item) => typeof item === "string" || (item && typeof item === "object"))
    return items.flatMap((item) => read(item as Record<string, unknown> | string) ?? []).slice(0, MAX_SUMMARY_ITEMS)
  }
  const field = (item: Record<string, unknown> | string, name: string) => (typeof item === "string" ? "" : text(item[name]))
  return {
    summary: list("summary", (item) => (typeof item === "string" ? item.trim() : "") || null),
    actions: list("actions", (item) => {
      const task = field(item, "task")
      if (!task) return null
      const quote = field(item, "quote").slice(0, MAX_QUOTE)
      const action = { who: field(item, "who"), task, due: isoDate(field(item, "due")), dueText: field(item, "due_text"), quote }
      return verified(quote) ? action : { ...action, quote: "", unverified: true }
    }),
    questions: list("questions", (item) => {
      const question = field(item, "question")
      return question ? { from: field(item, "from"), question } : null
    }),
    dates: list("dates", (item) => {
      const what = field(item, "what")
      return what ? { what, when: isoDate(field(item, "when")), where: field(item, "where") } : null
    }),
  }
}
