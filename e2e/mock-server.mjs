// Local stand-in for every service the e2e build talks to:
// - Google's free endpoint (translate_a/t, translate_a/single): "[G] <text>"
// - an OpenAI-compatible chat completions API: "[AI <mode>] <text>", the mode read from the system prompt
// - the dictionary packs of a GitHub release (dict-index.json and one pack built from fixtures/)
// - what the extension reports: /ready, /mark, /log, /report
// Answers are delayed so that the tiers arrive in a fixed order: dictionary, Google, AI.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

/** System prompt phrases of the two display modes (src/shared/prompts.ts). */
const PROMPT_MODES = [
  ["bilingual", "compares the two"],
  ["translation-only", "never the original"],
]

export function aiMode(system) {
  return PROMPT_MODES.find(([, phrase]) => system.includes(phrase))?.[0] ?? "other"
}

/** Text of a chat message, whether a string or a list of parts. */
const messageText = (content) => (typeof content === "string" ? content : (content ?? []).map((p) => p.text ?? "").join(""))

/** The paragraphs of a request: <seg> blocks of a batch, else the text after the instruction line. */
export function segmentsOf(prompt) {
  const segs = [...prompt.matchAll(/<seg id="(\d+)">\n([\s\S]*?)\n<\/seg>/g)].map((m) => m[2])
  return segs.length > 0 ? { batch: true, texts: segs } : { batch: false, texts: [prompt.slice(prompt.indexOf("\n\n") + 2)] }
}

function dictionaryRelease(fixtures) {
  const file = "dict-en-zh-Hans.tsv.gz"
  const tsv = readFileSync(join(fixtures, "dict-en-zh-Hans.tsv"), "utf8")
  const gz = gzipSync(Buffer.from(tsv, "utf8"))
  const lines = tsv.split("\n")
  const index = {
    version: 1,
    packs: [
      {
        src: "en",
        tgt: "zh-Hans",
        file,
        bytes: gz.length,
        rawBytes: Buffer.byteLength(tsv),
        entries: lines.filter((l) => l.startsWith("w\t")).length,
        forms: lines.filter((l) => l.startsWith("f\t")).length,
        sha256: createHash("sha256").update(gz).digest("hex"),
        source: "E2E fixture",
        license: "CC0-1.0",
        attribution: "Test data",
      },
    ],
  }
  return { index, files: { [file]: gz } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Start the server on 127.0.0.1 and a free port. `calls` lists, in order, the
 * Google and AI requests, the dictionary downloads and the command marks.
 */
export async function startMockServer({ fixtures, googleDelayMs = 300, aiDelayMs = 1500, log = () => {} }) {
  const release = dictionaryRelease(fixtures)
  const calls = []
  const posted = new Map()
  const waiters = new Map()

  const deliver = (path, body) => {
    const waiting = waiters.get(path)
    if (waiting?.length) waiting.shift()(body)
    else posted.set(path, [...(posted.get(path) ?? []), body])
  }

  const send = (res, status, body, type = "application/json") => {
    res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*" })
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body))
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1")
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString("utf8")
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST" })
        return res.end()
      }
      if (url.pathname === "/google/translate_a/t" || url.pathname === "/google/translate_a/single") {
        const texts = new URLSearchParams(raw).getAll("q")
        const single = url.pathname.endsWith("single")
        calls.push({ type: "google", single, sl: url.searchParams.get("sl"), tl: url.searchParams.get("tl"), count: texts.length, at: Date.now() })
        await sleep(googleDelayMs)
        const out = texts.map((t) => `[G] ${t}`)
        return send(res, 200, single ? [[[out[0], texts[0]]], null, "en"] : out.map((t) => [t, "en"]))
      }
      if (url.pathname === "/v1/chat/completions") {
        const body = JSON.parse(raw)
        const system = body.messages.filter((m) => m.role === "system").map((m) => messageText(m.content)).join("\n")
        const user = body.messages.filter((m) => m.role === "user").map((m) => messageText(m.content)).join("\n")
        const mode = aiMode(system)
        const { batch, texts } = segmentsOf(user)
        calls.push({ type: "ai", mode, batch, count: texts.length, model: body.model, auth: req.headers.authorization ?? "", at: Date.now() })
        await sleep(aiDelayMs)
        const out = texts.map((t) => `[AI ${mode}] ${t}`)
        const content = batch ? JSON.stringify(out) : out[0]
        return send(res, 200, {
          id: "e2e",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })
      }
      if (req.method === "GET" && url.pathname === "/releases/dict-index.json") {
        calls.push({ type: "download", file: "dict-index.json", at: Date.now() })
        return send(res, 200, release.index)
      }
      if (req.method === "GET" && url.pathname.startsWith("/releases/")) {
        const file = decodeURIComponent(url.pathname.slice("/releases/".length))
        const data = release.files[file]
        if (!data) return send(res, 404, "not found", "text/plain")
        calls.push({ type: "download", file, at: Date.now() })
        res.writeHead(200, { "Content-Type": "application/gzip", "Content-Length": data.length })
        return res.end(data)
      }
      if (req.method === "POST" && ["/ready", "/mark", "/log", "/report"].includes(url.pathname)) {
        const body = JSON.parse(raw || "null")
        if (url.pathname === "/mark") calls.push({ type: "mark", command: body.command, at: Date.now() })
        if (url.pathname === "/log") log(body.message)
        deliver(url.pathname, body)
        return send(res, 200, "ok", "text/plain")
      }
      send(res, 404, "not found", "text/plain")
    } catch (error) {
      log(`mock server error on ${url.pathname}: ${error.stack ?? error}`)
      send(res, 500, String(error), "text/plain")
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    /** The next body posted to `path`, or a rejection after `timeoutMs`. */
    next(path, timeoutMs) {
      const queued = posted.get(path)
      if (queued?.length) return Promise.resolve(queued.shift())
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.set(path, (waiters.get(path) ?? []).filter((w) => w !== done))
          reject(new Error(`nothing posted to ${path} within ${timeoutMs / 1000} s`))
        }, timeoutMs)
        const done = (body) => {
          clearTimeout(timer)
          resolve(body)
        }
        waiters.set(path, [...(waiters.get(path) ?? []), done])
      })
    },
    /** Forget the calls of the previous message. */
    reset() {
      calls.length = 0
      posted.clear()
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
