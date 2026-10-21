/**
 * The text in the images of a displayed message, read by an AI service.
 *
 *   request(image) → bytes of the part (messages.getAttachmentFile) or of the data: URI
 *     → filters on the bytes (size, animation) → SHA-256 → cache
 *     → consent → limits of the message → decode, scale, encode → queue image:<service> → the model
 *
 * The content script hands over an image that passed its own filters (shared/image.ts) and asks either to "peek",
 * which reads the image on this computer only, to know whether a result is cached and whether the image passes the
 * filters on its bytes, or to "translate", which sends it. Nothing leaves the computer before the user allowed the
 * service to receive images (Settings.imageConsent, or for the message alone with "confirm each message"), which is
 * checked here again whatever the content script says.
 *
 * The upload is the image scaled to its long edge and encoded again (JPEG by default, on white, so transparent
 * areas stay light), which drops its file name and metadata. One image goes in each request, in a request queue of its
 * own per service, so slow image requests never hold back the paragraphs. A result is cached under the SHA-256 of the
 * original bytes and every setting that changes what the model sees or answers; with "use message context" also
 * under the message, whose glossary goes with the image. The limits per message (images, bytes) count per
 * translation of a message: a content script counts its rounds, and copies of one image count once.
 */

import { describeError, LocalizedError } from "../shared/errors"
import { hashText, sha256Hex } from "../shared/hash"
import { patternHost, providerOrigin } from "../shared/hosts"
import { ENGLISH, type I18n, type MessageKey } from "../shared/i18n"
import { getLanguage } from "../shared/languages"
import type { ImageRequest, ImageResponse } from "../shared/messages"
import { promptText } from "../shared/prompts"
import { getPreset, providerDisplayName } from "../shared/providers"
import { imageStatus, type ImageSettings, type ProviderConfig, type ResolvedProvider, resolveProviderConfig, resolveVisionProvider, type Settings } from "../shared/settings"
import { imageDetailOptions, uploadFormat } from "../shared/vision"
import { cacheKey, LruCache, type PersistentCache } from "./cache"
import { buildImageSystem, buildImageUserText, imageOutputTokens } from "../shared/image-prompt"
import { RequestQueue } from "./queue/request-queue"
import { errorContext, LAZY_LLM } from "./service"
import type { ImageAnswer, ImageInput, LlmCallOptions } from "./translators/llm"
import { cleanSingleOutput, type MailAnalysis } from "./translators/llm-prompt"

/** A decoded image. */
export interface Bitmap {
  width: number
  height: number
  close(): void
}

/** Decoding and encoding of images; the background page's createImageBitmap() and OffscreenCanvas by default. */
export interface ImageCodec {
  decode(blob: Blob): Promise<Bitmap>
  /** `bitmap` scaled to width × height and encoded; JPEG on a white ground. */
  encode(bitmap: Bitmap, width: number, height: number, type: string, quality: number): Promise<Blob>
  /** The test image: "TEST 42" in black on white, 160 × 48 px, as PNG. */
  testImage(): Promise<Blob>
}

export const browserCodec: ImageCodec = {
  decode: (blob) => createImageBitmap(blob),
  async encode(bitmap, width, height, type, quality) {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext("2d")!
    if (type === "image/jpeg") {
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, width, height)
    }
    const source = bitmap as ImageBitmap
    const scaled = width === bitmap.width && height === bitmap.height ? source : await createImageBitmap(source, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" })
    ctx.drawImage(scaled, 0, 0, width, height)
    if (scaled !== source) scaled.close()
    return canvas.convertToBlob({ type, quality })
  },
  testImage() {
    const canvas = new OffscreenCanvas(160, 48)
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, 160, 48)
    ctx.fillStyle = "#000"
    ctx.font = "bold 30px sans-serif"
    ctx.textBaseline = "middle"
    ctx.fillText("TEST 42", 12, 25)
    return canvas.convertToBlob({ type: "image/png" })
  },
}

/** One size and quality to encode an image with. */
export interface EncodeAttempt {
  width: number
  height: number
  quality: number
}

/** Rounds of scaling down by 0.8 after the lowest quality, before an image that is still too large is left out. */
const SCALE_ROUNDS = 3

/**
 * The attempts to encode an image of width × height within the limit of one image, in order: at the long edge of
 * the settings (never larger than the image) with the quality of the settings, then 0.7 and 0.55 for the lossy
 * formats, then three times 0.8 of the size before.
 */
export function encodeAttempts(width: number, height: number, { maxLongEdge, quality }: Pick<ImageSettings, "maxLongEdge" | "quality">, lossy: boolean): EncodeAttempt[] {
  const fit = Math.min(1, maxLongEdge / Math.max(width, height))
  const size = (f: number) => ({ width: Math.max(1, Math.round(width * f)), height: Math.max(1, Math.round(height * f)) })
  const qualities = lossy ? [quality, ...[0.7, 0.55].filter((q) => q < quality)] : [quality]
  const attempts = qualities.map((q) => ({ ...size(fit), quality: q }))
  for (let round = 1; round <= SCALE_ROUNDS; round++) attempts.push({ ...size(fit * 0.8 ** round), quality: qualities.at(-1)! })
  return attempts
}

/**
 * Whether the bytes are an animated image, read from the content, never from a name: a GIF with a second image
 * descriptor (the blocks are skipped by their lengths, so the scan takes time linear in the size), a WebP whose VP8X
 * chunk has the animation flag, a PNG with an acTL chunk before its image data (APNG). A truncated file counts the
 * frames it holds.
 */
export function isAnimated(bytes: Uint8Array): boolean {
  const ascii = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))
  if (ascii(0, 3) === "GIF") return gifFrames(bytes) > 1
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return ascii(12, 4) === "VP8X" && ((bytes[20] ?? 0) & 0x02) !== 0
  if (bytes[0] === 0x89 && ascii(1, 3) === "PNG") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let at = 8; at + 8 <= bytes.length; ) {
      const type = ascii(at + 4, 4)
      if (type === "acTL") return true
      if (type === "IDAT") return false
      at += 12 + view.getUint32(at)
    }
  }
  return false
}

/** The image descriptors of a GIF, up to two. */
function gifFrames(bytes: Uint8Array): number {
  const table = (packed: number) => (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0)
  /** The position after the data sub-blocks that start at `at`. */
  const skipBlocks = (at: number) => {
    while (at < bytes.length && bytes[at] !== 0) at += bytes[at] + 1
    return at + 1
  }
  let frames = 0
  let at = 13 + table(bytes[10] ?? 0)
  while (at < bytes.length && frames < 2) {
    const block = bytes[at]
    if (block === 0x21) at = skipBlocks(at + 2)
    else if (block === 0x2c) {
      frames++
      at = skipBlocks(at + 11 + table(bytes[at + 9] ?? 0))
    } else break
  }
  return frames
}

/** The bytes and media type of a data: URI; null unless it is base64. */
export function dataBytes(uri: string): { bytes: Uint8Array; type: string } | null {
  const m = /^data:(image\/[\w.+-]+)(?:;[\w-]+=[^;,]*)*;base64,([A-Za-z0-9+/=\s]*)$/i.exec(uri)
  if (!m) return null
  try {
    return { bytes: Uint8Array.from(atob(m[2].replace(/\s+/g, "")), (c) => c.charCodeAt(0)), type: m[1].toLowerCase() }
  } catch {
    return null
  }
}

/** What an answer says: the Markdown, without reasoning blocks and an enclosing fence; noText when it is NO_TEXT alone (in bold, quotes or a fence too). */
export function readImageAnswer(raw: string): { noText: boolean; text: string } {
  const text = cleanSingleOutput(raw)
  return { noText: /^[\s`*"'.]*NO_TEXT[\s`*"'.]*$/.test(text), text }
}

/** A cached answer: the text, or for an answer cut at the length limit the text and the mark in JSON, so the result says so also from the cache. */
const toCache = ({ text, truncated }: ImageAnswer) => (truncated ? JSON.stringify({ text, truncated }) : text)

function fromCache(stored: string): { text: string; truncated: boolean } {
  if (!stored.startsWith('{"text":')) return { text: stored, truncated: false }
  try {
    const { text, truncated } = JSON.parse(stored) as { text: string; truncated: boolean }
    return { text, truncated }
  } catch {
    return { text: stored, truncated: false }
  }
}

/** What one translation of a message has sent: images and bytes, and the requests by cache key, which copies of an image share. */
interface Round {
  number: number
  uploads: number
  bytes: number
  running: Map<string, Promise<ImageResponse>>
}

/** A content script: the round it is in, and the services allowed for its message only. */
interface Session {
  round: Round
  allowed: Set<string>
}

export interface ImageDeps {
  getSettings: () => Settings
  cache: PersistentCache
  fetchFn?: typeof fetch
  /** Reads an image with the AI SDK (translators/llm.ts); by default the SDK loaded on first use. */
  read?: (image: ImageInput, text: string, opts: LlmCallOptions) => Promise<ImageAnswer>
  /** The id of the message displayed in a tab; null without one. */
  displayed: (tabId: number) => Promise<number | null>
  /** A part of a message (messages.getAttachmentFile()). */
  part: (messageId: number, partName: string) => Promise<File>
  /** Records the services the user allowed to receive images (Settings.imageConsent). */
  recordConsent: (ids: string[]) => Promise<void>
  /** The glossary of the analysis precise translation made of the registered message `contextId`; empty without one. */
  glossary: (contextId: string) => Promise<MailAnalysis["glossary"]>
  codec?: ImageCodec
  hasOrigin?: (origin: string) => Promise<boolean>
  i18n?: () => I18n
  sleep?: (ms: number) => Promise<void>
}

/** Local models answer slowly: their requests get this multiple of the timeout, as for text. */
const SLOW_MODEL_TIMEOUT_FACTOR = 3

/** Content scripts whose rounds and consent are kept; one per displayed message. */
const MAX_SESSIONS = 50

export class ImageService {
  private readonly queues = new Map<string, RequestQueue>()
  private readonly sessions = new LruCache<Session>(MAX_SESSIONS)
  private readonly codec: ImageCodec
  private readonly read: NonNullable<ImageDeps["read"]>

  constructor(private readonly deps: ImageDeps) {
    this.codec = deps.codec ?? browserCodec
    this.read = deps.read ?? LAZY_LLM.readImage
  }

  private get i18n(): I18n {
    return this.deps.i18n?.() ?? ENGLISH
  }

  private session(id: string): Session {
    let session = this.sessions.get(id)
    if (!session) this.sessions.set(id, (session = { round: { number: -1, uploads: 0, bytes: 0, running: new Map() }, allowed: new Set() }))
    return session
  }

  /** The content script `session` went away. */
  forget(session: string): void {
    this.sessions.delete(session)
  }

  /** The user allowed `ids` to receive images: for the message of `session` only, or recorded in the settings. */
  async grant(session: string, ids: string[], messageOnly: boolean): Promise<void> {
    if (messageOnly) for (const id of ids) this.session(session).allowed.add(id)
    else await this.deps.recordConsent(ids)
  }

  private queue(id: string): RequestQueue {
    const key = `image:${id}`
    let queue = this.queues.get(key)
    if (!queue) {
      const settings = () => this.deps.getSettings()
      // A model that was too slow once is too slow again, and every attempt is charged.
      queue = new RequestQueue({ concurrency: () => settings().image.concurrency, maxRetries: () => settings().batch.maxRetries, timeoutRetries: 0, sleep: this.deps.sleep })
      this.queues.set(key, queue)
    }
    return queue
  }

  private options(provider: ResolvedProvider, settings: Settings, systemPrompt: string): LlmCallOptions {
    const local = getPreset(provider.id)?.nameKey === "providerLocal"
    return {
      provider,
      systemPrompt,
      targetLanguageName: getLanguage(settings.targetLang).english,
      fetchFn: this.deps.fetchFn,
      timeoutMs: settings.image.timeoutSeconds * 1000 * (local ? SLOW_MODEL_TIMEOUT_FACTOR : 1),
      maxOutputTokens: imageOutputTokens(settings.image),
    }
  }

  /** Throws errHostPermission when the extension may not connect to the endpoint of `provider`. */
  private async checkOrigin(provider: ResolvedProvider): Promise<void> {
    const origin = providerOrigin(provider)
    if (!origin || !this.deps.hasOrigin) return
    if (!(await this.deps.hasOrigin(origin).catch(() => false))) throw new LocalizedError("errHostPermission", [patternHost(origin)])
  }

  private skipped(key: MessageKey, args: (string | number)[] = [], quiet = false): ImageResponse {
    return { status: "skipped", reason: this.i18n.t(key, args), ...(quiet ? { quiet: true as const } : {}) }
  }

  /** The original bytes of the image of `req`, or why it cannot be read. */
  private async bytesOf(tabId: number, req: ImageRequest): Promise<{ bytes: Uint8Array; type: string } | null> {
    if ("data" in req.source) return dataBytes(req.source.data)
    const message = await this.deps.displayed(tabId)
    if (message === null) return null
    const file = await this.deps.part(message, req.source.part)
    // The part number of the address must name an image part of the message.
    if (!file.type.startsWith("image/")) return null
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type }
  }

  /** An image request of the content script `session` in tab `tabId`. */
  async request(session: string, tabId: number, req: ImageRequest): Promise<ImageResponse> {
    const settings = this.deps.getSettings()
    const status = imageStatus(settings)
    if (!status.active || settings.image.mode === "off" || !status.id) return this.skipped("imageOff", [], true)
    const id = status.id
    const s = settings.image
    const provider = resolveVisionProvider(settings, id)
    const service = providerDisplayName(getPreset(id)!, this.i18n)
    try {
      const original = await this.bytesOf(tabId, req).catch(() => null)
      if (!original) return this.skipped("imageUnreadable")
      if (original.bytes.length < s.minKB * 1024) return this.skipped("imageTooFewBytes", [], true)
      const animated = isAnimated(original.bytes)
      if (animated && s.animated === "skip") return this.skipped("imageAnimated", [], true)
      const targetName = getLanguage(settings.targetLang).english
      const systemPrompt = buildImageSystem(promptText(settings.prompts, "image"), targetName, s)
      const format = uploadFormat(id, `image/${s.format}`)
      const context = s.useContext && req.context ? req.context : ""
      const variant = hashText([provider.baseURL, systemPrompt, s.output, s.noText, s.showSource, s.maxLongEdge, format, s.quality, s.detail, s.maxOutputTokens, provider.temperature, context].join("\n"))
      const key = cacheKey(`image:${id}`, provider.model, `auto>${settings.targetLang}`, await sha256Hex(original.bytes), variant)
      if (req.action === "peek") {
        if (req.fresh) {
          await this.deps.cache.delete(key)
          return { status: "ready" }
        }
        const cached = await this.deps.cache.get(key)
        return cached === undefined ? { status: "ready" } : this.answer(cached, service, true)
      }
      const sessionState = this.session(session)
      const allowed = s.confirmEachMessage ? sessionState.allowed.has(id) : settings.imageConsent.includes(id)
      if (!allowed) throw new LocalizedError("errImageConsent", [service])
      await this.checkOrigin(provider)
      const cached = req.fresh ? undefined : await this.deps.cache.get(key)
      if (cached !== undefined) return this.answer(cached, service, true)
      if (sessionState.round.number !== req.round) sessionState.round = { number: req.round, uploads: 0, bytes: 0, running: new Map() }
      const round = sessionState.round
      const running = round.running.get(key)
      if (running) return await running
      const started = this.send({ ...original, animated }, req, { settings, provider, key, round, systemPrompt, format, context, service })
      round.running.set(key, started)
      return await started
    } catch (error) {
      return { status: "error", error: describeError(error, this.i18n, errorContext(provider)) }
    }
  }

  /** An answer of the model, or a cached one, as the content script gets it; usage only for an answer that just came. */
  private answer(stored: string, service: string, cached: boolean, usage?: ImageAnswer["usage"]): ImageResponse {
    const { text: raw, truncated } = fromCache(stored)
    const { noText, text } = readImageAnswer(raw)
    if (noText) return { status: "noText", service }
    return { status: "done", text, service, cached, ...(usage ? { usage } : {}), ...(truncated ? { truncated: true } : {}) }
  }

  /** Prepare the image within the limits of the message and of one image, send it, cache the answer. */
  private async send(
    original: { bytes: Uint8Array; type: string; animated: boolean },
    req: ImageRequest,
    job: { settings: Settings; provider: ResolvedProvider; key: string; round: Round; systemPrompt: string; format: string; context: string; service: string },
  ): Promise<ImageResponse> {
    const { settings, provider, round } = job
    const s = settings.image
    if (round.uploads >= s.maxPerMessage) return this.skipped("imageLimitCount", [s.maxPerMessage])
    const upload = await this.prepare(original, job.format, s)
    if (!upload) return this.skipped("imageUnreadable")
    if (upload === "large") return this.skipped("imageTooLarge", [s.maxImageKB])
    // Counted before the answer: the images of a message go out at the same time.
    if (round.uploads >= s.maxPerMessage) return this.skipped("imageLimitCount", [s.maxPerMessage])
    if (round.bytes + upload.bytes.length > s.maxMessageMB * 1024 * 1024) return this.skipped("imageLimitBytes", [s.maxMessageMB])
    round.uploads++
    round.bytes += upload.bytes.length
    const glossary = job.context ? await this.deps.glossary(job.context).catch(() => []) : []
    const text = buildImageUserText(req.index, getLanguage(settings.targetLang).english, glossary)
    const options = imageDetailOptions(provider.id, s.detail)
    const image: ImageInput = { bytes: upload.bytes, mediaType: upload.type, ...(options ? { providerOptions: options } : {}) }
    try {
      const answer = await this.queue(provider.id).run(() => this.read(image, text, this.options(provider, settings, job.systemPrompt)))
      const stored = toCache(answer)
      await this.deps.cache.set(job.key, stored)
      return this.answer(stored, job.service, false, answer.usage)
    } catch (error) {
      // A failed request may be tried again within the limits.
      round.uploads--
      round.bytes -= upload.bytes.length
      round.running.delete(job.key)
      throw error
    }
  }

  /**
   * The image decoded (an animated one to its first frame), scaled and encoded in `format` within the limit of one
   * image: null when it cannot be decoded, "large" when the smallest attempt is still too large.
   */
  private async prepare(original: { bytes: Uint8Array; type: string }, format: string, s: ImageSettings): Promise<{ bytes: Uint8Array; type: string } | "large" | null> {
    let bitmap: Bitmap
    try {
      bitmap = await this.codec.decode(new Blob([original.bytes as Uint8Array<ArrayBuffer>], { type: original.type }))
    } catch {
      return null
    }
    try {
      for (const attempt of encodeAttempts(bitmap.width, bitmap.height, s, format !== "image/png")) {
        const blob = await this.codec.encode(bitmap, attempt.width, attempt.height, format, attempt.quality)
        if (blob.size <= s.maxImageKB * 1024) return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type || format }
      }
      return "large"
    } catch {
      return null
    } finally {
      bitmap.close()
    }
  }

  /** Read the test image with an unsaved configuration of an AI service: the answer when it names 42; throws otherwise. */
  async test(providerId: string, config: Omit<ProviderConfig, "enabled">, model: string): Promise<string> {
    const settings = this.deps.getSettings()
    const resolved = resolveProviderConfig(providerId, config)
    const provider = { ...resolved, model: model.trim() || resolved.model, thinking: false }
    await this.checkOrigin(provider)
    const blob = await this.codec.testImage()
    const systemPrompt = buildImageSystem(promptText(settings.prompts, "image"), getLanguage(settings.targetLang).english, { ...settings.image, noText: "describe" })
    const image: ImageInput = { bytes: new Uint8Array(await blob.arrayBuffer()), mediaType: "image/png" }
    let answer: ImageAnswer
    try {
      answer = await this.queue(providerId).run(() => this.read(image, buildImageUserText(1, getLanguage(settings.targetLang).english), this.options(provider, settings, systemPrompt)))
    } catch (error) {
      // Described here, where the service is known: the description leaves the key out.
      throw new Error(describeError(error, this.i18n, errorContext(provider)))
    }
    const text = readImageAnswer(answer.text).text
    if (!text.includes("42")) throw new LocalizedError("errTestImage", [text.slice(0, 200)])
    return text
  }
}

