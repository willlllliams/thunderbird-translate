/**
 * Image translation in the background script (background/images.ts): animation by content, the encoding attempts,
 * data: URIs, the codec of the background page, the filters on the bytes, the cache and its keys, the consent checked
 * again, the limits per message and their rounds, the answer and the test image; the request of the AI SDK with an
 * image part (translators/llm.ts); the requests over the Port (tabs.ts), the test request (router.ts), the part of a
 * message (subject.ts) and the glossary of precise translation (service.ts).
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { PersistentCache } from "../src/background/cache"
import { browserCodec, dataBytes, encodeAttempts, type ImageDeps, ImageService, isAnimated, readImageAnswer } from "../src/background/images"
import { createHandlers } from "../src/background/router"
import { displayedMessageId, messagePart } from "../src/background/subject"
import { createTabRegistry } from "../src/background/tabs"
import { type ImageAnswer, type ImageInput, llmReadImage } from "../src/background/translators/llm"
import type { LlmCallOptions } from "../src/background/translators/llm"
import { ENGLISH } from "../src/shared/i18n"
import { createMailContext } from "../src/shared/mail-context"
import type { ImageRequest, ImageResponse } from "../src/shared/messages"
import { createDefaultSettings, defaultImageSettings, resolveProviderConfig, type Settings, toPublicSettings } from "../src/shared/settings"
import { backgroundPort, stubBrowser } from "./fixtures/browser"
import { allowed, anthropicMessage, chatCompletion, createService, jsonResponse, memoryStorage, nextTask, until } from "./helpers"

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

/** A GIF of `frames` 1 × 1 images, with a graphic control extension before each when `extension`. */
function gif(frames: number, extension = false): Uint8Array<ArrayBuffer> {
  const bytes = [...ascii("GIF89a"), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255]
  for (let i = 0; i < frames; i++) {
    if (extension) bytes.push(0x21, 0xf9, 4, 0, 0, 0, 0, 0)
    bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x80, 0, 0, 0, 255, 255, 255, 2, 2, 0x4c, 0x01, 0)
  }
  bytes.push(0x3b)
  return new Uint8Array(bytes)
}

/** A PNG of about `size` bytes: IHDR, an acTL chunk when `animated`, then IDAT. */
function png(size = 5000, animated = false): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, length: number) => [(length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255, ...ascii(type), ...new Array(length).fill(7), 0, 0, 0, 0]
  const bytes = [0x89, ...ascii("PNG\r\n\x1a\n"), ...chunk("IHDR", 13), ...(animated ? chunk("acTL", 8) : []), ...chunk("IDAT", Math.max(0, size - 45))]
  return new Uint8Array(bytes)
}

/** A WebP with a VP8X chunk whose flags are `flags`. */
const webp = (flags: number) => new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8X"), 10, 0, 0, 0, flags, 0, 0, 0])

describe("the bytes of an image", () => {
  it("tells animated images by their content", () => {
    expect(isAnimated(gif(1))).toBe(false)
    expect(isAnimated(gif(2))).toBe(true)
    expect(isAnimated(gif(3, true))).toBe(true)
    expect(isAnimated(gif(1, true))).toBe(false)
    // Cut after the first frame, or in the middle of a block: the frames it holds.
    const cut = gif(2)
    expect(isAnimated(cut.subarray(0, 40))).toBe(false)
    expect(isAnimated(cut.subarray(0, 20))).toBe(false)
    expect(isAnimated(new Uint8Array([...ascii("GIF89a"), 1, 0, 1, 0, 0, 0, 0, 0x99]))).toBe(false)
    expect(isAnimated(webp(0x02))).toBe(true)
    expect(isAnimated(webp(0x10))).toBe(false)
    expect(isAnimated(new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]))).toBe(false)
    expect(isAnimated(png(100, true))).toBe(true)
    expect(isAnimated(png(100))).toBe(false)
    expect(isAnimated(png(100).subarray(0, 30))).toBe(false)
    expect(isAnimated(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false)
  })

  it("reads a GIF in time linear in its size", () => {
    // One frame and a million bytes of sub-blocks: every block is skipped by its length.
    const blocks = new Array(4000).fill([255, ...new Array(255).fill(1)]).flat()
    const big = new Uint8Array([...gif(1).subarray(0, -6), ...blocks, 0, 0x3b])
    const t0 = performance.now()
    expect(isAnimated(big)).toBe(false)
    expect(performance.now() - t0).toBeLessThan(200)
  })

  it("encodes at the long edge with the quality of the settings, then lower qualities, then three smaller sizes", () => {
    const s = { maxLongEdge: 1568, quality: 0.85 }
    expect(encodeAttempts(3136, 1000, s, true)).toEqual([
      { width: 1568, height: 500, quality: 0.85 },
      { width: 1568, height: 500, quality: 0.7 },
      { width: 1568, height: 500, quality: 0.55 },
      { width: 1254, height: 400, quality: 0.55 },
      { width: 1004, height: 320, quality: 0.55 },
      { width: 803, height: 256, quality: 0.55 },
    ])
    // A smaller image keeps its size; a low quality of the settings stays the lowest; PNG has no quality to lower.
    expect(encodeAttempts(400, 200, { maxLongEdge: 1568, quality: 0.6 }, true).map((a) => a.quality)).toEqual([0.6, 0.55, 0.55, 0.55, 0.55])
    expect(encodeAttempts(400, 200, { maxLongEdge: 1568, quality: 0.5 }, true)[0]).toEqual({ width: 400, height: 200, quality: 0.5 })
    expect(encodeAttempts(400, 200, s, false)).toEqual([
      { width: 400, height: 200, quality: 0.85 },
      { width: 320, height: 160, quality: 0.85 },
      { width: 256, height: 128, quality: 0.85 },
      { width: 205, height: 102, quality: 0.85 },
    ])
    expect(encodeAttempts(5000, 1, s, true)[5]).toEqual({ width: 803, height: 1, quality: 0.55 })
  })

  it("reads the bytes of a base64 data: URI only", () => {
    expect(dataBytes("data:image/png;base64,AAEC")).toEqual({ bytes: new Uint8Array([0, 1, 2]), type: "image/png" })
    expect(dataBytes("data:IMAGE/JPEG;name=a.jpg;base64,AA\nEC")).toEqual({ bytes: new Uint8Array([0, 1, 2]), type: "image/jpeg" })
    for (const uri of ["data:image/svg+xml,<svg/>", "data:text/plain;base64,AAEC", "data:image/png;base64,A", "mailbox:///x"]) expect(dataBytes(uri)).toBeNull()
  })
})

describe("the codec of the background page", () => {
  afterEach(() => vi.unstubAllGlobals())

  /** createImageBitmap and OffscreenCanvas stand-ins that record their calls. */
  function stubCanvas() {
    const calls: unknown[][] = []
    const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn(() => calls.push(["close", width, height])) })
    vi.stubGlobal("createImageBitmap", vi.fn(async (source: unknown, options?: { resizeWidth: number; resizeHeight: number }) => (calls.push(["createImageBitmap", options ?? null]), options ? bitmap(options.resizeWidth, options.resizeHeight) : (source as object) instanceof Blob ? bitmap(800, 600) : source)))
    class Canvas {
      constructor(readonly width: number, readonly height: number) {
        calls.push(["canvas", width, height])
      }
      getContext() {
        const ctx: Record<string, unknown> = {}
        for (const name of ["fillRect", "drawImage", "fillText"]) ctx[name] = (...args: unknown[]) => calls.push([name, ...args.map((a) => (typeof a === "object" && a ? "bitmap" : a)), ctx.fillStyle])
        return ctx
      }
      async convertToBlob(options: { type: string; quality?: number }) {
        calls.push(["convertToBlob", options])
        return new Blob(["x"], { type: options.type })
      }
    }
    vi.stubGlobal("OffscreenCanvas", Canvas)
    return calls
  }

  it("decodes a blob, scales with high quality and encodes JPEG on white", async () => {
    const calls = stubCanvas()
    const bitmap = await browserCodec.decode(new Blob(["png"]))
    expect([bitmap.width, bitmap.height]).toEqual([800, 600])
    const blob = await browserCodec.encode(bitmap, 400, 300, "image/jpeg", 0.85)
    expect(blob.type).toBe("image/jpeg")
    expect(calls).toEqual([
      ["createImageBitmap", null],
      ["canvas", 400, 300],
      ["fillRect", 0, 0, 400, 300, "#fff"],
      ["createImageBitmap", { resizeWidth: 400, resizeHeight: 300, resizeQuality: "high" }],
      ["drawImage", "bitmap", 0, 0, 400, 300, "#fff"],
      ["close", 400, 300],
      ["convertToBlob", { type: "image/jpeg", quality: 0.85 }],
    ])
  })

  it("draws an image of its own size as it is, and PNG without a ground", async () => {
    const calls = stubCanvas()
    const bitmap = await browserCodec.decode(new Blob(["png"]))
    calls.length = 0
    await browserCodec.encode(bitmap, 800, 600, "image/png", 0.85)
    expect(calls).toEqual([
      ["canvas", 800, 600],
      ["drawImage", "bitmap", 0, 0, 800, 600, undefined],
      ["convertToBlob", { type: "image/png", quality: 0.85 }],
    ])
  })

  it("draws the test image: TEST 42 in black on white, as PNG", async () => {
    const calls = stubCanvas()
    expect((await browserCodec.testImage()).type).toBe("image/png")
    expect(calls).toEqual([["canvas", 160, 48], ["fillRect", 0, 0, 160, 48, "#fff"], ["fillText", "TEST 42", 12, 25, "#000"], ["convertToBlob", { type: "image/png" }]])
  })
})

/** What the model answers about the chart of the tests. */
const TABLE = "| Original | Translation |\n| --- | --- |\n| Umsatz | Revenue |"

/** Precise translation with OpenAI, allowed to receive images, in mode "ask". */
function settingsWithImages(over: (s: Settings) => void = () => {}): Settings {
  const s = createDefaultSettings("en")
  s.tiers.ai = "openai"
  s.providers.openai = { enabled: true, apiKey: "sk-image", baseURL: "", model: "" }
  s.precise.enabled = true
  s.imageConsent = ["openai"]
  s.targetLang = "en"
  over(s)
  // Each with the host it sends to, as the settings record the consent.
  s.imageConsent = allowed(s, ...s.imageConsent)
  return s
}

/** A codec whose decoded images have `size` and whose encoded files have `bytes(attempt)` bytes. */
function fakeCodec(size = { width: 400, height: 200 }, bytes: (width: number, quality: number) => number = () => 2000) {
  const codec = {
    encoded: [] as unknown[][],
    closed: 0,
    decode: vi.fn(async () => ({ ...size, close: () => void codec.closed++ })),
    encode: vi.fn(async (_bitmap: unknown, width: number, height: number, type: string, quality: number) => {
      codec.encoded.push([width, height, type, quality])
      return new Blob([new Uint8Array(bytes(width, quality))], { type })
    }),
    testImage: vi.fn(async () => new Blob([png(200)], { type: "image/png" })),
  }
  return codec
}

/** The image service over `settings`, a message whose part "1.2" is `file`, and a model that answers `answer`. */
function service({ settings = settingsWithImages(), file = new File([png()], "chart.png", { type: "image/png" }), answer = async () => ({ text: TABLE, usage: { input: 1036, output: 80 }, truncated: false }), codec = fakeCodec(), deps = {} }: { settings?: Settings; file?: File; answer?: (image: ImageInput, text: string, opts: LlmCallOptions) => Promise<ImageAnswer>; codec?: ReturnType<typeof fakeCodec>; deps?: Partial<ImageDeps> } = {}) {
  const cache = new PersistentCache(memoryStorage(), 100, 10)
  const read = vi.fn(answer)
  const part = vi.fn(async (_message: number, _part: string) => file)
  const recordConsent = vi.fn(async (ids: string[]) => void (settings.imageConsent = [...settings.imageConsent, ...allowed(settings, ...ids)]))
  const glossary = vi.fn(async (_context: string) => [{ source: "Umsatz", target: "Revenue" }])
  const images = new ImageService({ getSettings: () => settings, cache, read, displayed: async () => 42, part, recordConsent, glossary, codec, sleep: async () => {}, ...deps })
  const ask = (over: Partial<ImageRequest> = {}, session = "s1") => images.request(session, 3, { source: { part: "1.2" }, width: 400, height: 200, index: 1, action: "translate", round: 1, ...over })
  return { images, settings, cache, read, part, codec, recordConsent, glossary, ask }
}

describe("an image request", () => {
  it("sends the image as JPEG with the system prompt, the user text and the options of the image settings, and caches the answer", async () => {
    const { ask, read, part, codec } = service()
    expect(await ask({ action: "peek" })).toEqual({ status: "ready" })
    expect(read).not.toHaveBeenCalled()
    expect(await ask()).toEqual({ status: "done", text: TABLE, service: "OpenAI", cached: false, usage: { input: 1036, output: 80 } })
    expect(part).toHaveBeenCalledWith(42, "1.2")
    expect(codec.encoded).toEqual([[400, 200, "image/jpeg", 0.85]])
    const [image, text, opts] = read.mock.calls[0]
    expect(image).toEqual({ bytes: new Uint8Array(2000), mediaType: "image/jpeg" })
    expect(text).toBe("Image 1 of the email. Target language: English.")
    expect(opts).toMatchObject({ systemPrompt: expect.stringContaining("Output format (follow exactly):"), targetLanguageName: "English", timeoutMs: 90_000, maxOutputTokens: 1024 })
    expect(opts.provider).toMatchObject({ id: "openai", model: "gpt-4.1-mini", thinking: false })
    expect(codec.closed).toBe(1)
    // The cache answers a peek and a request; the image is still read on this computer, nothing is sent.
    expect(await ask({ action: "peek" })).toEqual({ status: "done", text: TABLE, service: "OpenAI", cached: true })
    expect(await ask({ round: 2 })).toEqual({ status: "done", text: TABLE, service: "OpenAI", cached: true })
    expect(read).toHaveBeenCalledTimes(1)
  })

  it("forgets the cached answer for a fresh peek and passes the cache for a fresh request", async () => {
    const { ask, read } = service()
    await ask()
    expect(await ask({ action: "peek", fresh: true })).toEqual({ status: "ready" })
    expect(await ask({ action: "peek" })).toEqual({ status: "ready" })
    await ask({ round: 2 })
    expect((await ask({ round: 3, fresh: true })).status).toBe("done")
    expect(read).toHaveBeenCalledTimes(3)
  })

  it("leaves out small files and animated images quietly, and sends the first frame when the settings ask for it", async () => {
    expect(await service({ file: new File([png(3000)], "a.png", { type: "image/png" }) }).ask()).toEqual({ status: "skipped", reason: ENGLISH.t("imageTooFewBytes"), quiet: true })
    const animated = new File([png(6000, true)], "a.png", { type: "image/png" })
    expect(await service({ file: animated }).ask({ action: "peek" })).toEqual({ status: "skipped", reason: ENGLISH.t("imageAnimated"), quiet: true })
    const firstFrame = service({ file: animated, settings: settingsWithImages((s) => (s.image.animated = "firstFrame")) })
    expect((await firstFrame.ask()).status).toBe("done")
    expect(firstFrame.codec.decode).toHaveBeenCalledTimes(1)
    expect(await service({ settings: settingsWithImages((s) => (s.image.minKB = 0)), file: new File([gif(1)], "a.gif", { type: "image/gif" }) }).ask({ action: "peek" })).toEqual({ status: "ready" })
  })

  it("says it cannot read a part that is no image, a message that is gone, an image that does not decode or encode", async () => {
    const unreadable = { status: "skipped", reason: ENGLISH.t("imageUnreadable") }
    expect(await service({ file: new File(["<html>"], "a.html", { type: "text/html" }) }).ask()).toEqual(unreadable)
    expect(await service({ deps: { displayed: async () => null } }).ask()).toEqual(unreadable)
    expect(await service({ deps: { part: async () => Promise.reject(new Error("no part")) } }).ask()).toEqual(unreadable)
    const broken = fakeCodec()
    broken.decode.mockRejectedValueOnce(new Error("TIFF"))
    expect(await service({ codec: broken }).ask()).toEqual(unreadable)
    const failing = fakeCodec()
    failing.encode.mockRejectedValueOnce(new Error("canvas"))
    const s = service({ codec: failing })
    expect(await s.ask()).toEqual(unreadable)
    expect(failing.closed).toBe(1)
    expect(s.read).not.toHaveBeenCalled()
  })

  it("reads a data: URI without asking Thunderbird, and leaves out one that is not base64", async () => {
    const s = service()
    const data = `data:image/png;base64,${Buffer.from(png()).toString("base64")}`
    expect((await s.ask({ source: { data } })).status).toBe("done")
    expect(s.part).not.toHaveBeenCalled()
    expect(await s.ask({ source: { data: "data:image/svg+xml,<svg/>" } })).toEqual({ status: "skipped", reason: ENGLISH.t("imageUnreadable") })
  })

  it("lowers the quality, then the size, and leaves out an image still above the limit", async () => {
    const codec = fakeCodec({ width: 3136, height: 1000 }, (width, quality) => (width <= 1004 && quality <= 0.55 ? 1000 * 1024 : 2000 * 1024))
    const s = service({ codec })
    expect((await s.ask()).status).toBe("done")
    expect(codec.encoded.map(([w, , , q]) => [w, q])).toEqual([[1568, 0.85], [1568, 0.7], [1568, 0.55], [1254, 0.55], [1004, 0.55]])
    const tooLarge = service({ codec: fakeCodec(undefined, () => 1600 * 1024) })
    expect(await tooLarge.ask()).toEqual({ status: "skipped", reason: ENGLISH.t("imageTooLarge", [1500]) })
    expect(tooLarge.read).not.toHaveBeenCalled()
  })

  it("uploads JPEG to xAI when the settings choose WebP, and sends the detail to OpenAI", async () => {
    const xai = service({ settings: settingsWithImages((s) => ((s.tiers.ai = "xai"), (s.providers.xai = { enabled: true, apiKey: "k", baseURL: "", model: "" }), (s.imageConsent = ["xai"]), (s.image.format = "webp"))) })
    await xai.ask()
    expect(xai.codec.encoded[0][2]).toBe("image/jpeg")
    const openai = service({ settings: settingsWithImages((s) => ((s.image.detail = "high"), (s.image.format = "png"))) })
    await openai.ask()
    expect(openai.read.mock.calls[0][0]).toEqual({ bytes: new Uint8Array(2000), mediaType: "image/png", providerOptions: { openai: { imageDetail: "high" } } })
  })

  it("names an image without text and keeps the mark of an answer cut at its limit, also from the cache", async () => {
    const noText = service({ answer: async () => ({ text: "**NO_TEXT**", truncated: false }) })
    expect(await noText.ask()).toEqual({ status: "noText", service: "OpenAI" })
    expect(await noText.ask({ action: "peek" })).toEqual({ status: "noText", service: "OpenAI" })
    const cut = service({ answer: async () => ({ text: "```markdown\n| a |\n```", truncated: true }) })
    expect(await cut.ask()).toEqual({ status: "done", text: "| a |", service: "OpenAI", cached: false, truncated: true })
    expect(await cut.ask({ action: "peek" })).toEqual({ status: "done", text: "| a |", service: "OpenAI", cached: true, truncated: true })
    // An answer that only looks like the cached form stays as it is.
    const odd = service({ answer: async () => ({ text: '{"text": not JSON', truncated: false }) })
    await odd.ask()
    expect(await odd.ask({ action: "peek" })).toEqual({ status: "done", text: '{"text": not JSON', service: "OpenAI", cached: true })
  })

  it("reads what the answer says", () => {
    expect(readImageAnswer("<think>hm</think>\nNO_TEXT.")).toEqual({ noText: true, text: "NO_TEXT." })
    expect(readImageAnswer("`NO_TEXT`").noText).toBe(true)
    expect(readImageAnswer("NO_TEXT here")).toEqual({ noText: false, text: "NO_TEXT here" })
    expect(readImageAnswer('{"text": broken')).toEqual({ noText: false, text: '{"text": broken' })
  })

  it("fails with the description of the error, and lets the image be sent again", async () => {
    let calls = 0
    const s = service({ answer: async () => (++calls === 1 ? Promise.reject(Object.assign(new Error("Unauthorized: sk-image"), { statusCode: 401 })) : { text: TABLE, truncated: false }) })
    const first = await s.ask()
    expect(first.status).toBe("error")
    expect((first as { error: string }).error).toContain("Unauthorized")
    expect((first as { error: string }).error).not.toContain("sk-image")
    expect((await s.ask()).status).toBe("done")
  })

  it("does nothing while image translation does not apply", async () => {
    const off = { status: "skipped", reason: ENGLISH.t("imageOff"), quiet: true }
    for (const change of [(s: Settings) => (s.image.mode = "off"), (s: Settings) => (s.precise.enabled = false), (s: Settings) => (s.providers.openai.model = "gpt-3.5-turbo-instruct-no"), (s: Settings) => (s.tiers.ai = null)]) {
      const s = service({ settings: settingsWithImages(change) })
      const answer = await s.ask()
      if (answer.status === "done") continue
      expect(answer).toEqual(off)
      expect(s.part).not.toHaveBeenCalled()
    }
    expect(await service({ settings: settingsWithImages((s) => ((s.tiers.ai = "zhipu"), (s.providers.zhipu.enabled = true))) }).ask()).toEqual(off)
  })
})

describe("the cache key of an image", () => {
  const changes: [string, (s: Settings) => void][] = [
    ["output", (s) => (s.image.output = "both")],
    ["images without text", (s) => (s.image.noText = "describe")],
    ["original shown", (s) => (s.image.showSource = false)],
    ["long edge", (s) => (s.image.maxLongEdge = 1024)],
    ["format", (s) => (s.image.format = "png")],
    ["quality", (s) => (s.image.quality = 0.7)],
    ["detail", (s) => (s.image.detail = "low")],
    ["answer length", (s) => (s.image.maxOutputTokens = 512)],
    ["model", (s) => (s.image.model = "gpt-4.1")],
    ["endpoint", (s) => (s.providers.openai.baseURL = "https://proxy.example/v1")],
    ["prompt", (s) => (s.prompts.image = "Read the image for {{to}}.")],
    ["target language", (s) => (s.targetLang = "ja")],
    ["temperature", (s) => (s.providers.openai.temperature = 0.9)],
  ]

  it.each(changes)("changes with the %s", async (_name, change) => {
    const s = service()
    await s.ask()
    change(s.settings)
    expect(await s.ask({ action: "peek" })).toEqual({ status: "ready" })
  })

  it("stays for a filter of the content script and for the limits", async () => {
    const s = service()
    await s.ask()
    Object.assign(s.settings.image, { minSide: 20, maxPerMessage: 1, maxImageKB: 4000, concurrency: 4 })
    expect((await s.ask({ action: "peek" })).status).toBe("done")
  })

  it("holds the message with the context switch on, and the glossary goes with the image", async () => {
    const s = service()
    await s.ask({ context: "mail-1" })
    expect(s.read.mock.calls[0][1]).toBe("Image 1 of the email. Target language: English.\nGlossary, use these translations:\n- Umsatz → Revenue")
    expect(s.glossary).toHaveBeenCalledWith("mail-1")
    expect(await s.ask({ action: "peek", context: "mail-2" })).toEqual({ status: "ready" })
    expect((await s.ask({ action: "peek", context: "mail-1" })).status).toBe("done")
    expect(await s.ask({ action: "peek" })).toEqual({ status: "ready" })
    // Off: one result for the image in every message, and no glossary.
    s.settings.image.useContext = false
    await s.ask({ context: "mail-1", round: 2 })
    expect(s.read.mock.calls[1][1]).toBe("Image 1 of the email. Target language: English.")
    expect((await s.ask({ action: "peek", context: "mail-9" })).status).toBe("done")
    // A failing glossary is no glossary.
    const failing = service({ deps: { glossary: async () => Promise.reject(new Error("gone")) } })
    await failing.ask({ context: "mail-1" })
    expect(failing.read.mock.calls[0][1]).toBe("Image 1 of the email. Target language: English.")
  })
})

describe("the consent for images", () => {
  it("is checked again here: without it nothing is sent, a peek still works", async () => {
    const s = service({ settings: settingsWithImages((x) => (x.imageConsent = [])) })
    expect(await s.ask({ action: "peek" })).toEqual({ status: "ready" })
    const refused = await s.ask()
    expect(refused).toEqual({ status: "error", error: expect.stringContaining(ENGLISH.t("errImageConsent", ["OpenAI"]).split(".")[0]) })
    expect(s.read).not.toHaveBeenCalled()
    // Recorded in the settings, then sent.
    await s.images.grant("s1", ["openai"], false)
    expect(s.recordConsent).toHaveBeenCalledWith(["openai"])
    expect((await s.ask()).status).toBe("done")
    // Taken back on the settings page: asked again.
    s.settings.imageConsent = []
    expect((await s.ask({ round: 2, fresh: true })).status).toBe("error")
  })

  it("holds for one message only with \"confirm each message\", even for a service allowed before", async () => {
    const s = service({ settings: settingsWithImages((x) => (x.image.confirmEachMessage = true)) })
    expect((await s.ask()).status).toBe("error")
    await s.images.grant("s1", ["openai"], true)
    expect(s.recordConsent).not.toHaveBeenCalled()
    expect((await s.ask()).status).toBe("done")
    // Another content script, another message: asked again.
    expect((await s.ask({ round: 1, fresh: true }, "s2")).status).toBe("error")
    s.images.forget("s1")
    expect((await s.ask({ fresh: true })).status).toBe("error")
  })

  it("B1: is checked again when the request leaves the queue: an image waiting there is not sent after the consent went", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const s = service({ settings: settingsWithImages((x) => (x.image.concurrency = 1)) })
    s.read.mockImplementationOnce(async () => {
      await gate
      return { text: TABLE, truncated: false }
    })
    const first = s.ask()
    await until(() => expect(s.read).toHaveBeenCalledTimes(1))
    const second = s.ask({ source: { data: `data:image/png;base64,${Buffer.from(png(6000)).toString("base64")}` }, index: 2 })
    await new Promise((r) => setTimeout(r, 20))
    s.settings.imageConsent = []
    release()
    expect((await first).status).toBe("done")
    expect(await second).toEqual({ status: "error", error: expect.stringContaining(ENGLISH.t("errImageConsent", ["OpenAI"]).split(".")[0]) })
    expect(s.read).toHaveBeenCalledTimes(1)
  })

  it("needs access to the endpoint of the service", async () => {
    const s = service({ deps: { hasOrigin: async () => false } })
    expect((await s.ask()) as { error: string }).toMatchObject({ status: "error", error: expect.stringContaining("api.openai.com") })
    const failing = service({ deps: { hasOrigin: async () => Promise.reject(new Error("no API")) } })
    expect((await failing.ask()).status).toBe("error")
    expect((await service({ deps: { hasOrigin: async () => true } }).ask()).status).toBe("done")
  })
})

describe("the limits of a message", () => {
  const files = new Map<string, File>()
  const fileOf = (part: string) => {
    if (!files.has(part)) files.set(part, new File([png(5000 + Number(part.split(".").at(-1)))], `${part}.png`, { type: "image/png" }))
    return files.get(part)!
  }

  it("send at most the images per message of the settings in a round, and as many again in the next", async () => {
    const s = service({ settings: settingsWithImages((x) => (x.image.maxPerMessage = 2)), deps: { part: async (_m, part) => fileOf(part) } })
    const answers = await Promise.all(["1.2", "1.3", "1.4"].map((part, i) => s.ask({ source: { part }, index: i + 1 })))
    // They arrive at the same time: which one is left out depends on the order their bytes are read in.
    expect(answers.map((a) => a.status).sort()).toEqual(["done", "done", "skipped"])
    const left = answers.findIndex((a) => a.status === "skipped")
    expect(answers[left]).toEqual({ status: "skipped", reason: ENGLISH.t("imageLimitCount", [2]) })
    expect((await s.ask({ source: { part: `1.${left + 2}` }, round: 2 })).status).toBe("done")
    // One after the other, the third is left out before it is decoded.
    const decoded = s.codec.decode.mock.calls.length
    await s.ask({ source: { part: "1.5" }, round: 3 })
    await s.ask({ source: { part: "1.6" }, round: 3 })
    expect(await s.ask({ source: { part: "1.7" }, round: 3 })).toEqual({ status: "skipped", reason: ENGLISH.t("imageLimitCount", [2]) })
    expect(s.codec.decode.mock.calls.length).toBe(decoded + 2)
  })

  it("count the copies of one image once, and send them once", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const s = service({ settings: settingsWithImages((x) => (x.image.maxPerMessage = 1)), answer: async () => (await gate, { text: TABLE, truncated: false }) })
    const both = Promise.all([s.ask({ index: 1 }), s.ask({ source: { part: "1.5" }, index: 2 })])
    await until(() => expect(s.read).toHaveBeenCalledTimes(1))
    release()
    expect((await both).map((a) => a.status)).toEqual(["done", "done"])
    expect(s.read).toHaveBeenCalledTimes(1)
  })

  it("stop at the bytes per message", async () => {
    const s = service({ settings: settingsWithImages((x) => (x.image.maxMessageMB = 1)), codec: fakeCodec(undefined, () => 600 * 1024), deps: { part: async (_m, part) => fileOf(part) } })
    expect((await s.ask({ source: { part: "2.1" } })).status).toBe("done")
    expect(await s.ask({ source: { part: "2.2" } })).toEqual({ status: "skipped", reason: ENGLISH.t("imageLimitBytes", [1]) })
  })

  it("send the images through a queue of their own with the concurrency of the image settings", async () => {
    let running = 0
    let most = 0
    const s = service({
      settings: settingsWithImages((x) => (x.image.concurrency = 2)),
      deps: { part: async (_m, part) => fileOf(part) },
      answer: async () => {
        most = Math.max(most, ++running)
        await nextTask()
        running--
        return { text: TABLE, truncated: false }
      },
    })
    await Promise.all(["3.1", "3.2", "3.3", "3.4"].map((part) => s.ask({ source: { part } })))
    expect(most).toBe(2)
  })

  it("give local models three times the timeout", async () => {
    const s = service({ settings: settingsWithImages((x) => ((x.tiers.ai = "ollama"), (x.providers.ollama = { enabled: true, apiKey: "", baseURL: "", model: "qwen3-vl:8b" }), (x.imageConsent = ["ollama"]))) })
    await s.ask()
    expect(s.read.mock.calls[0][2].timeoutMs).toBe(270_000)
  })
})

describe("the test image", () => {
  const config = { apiKey: "sk-test", baseURL: "", model: "" }

  it("passes when the answer names 42, with the model of the field and without thinking", async () => {
    const s = service({ answer: async () => ({ text: "| TEST 42 | TEST 42 |", truncated: false }) })
    expect(await s.images.test("openai", { ...config, thinking: true }, "gpt-4.1")).toBe("| TEST 42 | TEST 42 |")
    const [image, text, opts] = s.read.mock.calls[0]
    expect(image.mediaType).toBe("image/png")
    expect(text).toBe("Image 1 of the email. Target language: English.")
    expect(opts.provider).toMatchObject({ model: "gpt-4.1", thinking: false, apiKey: "sk-test" })
    await s.images.test("openai", config, " ")
    expect(s.read.mock.calls[1][2].provider.model).toBe("gpt-4.1-mini")
  })

  it("fails with the answer, or with the description of the error without the key", async () => {
    await expect(service({ answer: async () => ({ text: "TEST 4Z", truncated: false }) }).images.test("openai", config, "")).rejects.toThrow(ENGLISH.t("errTestImage", ["TEST 4Z"]))
    const error = await service({ answer: async () => Promise.reject(Object.assign(new Error("bad key sk-test"), { statusCode: 401 })) }).images.test("openai", config, "").catch((e: Error) => e.message)
    expect(error).toContain("bad key")
    expect(error).not.toContain("sk-test")
    await expect(service({ deps: { hasOrigin: async () => false } }).images.test("openai", config, "")).rejects.toThrow(/api\.openai\.com/)
  })
})

describe("the request of the AI SDK", () => {
  /** Records the body of the request and answers in the form of the API. */
  function recorder(answer: (url: string) => Response) {
    const bodies: Record<string, unknown>[] = []
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return answer(String(input))
    }) as typeof fetch
    return { bodies, fetchFn }
  }
  const image = (providerOptions?: ImageInput["providerOptions"]): ImageInput => ({ bytes: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg", ...(providerOptions ? { providerOptions } : {}) })
  const opts = (id: string, fetchFn: typeof fetch, model = ""): LlmCallOptions => ({
    provider: { ...resolveProviderConfig(id, { apiKey: "k", baseURL: id === "custom" ? "https://llm.example/v1" : "", model: model || (id === "custom" ? "m" : "") }), thinking: false },
    systemPrompt: "Read it.",
    targetLanguageName: "English",
    fetchFn,
  })

  it("puts the image as a data URL into the content of an OpenAI-compatible request, with the text after it", async () => {
    const { bodies, fetchFn } = recorder(() => chatCompletion(TABLE))
    expect(await llmReadImage(image(), "Image 1.", opts("custom", fetchFn))).toEqual({ text: TABLE, truncated: false, usage: { input: 1, output: 1 } })
    expect((bodies[0].messages as unknown[])[1]).toEqual({ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AQID" } }, { type: "text", text: "Image 1." }] })
    expect((bodies[0].messages as { content: string }[])[0].content).toBe("Read it.")
  })

  it("writes the detail of OpenAI into the image, and the string image_url of Mistral", async () => {
    const openai = recorder(() => chatCompletion(TABLE))
    await llmReadImage(image({ openai: { imageDetail: "high" } }), "Image 1.", opts("openai", openai.fetchFn))
    expect(JSON.stringify(openai.bodies[0])).toContain('"image_url":{"url":"data:image/jpeg;base64,AQID","detail":"high"}')
    const mistral = recorder(() => chatCompletion(TABLE))
    await llmReadImage(image(), "Image 1.", opts("mistral", mistral.fetchFn))
    expect(JSON.stringify(mistral.bodies[0])).toContain('"image_url":"data:image/jpeg;base64,AQID"')
  })

  it("sends an image block to Anthropic and inline data to Gemini", async () => {
    const anthropic = recorder(() => anthropicMessage(TABLE))
    await llmReadImage(image(), "Image 1.", opts("anthropic", anthropic.fetchFn))
    expect(JSON.stringify(anthropic.bodies[0])).toContain('{"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"AQID"}}')
    const gemini = recorder(() => jsonResponse({ candidates: [{ content: { role: "model", parts: [{ text: TABLE }] }, finishReason: "MAX_TOKENS" }], usageMetadata: { promptTokenCount: 520, candidatesTokenCount: 30, totalTokenCount: 550 } }))
    expect(await llmReadImage(image(), "Image 1.", opts("gemini", gemini.fetchFn))).toEqual({ text: TABLE, truncated: true, usage: { input: 520, output: 30 } })
    expect(JSON.stringify(gemini.bodies[0])).toContain('"inlineData":{"mimeType":"image/jpeg","data":"AQID"}')
  })

  it("rejects an empty answer", async () => {
    const { fetchFn } = recorder(() => chatCompletion("  "))
    await expect(llmReadImage(image(), "Image 1.", opts("custom", fetchFn))).rejects.toThrow(/empty/i)
  })
})

describe("the Port and the other requests", () => {
  it("serves the images of a content script in its own session, after the consent it sent first", async () => {
    stubBrowser()
    const order: string[] = []
    const image = vi.fn(async (session: string, tabId: number, req: ImageRequest): Promise<ImageResponse> => (order.push(`image ${session} ${tabId} ${req.index}`), { status: "ready" }))
    const imageConsent = vi.fn(async (session: string, ids: string[], message: boolean) => {
      await nextTask()
      order.push(`consent ${session} ${ids} ${message}`)
    })
    const forgetSession = vi.fn()
    const tabs = createTabRegistry({ ready: async () => {}, publicSettings: () => toPublicSettings(createDefaultSettings()), setContext: () => {}, translate: async () => {}, subject: async () => null, summarize: async () => ({ ok: false, error: "" }), image, imageConsent, forgetSession })
    const port = backgroundPort(5)
    tabs.connect(port as unknown as browser.runtime.Port)
    port.send({ type: "imageConsent", ids: ["openai"], message: true })
    port.send({ type: "image", id: 7, image: { source: { part: "1.2" }, width: 400, height: 200, index: 1, action: "translate", round: 1 } })
    await until(() => expect(port.posted.at(-1)).toEqual({ type: "imageResult", id: 7, result: { status: "ready" } }))
    expect(order).toEqual(["consent 5:1 openai true", "image 5:1 5 1"])
    port.send({ type: "imageConsent", ids: ["gemini"] })
    await until(() => expect(imageConsent).toHaveBeenLastCalledWith("5:1", ["gemini"], false))
    // A second content script of the tab is a session of its own; a failing consent does not block the images.
    imageConsent.mockRejectedValueOnce(new Error("storage"))
    const second = backgroundPort(5)
    tabs.connect(second as unknown as browser.runtime.Port)
    second.send({ type: "imageConsent", ids: ["openai"] })
    second.send({ type: "image", id: 8, image: { source: { data: "data:image/png;base64,AA==" }, width: 400, height: 200, index: 1, action: "peek", round: 1 } })
    await until(() => expect(second.posted.at(-1)).toMatchObject({ type: "imageResult", id: 8 }))
    expect(image).toHaveBeenLastCalledWith("5:2", 5, expect.objectContaining({ action: "peek" }))
    port.disconnect()
    expect(forgetSession).toHaveBeenCalledWith("5:1")
  })

  it("answers an image request it cannot serve with an error: a page of the extension, a failing service, no image service", async () => {
    stubBrowser()
    const failing = vi.fn(async (): Promise<ImageResponse> => Promise.reject(new Error("boom")))
    const deps = { ready: async () => {}, publicSettings: () => toPublicSettings(createDefaultSettings()), setContext: () => {}, translate: async () => {}, subject: async () => null, summarize: async () => ({ ok: false as const, error: "" }) }
    const request = { type: "image" as const, id: 1, image: { source: { part: "1.2" }, width: 1, height: 1, index: 1, action: "peek" as const, round: 1 } }
    const tabs = createTabRegistry({ ...deps, image: failing })
    const page = backgroundPort(5, undefined, "moz-extension://test/welcome.html")
    tabs.connect(page as unknown as browser.runtime.Port)
    page.send(request)
    page.send({ type: "imageConsent", ids: ["openai"] })
    const script = backgroundPort(6)
    tabs.connect(script as unknown as browser.runtime.Port)
    script.send(request)
    const bare = createTabRegistry(deps)
    const other = backgroundPort(7)
    bare.connect(other as unknown as browser.runtime.Port)
    other.send(request)
    other.send({ type: "imageConsent", ids: ["openai"] })
    const error = { type: "imageResult", id: 1, result: { status: "error", error: ENGLISH.t("errUnknown") } }
    for (const port of [page, script, other]) await until(() => expect(port.posted.at(-1)).toEqual(error))
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it("runs the test image for the settings page", async () => {
    stubBrowser()
    const test = vi.fn(async () => "TEST 42")
    const deps = { tabs: { postToTab: vi.fn(), stateOf: vi.fn(), broadcast: vi.fn() }, service: { testProvider: vi.fn() }, localeMessages: vi.fn(), offlineManager: vi.fn(), offlineStatus: vi.fn(), cache: { clear: vi.fn(), size: vi.fn() } } as unknown as Parameters<typeof createHandlers>[0]
    const req = { type: "testVision" as const, providerId: "openai", config: { enabled: true, apiKey: "k", baseURL: "", model: "" }, model: "gpt-4.1" }
    expect(await createHandlers({ ...deps, images: { test } }).testVision(req)).toEqual({ ok: true, text: "TEST 42" })
    expect(test).toHaveBeenCalledWith("openai", req.config, "gpt-4.1")
    test.mockRejectedValueOnce(new Error("The answer does not contain 42"))
    expect(await createHandlers({ ...deps, images: { test } }).testVision(req)).toEqual({ ok: false, error: expect.stringContaining("does not contain 42") })
    expect(await createHandlers(deps).testVision(req)).toEqual({ ok: false, error: ENGLISH.t("errUnknown") })
  })

  it("reads the id of the displayed message and a part of it through the mail APIs", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" })
    const getDisplayedMessage = vi.fn(async (tabId: number) => (tabId === 1 ? { id: 42 } : null))
    const getAttachmentFile = vi.fn(async () => file)
    vi.stubGlobal("browser", { messageDisplay: { getDisplayedMessage }, messages: { getAttachmentFile } })
    expect(await displayedMessageId(1)).toBe(42)
    expect(await displayedMessageId(2)).toBeNull()
    expect(await messagePart(42, "1.2")).toBe(file)
    expect(getAttachmentFile).toHaveBeenCalledWith(42, "1.2")
  })

  it("forgets a cached entry, and does nothing with the cache off", async () => {
    const cache = new PersistentCache(memoryStorage(), 10, 1)
    await cache.set("a", "1")
    await cache.delete("a")
    expect(await cache.get("a")).toBeUndefined()
    cache.configure(false, 10)
    await cache.delete("a")
    expect(await cache.size()).toBe(0)
  })

  it("lends the glossary of the analysis of a registered message, and none without one", async () => {
    const settings = createDefaultSettings("en")
    settings.tiers.ai = "openai"
    settings.providers.openai = { enabled: true, apiKey: "k", baseURL: "", model: "" }
    settings.precise.enabled = true
    const analyze = vi.fn(async () => ({ summary: "S", tone: "", glossary: [{ source: "Acme", target: "アクメ" }] }))
    const { service: translation } = createService(settings, { llm: { analyze, batch: async (segments) => segments.map((s) => s.text), single: async (s) => s.text } })
    settings.batch.maxCharsPerBatch = 200
    const paragraphs = Array.from({ length: 4 }, (_, i) => `${"Paragraph text ".repeat(10)}${i}`)
    const context = createMailContext(paragraphs, [0, 1, 2, 3])
    expect(await translation.glossaryOf(context.id)).toEqual([])
    translation.setContext(context)
    expect(await translation.glossaryOf(context.id)).toEqual([])
    await translation.translateForPage({ text: paragraphs[0], sourceLang: settings.sourceLang, targetLang: settings.targetLang, tiers: ["ai"], context: { id: context.id, index: 0 } }, () => {})
    expect(await translation.glossaryOf(context.id)).toEqual([{ source: "Acme", target: "アクメ" }])
    expect(defaultImageSettings().useContext).toBe(true)
  })
})
