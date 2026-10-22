// Local stand-in for every service the e2e build talks to:
// - Google's free endpoint (translate_a/t, translate_a/single): "[G] *<text>*", whose asterisks a machine translation keeps as text
// - an OpenAI-compatible chat completions API: "**[AI <mode>]** <text>" in Markdown, the mode read from the system prompt,
//   the first "report" of the text as a link to https://example.com/report (aiAnswer());
//   the same text in the same mode asked again gets "**[AI <mode> #<n>]** <text>", n counting the requests;
//   a request with the summary prompt gets SUMMARY_ANSWER, a summary with one entry in each of its four parts;
//   a request with an image gets IMAGE_ANSWER, a table of two rows, after the image is checked (imageCall())
// - DeepL (/deepl/v2/translate, /deepl/v2/usage), Baidu (/baidu), Youdao (/youdao) and Caiyun (/caiyun): "[<service>] <text>",
//   with the key, the signature (Baidu MD5, Youdao SHA-256) and the language codes of the request checked (machineCall())
// - the dictionary packs of a GitHub release (dict-index.json and the packs en -> zh-Hans and zh-Hans -> en built from fixtures/)
// - Mozilla Remote Settings for Bergamot (/bergamot/v1/): the server root, the model records of en -> zh-Hans and
//   zh-Hans -> en and the zstd-compressed attachments, all made of fake bytes
// - the remote images of the "image-remote" run: /remote/offer.png, /remote/pixel.png, and 404 for any other /remote/ address;
// - what the extension reports: /ready, /mark, /log, /report, and which scenario to run: /scenario
// Answers are delayed so that the tiers arrive in a fixed order: dictionary, Google, AI.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { gzipSync, zstdCompressSync } from "node:zlib"
import { remoteOffer, remotePixel } from "./png.mjs"

/** System prompt phrases of the two display modes, of the summary and of an image (src/shared/prompts.ts). */
const PROMPT_MODES = [
  ["bilingual", "compares the two"],
  ["translation-only", "never the original"],
  ["summary", "for the person who received them"],
  ["image", "You read an image from an email"],
]

/** The answer to an image request: the table of the image prompt, with the English header the content script shows in the interface language. */
export const IMAGE_ANSWER = "| Original | Translation |\n| --- | --- |\n| Umsatz | [AI image] Revenue |\n| Kosten | [AI image] Costs |"

/** The upload limit of one image in the e2e settings (Settings.image.maxImageKB, the default). */
const MAX_IMAGE_BYTES = 1500 * 1024

/**
 * The image of a chat request, null without one: whether it is a JPEG data URL (the default upload format, whose
 * base64 starts with the JPEG marker /9j/), its size in bytes, and the text beside it.
 */
export function imageCall(messages) {
  for (const message of messages) {
    if (message.role !== "user" || !Array.isArray(message.content)) continue
    const image = message.content.find((part) => part.type === "image_url")
    if (!image) continue
    const url = typeof image.image_url === "string" ? image.image_url : image.image_url?.url ?? ""
    const data = url.slice(url.indexOf(",") + 1)
    const bytes = Buffer.from(data, "base64").length
    return { jpeg: url.startsWith("data:image/jpeg;base64,/9j/"), bytes, withinLimit: bytes <= MAX_IMAGE_BYTES, text: message.content.filter((part) => part.type === "text").map((part) => part.text).join("") }
  }
  return null
}

/** The answer to a summary request: one entry in each part, the reader as "me", wrapped in a fence as some models do. */
export const SUMMARY_ANSWER = `\`\`\`json
${JSON.stringify({
  summary: ["Anna asks to move the client meeting."],
  actions: [{ who: "me", task: "Confirm the new date", due: "2026-10-23", due_text: "by Thursday", quote: "The meeting with the client has been moved to Thursday morning" }],
  questions: [{ from: "Anna", question: "Does Thursday work for you?" }],
  dates: [{ what: "Client meeting", when: "2026-10-23 15:00", where: "Room 4" }],
})}
\`\`\``

/** The keys of the four machine translators as the e2e settings hold them (src/e2e/background.ts). */
export const MACHINE_KEYS = { deepl: "e2e-deepl:fx", baidu: { appId: "e2e-baidu-app", key: "e2e-baidu-key" }, youdao: { appId: "e2e-youdao-app", key: "e2e-youdao-secret" }, caiyun: "e2e-caiyun-token" }

const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex")
const sha256Text = (s) => createHash("sha256").update(s, "utf8").digest("hex")
/** The input of Youdao's signature: up to 20 code points the text, else its first 10, its length and its last 10. */
const youdaoInput = (q) => {
  const chars = Array.from(q)
  return chars.length <= 20 ? q : `${chars.slice(0, 10).join("")}${chars.length}${chars.slice(-10).join("")}`
}

/**
 * A request to one of the machine translators with a key: its texts, whether key and signature are right, and the
 * language codes, in the form of the service; null for another path.
 */
export function machineCall(path, headers, raw) {
  if (path === "/deepl/v2/translate") {
    const body = JSON.parse(raw)
    return { service: "deepl", texts: body.text, auth: headers.authorization === `DeepL-Auth-Key ${MACHINE_KEYS.deepl}`, to: body.target_lang, from: body.source_lang ?? "" }
  }
  if (path === "/baidu") {
    const f = new URLSearchParams(raw)
    const q = f.get("q") ?? ""
    const { appId, key } = MACHINE_KEYS.baidu
    return { service: "baidu", texts: q.split("\n"), auth: f.get("appid") === appId && f.get("sign") === md5(appId + q + f.get("salt") + key), to: f.get("to"), from: f.get("from") }
  }
  if (path === "/youdao") {
    const f = new URLSearchParams(raw)
    const qs = f.getAll("q")
    const { appId, key } = MACHINE_KEYS.youdao
    const sign = sha256Text(appId + youdaoInput(qs.join("")) + f.get("salt") + f.get("curtime") + key)
    return { service: "youdao", texts: qs, auth: f.get("appKey") === appId && f.get("signType") === "v3" && f.get("sign") === sign, to: f.get("to"), from: f.get("from") }
  }
  if (path === "/caiyun") {
    const body = JSON.parse(raw)
    return { service: "caiyun", texts: body.source, auth: headers["x-authorization"] === `token ${MACHINE_KEYS.caiyun}`, to: body.trans_type, from: body.detect ? "auto" : "" }
  }
  return null
}

/** The answer of a machine translator in its own form; a wrong key or signature gets the service's refusal. */
export function machineAnswer({ service, texts, auth }) {
  const out = texts.map((t) => `[${service}] ${t}`)
  if (service === "deepl") return auth ? [200, { translations: out.map((text) => ({ text })) }] : [403, { message: "Wrong auth" }]
  if (service === "baidu") return [200, auth ? { from: "en", to: "zh", trans_result: out.map((dst, i) => ({ src: texts[i], dst })) } : { error_code: "54001", error_msg: "Invalid Sign" }]
  if (service === "youdao") return [200, auth ? { errorCode: "0", translateResults: out.map((translation, i) => ({ query: texts[i], translation })) } : { errorCode: "202" }]
  return auth ? [200, { target: out, rc: 0 }] : [401, { message: "Invalid token" }]
}

export function aiMode(system) {
  return PROMPT_MODES.find(([, phrase]) => system.includes(phrase))?.[0] ?? "other"
}

/** The AI translation of `text`: the label in bold and the first "report" as a link, so that the rendered text reads "[AI <label>] <text>". */
export const aiAnswer = (label, text) => `**[AI ${label}]** ${text.replace(/\breport\b/,"[report](https://example.com/report)")}`

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
export async function startMockServer({ fixtures, screenshots, googleDelayMs = 300, aiDelayMs = 1500, chunkDelayMs = 250, log = () => {} }) {
  const release = dictionaryRelease(fixtures)
  const bergamot = bergamotModels()
  /** What the extension is asked to do (GET /scenario); set by the runner before each launch. */
  let scenario = "message"
  const calls = []
  const posted = new Map()
  /** How often the AI service was asked for each mode and text. */
  const aiAsked = new Map()
  const waiters = new Map()

  const deliver = (path, body) => {
    const waiting = waiters.get(path)
    if (waiting?.length) waiting.shift()(body)
    else posted.set(path, [...(posted.get(path) ?? []), body])
  }

  /**
   * DeepL, Baidu, Youdao and Caiyun send no CORS headers, as DeepL does (docs/providers.md): their answers reach the
   * background script through its host permission alone, as in a real Thunderbird.
   */
  const withoutCors = (path) => /^\/(?:deepl|baidu|youdao|caiyun)(?:\/|$)/.test(path)

  const send = (res, status, body, type = "application/json", cors = true) => {
    res.writeHead(status, { "Content-Type": type, ...(cors ? { "Access-Control-Allow-Origin": "*" } : {}) })
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
        res.writeHead(204, withoutCors(url.pathname) ? {} : { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST" })
        return res.end()
      }
      if (url.pathname === "/google/translate_a/t" || url.pathname === "/google/translate_a/single") {
        const texts = new URLSearchParams(raw).getAll("q")
        const single = url.pathname.endsWith("single")
        calls.push({ type: "google", single, sl: url.searchParams.get("sl"), tl: url.searchParams.get("tl"), count: texts.length, at: Date.now() })
        await sleep(googleDelayMs)
        const out = texts.map((t) => `[G] *${t}*`)
        return send(res, 200, single ? [[[out[0], texts[0]]], null, "en"] : out.map((t) => [t, "en"]))
      }
      if (url.pathname === "/v1/chat/completions") {
        const body = JSON.parse(raw)
        const system = body.messages.filter((m) => m.role === "system").map((m) => messageText(m.content)).join("\n")
        const user = body.messages.filter((m) => m.role === "user").map((m) => messageText(m.content)).join("\n")
        const mode = aiMode(system)
        const { batch, texts } = segmentsOf(user)
        const image = imageCall(body.messages)
        calls.push({ type: "ai", mode, batch, count: texts.length, model: body.model, auth: req.headers.authorization ?? "", maxTokens: body.max_tokens ?? body.max_completion_tokens ?? null, user: mode === "summary" ? user.slice(0, 300) : undefined, ...(image ? { image } : {}), at: Date.now() })
        await sleep(aiDelayMs)
        const out = image ? [image.jpeg && image.withinLimit ? IMAGE_ANSWER : "The image did not arrive as a JPEG within the limit."] : mode === "summary" ? [SUMMARY_ANSWER] : texts.map((t) => {
          const n = (aiAsked.get(`${mode}\n${t}`) ?? 0) + 1
          aiAsked.set(`${mode}\n${t}`, n)
          return aiAnswer(`${mode}${n > 1 ? ` #${n}` : ""}`, t)
        })
        const content = batch && !image ? JSON.stringify(out) : out[0]
        return send(res, 200, {
          id: "e2e",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })
      }
      if (req.method === "GET" && url.pathname === "/deepl/v2/usage") {
        calls.push({ type: "mt", service: "deepl", usage: true, auth: req.headers.authorization === `DeepL-Auth-Key ${MACHINE_KEYS.deepl}`, at: Date.now() })
        return send(res, 200, { character_count: 1234, character_limit: 500000 }, "application/json", false)
      }
      const machine = req.method === "POST" ? machineCall(url.pathname, req.headers, raw) : null
      if (machine) {
        calls.push({ type: "mt", ...machine, count: machine.texts.length, texts: undefined, at: Date.now() })
        await sleep(googleDelayMs)
        const [status, body] = machineAnswer(machine)
        return send(res, status, body, "application/json", false)
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
      // The remote images of the "image-remote" run: a banner, a tracking pixel, and an address that answers 404.
      if (req.method === "GET" && url.pathname.startsWith("/remote/")) {
        calls.push({ type: "remote", path: url.pathname, cookie: req.headers.cookie ?? "", referer: req.headers.referer ?? "", at: Date.now() })
        const image = { "/remote/offer.png": remoteOffer, "/remote/pixel.png": remotePixel }[url.pathname]
        if (!image) return send(res, 404, "no such image", "text/plain", false)
        res.writeHead(200, { "Content-Type": "image/png", "Content-Length": image.length, "Cache-Control": "max-age=3600" })
        return res.end(image)
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
      // A screenshot of the test build (experiment e2eCapture): saved as <screenshots>/<name>.png.
      if (req.method === "POST" && url.pathname === "/screenshot") {
        const { name, dataUrl } = JSON.parse(raw)
        if (!screenshots || !/^[\w-]+$/.test(name) || !String(dataUrl).startsWith("data:image/png;base64,")) return send(res, 400, "bad screenshot", "text/plain")
        mkdirSync(screenshots, { recursive: true })
        writeFileSync(join(screenshots, `${name}.png`), Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"))
        log(`screenshot ${name}.png`)
        return send(res, 200, "ok", "text/plain")
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
      aiAsked.clear()
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
