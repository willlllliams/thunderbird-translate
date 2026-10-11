// Local stand-in for every service the e2e build talks to:
// - Google's free endpoint (translate_a/t, translate_a/single): "[G] <text>"
// - an OpenAI-compatible chat completions API: "[AI <mode>] <text>", the mode read from the system prompt
// - the dictionary packs of a GitHub release (dict-index.json and the packs en -> zh-Hans and zh-Hans -> en built from fixtures/)
// - Mozilla Remote Settings for Bergamot (/bergamot/v1/): the server root, the model records of en -> zh-Hans and
//   zh-Hans -> en and the zstd-compressed attachments, all made of fake bytes
// - what the extension reports: /ready, /mark, /log, /report, and which scenario to run: /scenario
// Answers are delayed so that the tiers arrive in a fixed order: dictionary, Google, AI.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { gzipSync, zstdCompressSync } from "node:zlib"

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
  const files = {}
  const packs = [
    ["en", "zh-Hans"],
    ["zh-Hans", "en"],
  ].map(([src, tgt]) => {
    const file = `dict-${src}-${tgt}.tsv.gz`
    const tsv = readFileSync(join(fixtures, `dict-${src}-${tgt}.tsv`), "utf8")
    const gz = gzipSync(Buffer.from(tsv, "utf8"))
    const lines = tsv.split("\n")
    files[file] = gz
    return {
      src,
      tgt,
      file,
      bytes: gz.length,
      rawBytes: Buffer.byteLength(tsv),
      entries: lines.filter((l) => l.startsWith("w\t")).length,
      forms: lines.filter((l) => l.startsWith("f\t")).length,
      sha256: createHash("sha256").update(gz).digest("hex"),
      source: "E2E fixture",
      license: "CC0-1.0",
      attribution: "Test data",
    }
  })
  return { index: { version: 1, packs }, files }
}

/** Deterministic pseudo-random bytes: they compress poorly, so the compressed files have a size worth a progress bar. */
function fakeBytes(label, length) {
  const parts = []
  for (let i = 0; i * 32 < length; i++) parts.push(createHash("sha256").update(`${label}:${i}`).digest())
  return Buffer.concat(parts).subarray(0, length)
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex")

/** Files of the models en -> zh-Hans and zh-Hans -> en: Remote Settings records (the attachment host comes from the server root) and the compressed attachments by location. */
function bergamotModels() {
  const specs = [
    ["en", "zh-Hans", "enzh"],
    ["zh-Hans", "en", "zhen"],
  ].flatMap(([src, tgt, short]) => [
    { src, tgt, fileType: "model", name: `model.${short}.intgemm.alphas.bin`, size: 24 * 1024 },
    { src, tgt, fileType: "lex", name: `lex.50.50.${short}.s2t.bin`, size: 4 * 1024 },
    { src, tgt, fileType: "vocab", name: `vocab.${short}.spm`, size: 4 * 1024 },
  ])
  const attachments = {}
  const records = specs.map(({ src, tgt, fileType, name, size }) => {
    const raw = fakeBytes(name, size)
    const compressed = zstdCompressSync(raw)
    const location = `main-workspace/translations-models-v2/${name}.zst`
    attachments[location] = compressed
    return {
      id: `e2e-${name}`,
      name,
      sourceLanguage: src,
      targetLanguage: tgt,
      fileType,
      version: "3.0",
      architecture: "e2e",
      filter_expression: "",
      attachment: { location, hash: sha256(compressed), size: compressed.length, mimetype: "application/octet-stream", filename: `${name}.zst` },
      decompressedHash: sha256(raw),
      decompressedSize: raw.length,
    }
  })
  return { records, attachments }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Start the server on 127.0.0.1 and a free port. `calls` lists, in order, the
 * Google and AI requests, the dictionary downloads and the command marks.
 */
export async function startMockServer({ fixtures, googleDelayMs = 300, aiDelayMs = 1500, chunkDelayMs = 250, log = () => {} }) {
  const release = dictionaryRelease(fixtures)
  const bergamot = bergamotModels()
  /** What the extension is asked to do (GET /scenario); set by the runner before each launch. */
  let scenario = "message"
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

  /** A file in four chunks with a pause between them, so that the page can show the progress. */
  const sendInChunks = async (res, data, type) => {
    res.writeHead(200, { "Content-Type": type, "Content-Length": data.length, "Access-Control-Allow-Origin": "*" })
    const step = Math.ceil(data.length / 4)
    for (let at = 0; at < data.length; at += step) {
      if (at > 0) await sleep(chunkDelayMs)
      res.write(data.subarray(at, at + step))
    }
    res.end()
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
        return sendInChunks(res, data, "application/gzip")
      }
      if (req.method === "GET" && url.pathname === "/scenario") return send(res, 200, scenario, "text/plain")
      if (req.method === "GET" && url.pathname === "/bergamot/v1/") {
        calls.push({ type: "bergamot", what: "server root", at: Date.now() })
        return send(res, 200, { capabilities: { attachments: { base_url: `http://${req.headers.host}/bergamot/attachments/` } } })
      }
      if (req.method === "GET" && url.pathname === "/bergamot/v1/buckets/main/collections/translations-models-v2/records") {
        calls.push({ type: "bergamot", what: "records", at: Date.now() })
        return send(res, 200, { data: bergamot.records })
      }
      if (req.method === "GET" && url.pathname.startsWith("/bergamot/attachments/")) {
        const location = decodeURIComponent(url.pathname.slice("/bergamot/attachments/".length))
        const data = bergamot.attachments[location]
        if (!data) return send(res, 404, "not found", "text/plain")
        calls.push({ type: "bergamot", what: location, at: Date.now() })
        return sendInChunks(res, data, "application/octet-stream")
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
    /** The test the next Thunderbird runs: "message" (translate a displayed message) or "welcome" (download from the setup guide). */
    setScenario(name) {
      scenario = name
    },
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
