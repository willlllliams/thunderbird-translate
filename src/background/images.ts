/**
 * The text in the images of a displayed message, read by an AI service.
 *
 *   request(image) → bytes of the part (messages.getAttachmentFile), of the data: URI or of the remote image, two at a time
 *     → filters on the bytes (size, animation, pixels from the header) → SHA-256 → cache
 *     → consent → limits of the message → decode, scale, encode, one at a time → queue image:<service> → the model
 *
 * The content script hands over an image that passed its own filters (shared/image.ts) and asks either to "peek",
 * which reads the image on this computer only, to know whether a result is cached and whether the image passes the
 * filters on its bytes, or to "translate", which sends it. Nothing leaves the computer before the user allowed the
 * service to receive images (Settings.imageConsent, or for the message alone with "confirm each message"), which is
 * checked here again whatever the content script says: when the request arrives, and when it leaves the queue,
 * together with the mode and the service of the settings.
 *
 * Each content script is a session, opened when it connects, for the message the tab shows then: its parts are
 * read from that message only while the tab still shows it, and only under the file name of their address. The
 * session ends when the content script goes away; what it still waits for is not sent, and the request on its way is
 * aborted.
 *
 * A remote image, which the content script hands over only once Thunderbird shows it, is read from its address
 * (remote-images.ts) under the same rules: while the tab still shows the message, only at an address an image of the
 * HTML of that message names, only from a host on the public internet, and only with the host permission for it;
 * without the permission the answer is "access", and the content script offers to allow reading remote images. In
 * mode "ask" a peek sends no request to the server of the image: it finds a result only by the address of an image
 * translated before in the same message (an entry of the cache), and the image is read once its button is clicked.
 * In mode "auto" the bytes read for a peek are kept for the translation of the image (HeldImages, within a limit per
 * session and one for all), so an image is usually read once. The remote images of a message are read two at a time
 * in a queue of their own, so a slow image server holds back no other message.
 *
 * The upload is the image scaled to its long edge and encoded again (JPEG by default, on white, so transparent
 * areas stay light), which drops its file name and metadata. One image goes in each request, in a request queue of its
 * own per service, so slow image requests never hold back the paragraphs. A result is cached under the SHA-256 of the
 * original bytes and every setting that changes what the model sees or answers; with "use message context" also
 * under the message, whose glossary goes with the image to the service of the AI tier or to a service allowed to
 * receive message text. The limits per message (images, bytes) count for the session, whatever the content script
 * draws again, until a retranslation; copies of one image and an image on its way when the content script draws
 * again are sent once. A request of an earlier round of the content script sends nothing: a request takes the
 * ledger and the abort signal of its round when it arrives, and a retranslation that comes while it reads its image
 * aborts it.
 */

import { describeError, LocalizedError } from "../shared/errors"
import { hashText, sha256Hex } from "../shared/hash"
import { originPattern } from "../shared/hosts"
import { IMAGE_MAX_BYTES } from "../shared/image"
import { ENGLISH, type I18n, type MessageKey } from "../shared/i18n"
import { getLanguage } from "../shared/languages"
import type { ImageRequest, ImageResponse } from "../shared/messages"
import { promptText } from "../shared/prompts"
import { getPreset, providerDisplayName } from "../shared/providers"
import { allowsRequest, asVisionProvider, consentKey, hostOf, imageGlossary, imageStatus, type ImageSettings, type ProviderConfig, type ResolvedProvider, resolveProviderConfig, resolveVisionProvider, type Settings } from "../shared/settings"
import { outputLimit } from "../shared/thinking"
import { imageDetailOptions, uploadFormat } from "../shared/vision"
import { cacheKey, LruCache, type PersistentCache } from "./cache"
import { buildImageSystem, buildImageUserText, imageOutputTokens } from "../shared/image-prompt"
import { RequestQueue } from "./queue/request-queue"
import { LAZY_LLM } from "./translators/lazy-llm"
import { aborted, checkOrigin, errorContext, requestTimeout } from "./requests"
import type { ImageAnswer, ImageInput, LlmCallOptions } from "./translators/llm"
import { cleanSingleOutput, type MailAnalysis } from "./translators/llm-prompt"
import { HeldImages, RemoteImages } from "./remote-images"
import { dataBytes, imageSize, isAnimated } from "./image-format"

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

/** What the background script knows of an image of a message once it read its bytes; a later peek reads nothing again. */
interface Digest {
  sha: string
  length: number
  animated: boolean
  /** Width × height from the header of the file; null when the header does not tell. */
  pixels: number | null
}

/** What went out for a message until a retranslation: images, bytes, and the requests by cache key on their way. */
interface Ledger {
  uploads: number
  bytes: number
  running: Map<string, Promise<ImageResponse>>
}

const newLedger = (): Ledger => ({ uploads: 0, bytes: 0, running: new Map() })

/**
 * A content script, that is one displayed message: the message it was opened for, the consent it sent last, which
 * its image requests wait for, the services allowed for its message alone, its latest round, and what went out for
 * the message until a retranslation: images, bytes, and the requests by cache key, which copies of an image and
 * the rounds after it share.
 */
interface Session {
  tabId: number
  message: Promise<number | null>
  consent: Promise<void>
  allowed: Set<string>
  round: number
  /** Replaced by a retranslation: a request of the translation before it gives back what it counted to its own ledger. */
  ledger: Ledger
  /** What the bytes of each image tell, by source; shared by the rounds, a retranslation too. */
  digests: Map<string, Promise<Digest | ImageResponse | null>>
  /** The remote images of the message: the addresses its HTML names, the bytes kept from a peek, the requests. */
  remote: RemoteImages
  /** Aborted when the content script goes away or translates the message again: what still waits is not sent. */
  controller: AbortController
  /** Aborted when the content script goes away: the bytes still being read are not wanted. A retranslation reads on, its peeks share the reading. */
  life: AbortController
}

/** What a request belongs to: the ledger and the abort signal of its round, taken when it arrives. */
interface Round {
  ledger: Ledger
  signal: AbortSignal
}

/** What the result of an image depends on besides its bytes, worked out once per request. */
interface Plan {
  settings: Settings
  id: string
  provider: ResolvedProvider
  service: string
  systemPrompt: string
  format: string
  context: string
  variant: string
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
  /** The addresses of the images of the HTML of a message (remote-images.ts); without it no remote image is read. */
  imageUrls?: (messageId: number) => Promise<Set<string>>
  /** The fetch of the remote images; the global one by default. */
  remoteFetch?: typeof fetch
  /** The bytes of remote images that the sessions keep from a peek; one for all by default. */
  held?: HeldImages
  /** A server on this computer whose remote images may be read: the mock server of the e2e build only (src/hooks/servers.ts). */
  localOrigin?: string
  /** Records the services the user allowed to receive images (Settings.imageConsent). */
  recordConsent: (ids: string[], hosts?: string[]) => Promise<void>
  /** The glossary of the analysis precise translation made of the registered message `contextId`; empty without one. */
  glossary: (contextId: string) => Promise<MailAnalysis["glossary"]>
  codec?: ImageCodec
  hasOrigin?: (origin: string) => Promise<boolean>
  i18n?: () => I18n
  sleep?: (ms: number) => Promise<void>
}

/** Content scripts whose rounds and consent are kept; one per displayed message. */
const MAX_SESSIONS = 50

/** Images with more pixels are not decoded: 40 MP decode to 160 MB, and the upload has at most 2576 px on its long edge. */
const MAX_PIXELS = 40_000_000

/** Images whose bytes are read at the same time; reading a part parses the message up to it. */
const READ_CONCURRENCY = 2


/** A file name as the address of a part and as messages.getAttachmentFile() give it, for comparing the two. */
const fileName = (name: string) => name.normalize("NFC").trim().toLowerCase()

/**
 * The file name messages.getAttachmentFile() gives a part, "" for none. Thunderbird 128 names only the parts it counts
 * as attachments; a part without Content-Disposition, such as an inline image of multipart/related, is passed to the
 * File constructor without a name, which makes it "undefined".
 */
const partFileName = (file: File) => (file.name === "undefined" ? "" : file.name)

export class ImageService {
  private readonly queues = new Map<string, RequestQueue>()
  private readonly sessions = new LruCache<Session>(MAX_SESSIONS, (s) => this.end(s))
  private readonly codec: ImageCodec
  private readonly read: NonNullable<ImageDeps["read"]>
  /** Reading the bytes of the parts, a few at a time. */
  private readonly reads: RequestQueue
  /** Decoding, one image at a time: a decoded image takes 4 bytes per pixel. */
  private readonly decoding: RequestQueue
  /** The bytes of remote images that the sessions keep from a peek. */
  private readonly held: HeldImages

  constructor(private readonly deps: ImageDeps) {
    this.held = deps.held ?? new HeldImages()
    this.codec = deps.codec ?? browserCodec
    this.read = deps.read ?? LAZY_LLM.readImage
    this.reads = new RequestQueue({ concurrency: () => READ_CONCURRENCY, maxRetries: () => 0 })
    this.decoding = new RequestQueue({ concurrency: () => 1, maxRetries: () => 0 })
  }

  private get i18n(): I18n {
    return this.deps.i18n?.() ?? ENGLISH
  }

  /** A content script connected in tab `tabId`: its session holds the message displayed now, the only one its images are read from. */
  open(session: string, tabId: number): void {
    this.sessions.set(session, {
      tabId,
      message: this.deps.displayed(tabId).catch(() => null),
      consent: Promise.resolve(),
      allowed: new Set(),
      round: -1,
      ledger: newLedger(),
      digests: new Map(),
      remote: new RemoteImages({ imageUrls: this.deps.imageUrls, fetchFn: this.deps.remoteFetch, held: this.held, localOrigin: this.deps.localOrigin }),
      controller: new AbortController(),
      life: new AbortController(),
    })
  }

  private session(id: string, tabId: number): Session {
    if (!this.sessions.get(id)) this.open(id, tabId)
    return this.sessions.get(id)!
  }

  /** The content script `session` went away: what it still waits for is not sent. */
  forget(session: string): void {
    const s = this.sessions.get(session)
    if (s) this.end(s)
    this.sessions.delete(session)
  }

  /** A session is over, forgotten or pushed out by newer ones: its requests are aborted and the images it holds go. */
  private end(s: Session): void {
    s.controller.abort()
    s.life.abort()
    s.remote.clear()
  }

  /**
   * The user allowed `ids` to receive images at the `hosts` the panel named: for the message of `session` only, or
   * recorded in the settings. The image requests of the session that come after it wait for it.
   */
  grant(session: string, ids: string[], messageOnly: boolean, hosts?: string[]): Promise<void> {
    const s = this.sessions.get(session)
    const granted = async () => {
      if (messageOnly) ids.forEach((id, i) => s?.allowed.add(consentKey({ id, host: typeof hosts?.[i] === "string" ? hosts[i] : "" })))
      else await this.deps.recordConsent(ids, hosts)
    }
    if (!s) return granted()
    const done = s.consent.then(granted)
    s.consent = done.catch(() => {})
    return done
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
    return {
      provider,
      systemPrompt,
      targetLanguageName: getLanguage(settings.targetLang).english,
      fetchFn: this.deps.fetchFn,
      // The vision provider never thinks first: only a local model waits longer.
      timeoutMs: requestTimeout(provider, settings.image.timeoutSeconds * 1000),
      // A model that reasons even with thinking off (Gemini 3, Kimi K3, Claude 5) gets room for it beyond the answer.
      maxOutputTokens: outputLimit(provider.id, provider.model, false, imageOutputTokens(settings.image)),
    }
  }

  private checkOrigin(provider: ResolvedProvider): Promise<void> {
    return checkOrigin(provider, this.deps.hasOrigin, this.i18n)
  }

  private tooLarge(): ImageResponse {
    return this.skipped("imageRemoteTooLarge", [Math.round(IMAGE_MAX_BYTES / 1024 / 1024)])
  }

  private skipped(key: MessageKey, args: (string | number)[] = [], quiet = false): ImageResponse {
    return { status: "skipped", reason: this.i18n.t(key, args), ...(quiet ? { quiet: true as const } : {}) }
  }

  /**
   * The original bytes of the image of `req`, or null when they cannot be read: a part is read only from the message
   * the session was opened for while the tab still shows it, and only when its file name is the one of its address.
   */
  private async bytesOf(session: Session, req: ImageRequest, signal: AbortSignal): Promise<{ bytes: Uint8Array; type: string } | "large" | null> {
    if ("data" in req.source) return dataBytes(req.source.data)
    const message = await session.message
    if (message === null || (await this.deps.displayed(session.tabId)) !== message) return null
    if ("url" in req.source) return session.remote.bytes(message, req.source.url, signal)
    const file = await this.deps.part(message, req.source.part)
    // The part number of the address must name an image part of the message, the one the address names.
    if (!file.type.startsWith("image/")) return null
    const name = partFileName(file)
    if (req.source.name && name && fileName(req.source.name) !== fileName(name)) return null
    if (file.size > IMAGE_MAX_BYTES) return "large"
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type }
  }

  /** The bytes of the image of `req`: a remote image in the queue of its session, the others in the queue of all reads. */
  private original(session: Session, req: ImageRequest, signal: AbortSignal): Promise<{ bytes: Uint8Array; type: string } | "large" | null> {
    if ("url" in req.source) return this.bytesOf(session, req, signal)
    return this.reads.run(() => this.bytesOf(session, req, signal))
  }

  /** Whether the extension may read the remote image at `url`: the host permission for its host. */
  private async mayRead(url: string): Promise<boolean> {
    const pattern = originPattern(url)
    if (!pattern || !this.deps.hasOrigin) return false
    return this.deps.hasOrigin(pattern).catch(() => false)
  }

  /** What the bytes of the image of `req` tell, read once per session and source; a skipped answer for a remote image too large to read. */
  private digest(session: Session, req: ImageRequest): Promise<Digest | ImageResponse | null> {
    const source = JSON.stringify(req.source)
    let digest = session.digests.get(source)
    if (!digest) {
      // Read under the signal of the session: a retranslation that comes meanwhile shares the reading.
      digest = this.original(session, req, session.life.signal)
        .then(async (original): Promise<Digest | ImageResponse | null> => {
          if (original === "large") return this.tooLarge()
          if (!original) return null
          if ("url" in req.source) session.remote.hold(req.source.url, original)
          const size = imageSize(original.bytes)
          return { sha: await sha256Hex(original.bytes), length: original.bytes.length, animated: isAnimated(original.bytes), pixels: size ? size.width * size.height : null }
        })
        .catch(() => null)
      session.digests.set(source, digest)
      // A failed read is tried again with the next request.
      void digest.then((d) => (d === null || "status" in d) && session.digests.get(source) === digest && session.digests.delete(source))
    }
    return digest
  }

  /**
   * Throws unless the image may go out now: the content script still waits, image translation still applies with
   * the same service, and the user still allows the service to receive images. Checked when the request arrives and
   * again when it leaves the queue, on every attempt.
   */
  private assertSend(session: Session, provider: ResolvedProvider, service: string, signal: AbortSignal): void {
    if (signal.aborted) throw aborted()
    const settings = this.deps.getSettings()
    const status = imageStatus(settings)
    const id = provider.id
    if (!status.active || settings.image.mode === "off" || status.id !== id) throw new LocalizedError("imageOff")
    // The host the request goes to, as it took the endpoint.
    const allowed = settings.image.confirmEachMessage ? session.allowed.has(consentKey({ id, host: hostOf(provider) })) : allowsRequest(settings, "imageConsent", provider)
    if (!allowed) throw new LocalizedError("errImageConsent", [service])
  }

  /**
   * The round of `req`, taken before anything waits: its ledger and abort signal, so that a retranslation that comes
   * while the request reads its image cannot hand it its own. A retranslation counts the limits of the message again,
   * and what the earlier rounds still wait to send is not sent. Null for a translation of an earlier round: its
   * answer would be dropped, and nothing is sent for it.
   */
  private admit(session: Session, req: ImageRequest): Round | null {
    if (req.action === "translate" && req.round < session.round) return null
    if (req.round > session.round) {
      session.round = req.round
      if (req.fresh) {
        session.controller.abort()
        Object.assign(session, { ledger: newLedger(), controller: new AbortController() })
      }
    }
    return { ledger: session.ledger, signal: session.controller.signal }
  }

  /** The cache key of the result of an image with the SHA-256 `sha` under the settings of `plan`. */
  private keyOf(plan: Plan, sha: string): string {
    return cacheKey(`image:${plan.id}`, plan.provider.model, `auto>${plan.settings.targetLang}`, sha, plan.variant)
  }

  /** The entry of the cache that ties a remote image of message `message` to the SHA-256 of the bytes translated last at its address. */
  private remoteIndex(message: number, url: string): string {
    return cacheKey("image-remote", "", String(message), url)
  }

  /** An image request of the content script `sessionId` in tab `tabId`. */
  async request(sessionId: string, tabId: number, req: ImageRequest): Promise<ImageResponse> {
    const session = this.session(sessionId, tabId)
    await session.consent
    const settings = this.deps.getSettings()
    const status = imageStatus(settings)
    if (!status.active || settings.image.mode === "off" || !status.id) return this.skipped("imageOff", [], true)
    const round = this.admit(session, req)
    if (!round) return this.skipped("imageOff", [], true)
    const plan = this.plan(settings, status.id, req)
    try {
      if (req.width * req.height > MAX_PIXELS) return this.skipped("imageTooManyPixels", [Math.round(MAX_PIXELS / 1e6)])
      if ("url" in req.source) {
        // Never this computer or the local network; and the host permission before anything is read.
        if (!session.remote.readable(req.source.url)) return this.skipped("imageRemotePrivate")
        if (!(await this.mayRead(req.source.url))) return { status: "access" }
        if (req.action === "access") return { status: "ready" }
        // In mode "ask" nothing goes to the server of the image before a click.
        if (req.action === "peek" && settings.image.mode !== "auto") return await this.peekRemote(session, req.source.url, req, plan)
      } else if (req.action === "access") return { status: "ready" }
      const digest = await this.inspect(session, req, plan)
      if ("status" in digest) {
        // Left out by the filters: the bytes a peek kept are not needed.
        if ("url" in req.source) session.remote.release(req.source.url)
        return digest
      }
      // A retranslation came while the image was read: this request belongs to the translation before it.
      if (req.action === "translate" && round.signal.aborted) return this.skipped("imageOff", [], true)
      return await this.lookup(session, req, plan, digest, round)
    } catch (error) {
      return { status: "error", error: describeError(error, this.i18n, errorContext(plan.provider)) }
    }
  }

  /** What the result of an image depends on besides its bytes: the service, the prompts, the upload, the glossary of the message. */
  private plan(settings: Settings, id: string, req: ImageRequest): Plan {
    const s = settings.image
    const provider = resolveVisionProvider(settings, id)
    const service = providerDisplayName(getPreset(id)!, this.i18n)
    const systemPrompt = buildImageSystem(promptText(settings.prompts, "image"), getLanguage(settings.targetLang).english, s)
    const format = uploadFormat(id, `image/${s.format}`)
    // The glossary holds words of the message text: only for a service the user allowed to receive that text.
    const context = req.context && imageGlossary(settings, id) ? req.context : ""
    // The output rules are part of the system prompt.
    const variant = hashText([provider.baseURL, systemPrompt, s.maxLongEdge, format, s.quality, s.detail, s.maxOutputTokens, provider.temperature, context].join("\n"))
    return { settings, id, provider, service, systemPrompt, format, context, variant }
  }

  /** The bytes of the image read once per session, and the filters on them; a skipped answer for an image they leave out. */
  private async inspect(session: Session, req: ImageRequest, plan: Plan): Promise<Digest | ImageResponse> {
    const s = plan.settings.image
    const digest = await this.digest(session, req)
    if (!digest) return this.skipped("imageUnreadable")
    if ("status" in digest) return digest
    if (digest.length < s.minKB * 1024) return this.skipped("imageTooFewBytes", [], true)
    if (digest.animated && s.animated === "skip") return this.skipped("imageAnimated", [], true)
    // A remote server may answer the extension with other bytes than Thunderbird showed: without a size in their header, they are not decoded.
    if (digest.pixels === null && "url" in req.source) return this.skipped("imageUnreadable")
    if ((digest.pixels ?? 0) > MAX_PIXELS) return this.skipped("imageTooManyPixels", [Math.round(MAX_PIXELS / 1e6)])
    return digest
  }

  /**
   * A peek at a remote image in mode "ask", which sends nothing to its server: the result of the bytes translated last
   * at its address in this message, when the cache still holds both; "ready" otherwise.
   */
  private async peekRemote(session: Session, url: string, req: ImageRequest, plan: Plan): Promise<ImageResponse> {
    const message = await session.message
    const sha = message === null ? undefined : await this.deps.cache.get(this.remoteIndex(message, url))
    return sha === undefined ? { status: "ready" } : this.peeked(req, plan, sha)
  }

  /** A peek at the image with the SHA-256 `sha`: its cached result, forgotten first for a retranslation; "ready" when there is none. */
  private async peeked(req: ImageRequest, plan: Plan, sha: string): Promise<ImageResponse> {
    const key = this.keyOf(plan, sha)
    if (req.fresh) {
      await this.deps.cache.delete(key)
      return { status: "ready" }
    }
    const cached = await this.deps.cache.get(key)
    return cached === undefined ? { status: "ready" } : this.answer(cached, plan.service, true)
  }

  /** The cached result of the image, the request of a copy of it on its way, or a new one. */
  private async lookup(session: Session, req: ImageRequest, plan: Plan, digest: Digest, round: Round): Promise<ImageResponse> {
    if (req.action === "peek") {
      const found = await this.peeked(req, plan, digest.sha)
      // A result shown from the cache is found by the address of a remote image in mode "ask" as well, and the image is read no more.
      if (found.status !== "ready") await this.settled(session, req, digest.sha)
      return found
    }
    const key = this.keyOf(plan, digest.sha)
    this.assertSend(session, plan.provider, plan.service, round.signal)
    await this.checkOrigin(plan.provider)
    const cached = req.fresh ? undefined : await this.deps.cache.get(key)
    if (round.signal.aborted) return this.skipped("imageOff", [], true)
    if (cached !== undefined) {
      await this.settled(session, req, digest.sha)
      return this.answer(cached, plan.service, true)
    }
    const { ledger } = round
    const running = ledger.running.get(key)
    if (running) return await running
    const started = this.send(req, { session, round, plan, key, sha: digest.sha })
    ledger.running.set(key, started)
    // Only a request on its way is shared: copies of the image that come later find the answer in the cache, and an
    // image left out may go once another one failed.
    const done = () => void (ledger.running.get(key) === started && ledger.running.delete(key))
    void started.then(done, done)
    return await started
  }

  /**
   * A remote image has a result for the bytes `sha`: a peek in mode "ask" finds it by the address within the message,
   * and the bytes the peek kept are not needed any more.
   */
  private async settled(session: Session, req: ImageRequest, sha: string): Promise<void> {
    if (!("url" in req.source)) return
    session.remote.release(req.source.url)
    const message = await session.message
    if (message !== null) await this.deps.cache.set(this.remoteIndex(message, req.source.url), sha)
  }

  /** An answer of the model, or a cached one, as the content script gets it; usage only for an answer that just came. */
  private answer(stored: string, service: string, cached: boolean, usage?: ImageAnswer["usage"]): ImageResponse {
    const { text: raw, truncated } = fromCache(stored)
    const { noText, text } = readImageAnswer(raw)
    if (noText) return { status: "noText", service }
    return { status: "done", text, service, cached, ...(usage ? { usage } : {}), ...(truncated ? { truncated: true } : {}) }
  }

  /** Prepare the image within the limits of the message and of one image, send it, cache the answer. */
  private async send(req: ImageRequest, job: { session: Session; round: Round; plan: Plan; key: string; sha: string }): Promise<ImageResponse> {
    const { session, plan } = job
    const { ledger, signal } = job.round
    const { settings, provider } = plan
    const s = settings.image
    if (ledger.uploads >= s.maxPerMessage) return this.skipped("imageLimitCount", [s.maxPerMessage])
    const original = await this.original(session, req, signal).catch(() => null)
    if (original === "large") return this.tooLarge()
    if (!original) return this.skipped("imageUnreadable")
    // Read again: only the bytes the filters passed go out, under the key of their SHA-256. The server answered with
    // other bytes: the next request reads and filters the image anew, under its new SHA-256.
    if ("url" in req.source && (await sha256Hex(original.bytes)) !== job.sha) {
      session.digests.delete(JSON.stringify(req.source))
      session.remote.release(req.source.url)
      return this.skipped("imageUnreadable")
    }
    const upload = await this.decoding.run(() => (signal.aborted ? Promise.reject(aborted()) : this.prepare(original, plan.format, s)))
    if (!upload) return this.skipped("imageUnreadable")
    if (upload === "large") return this.skipped("imageTooLarge", [s.maxImageKB])
    // Counted before the answer: the images of a message go out at the same time.
    if (ledger.uploads >= s.maxPerMessage) return this.skipped("imageLimitCount", [s.maxPerMessage])
    if (ledger.bytes + upload.bytes.length > s.maxMessageMB * 1024 * 1024) return this.skipped("imageLimitBytes", [s.maxMessageMB])
    ledger.uploads++
    ledger.bytes += upload.bytes.length
    const glossary = plan.context ? await this.deps.glossary(plan.context).catch(() => []) : []
    const text = buildImageUserText(req.index, getLanguage(settings.targetLang).english, glossary)
    const options = imageDetailOptions(provider.id, s.detail)
    const image: ImageInput = { bytes: upload.bytes, mediaType: upload.type, ...(options ? { providerOptions: options } : {}) }
    try {
      const answer = await this.queue(provider.id).run(() => {
        this.assertSend(session, provider, plan.service, signal)
        return this.read(image, text, { ...this.options(provider, settings, plan.systemPrompt), abortSignal: signal })
      })
      const stored = toCache(answer)
      await this.deps.cache.set(job.key, stored)
      // The bytes stay held until here: a request that fails is tried again with the same bytes.
      await this.settled(session, req, job.sha)
      return this.answer(stored, plan.service, false, answer.usage)
    } catch (error) {
      // A failed request may be tried again within the limits.
      ledger.uploads--
      ledger.bytes -= upload.bytes.length
      ledger.running.delete(job.key)
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
    const provider = asVisionProvider(resolveProviderConfig(providerId, config), model)
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

