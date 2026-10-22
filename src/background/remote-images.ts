/**
 * The remote images of a displayed message, for image translation: the
 * addresses the message itself names, the bytes of one of them, and what a
 * session keeps of them between the peek and the translation.
 *
 * The content script hands over the address of a remote image only once
 * Thunderbird shows it, that is once the message may load remote content and
 * the image has loaded. The background script reads it again only when the
 * address appears in an image of the HTML of that message (imageUrlsOf()), so
 * a content script can make it read no other address; only with the optional
 * host permission for it, which the user grants from a click in the popup or
 * on the settings page; and only from a host on the public internet
 * (isPublicHost()), never from this computer or the local network.
 *
 * The request carries no cookies and no referrer and follows the rules of
 * the HTTP cache ("default"): the extension has a cache of its own for such
 * requests, which Thunderbird's display of the message does not fill, so in
 * practice the image is requested once more. It follows redirects, and the
 * answer is dropped unless its final address is on a public host as well; it
 * ends after REMOTE_TIMEOUT_MS, and a response larger than REMOTE_MAX_BYTES
 * is dropped, by its Content-Length before anything is read, otherwise as
 * soon as the bytes read pass the limit.
 */

import { BodyTooLargeError, readBody } from "../shared/download"
import { isPublicHost } from "../shared/hosts"
import { remoteImageUrl, sniffImageType } from "../shared/image"
import { RequestQueue } from "./queue/request-queue"

/** The largest remote image read, in bytes: well above the images of a newsletter, and the size decoding still copes with. */
export const REMOTE_MAX_BYTES = 15 * 1024 * 1024

/** How long reading a remote image may take. */
export const REMOTE_TIMEOUT_MS = 20_000

/** The bytes of remote images one session keeps between the peek and the translation. */
export const HELD_BYTES = 16 * 1024 * 1024

/** The bytes of remote images all sessions keep together; beyond it the oldest go first. */
export const HELD_TOTAL = 32 * 1024 * 1024

/** Remote images of one session read at the same time; a slow server holds back the remote images of its own message only. */
const REMOTE_CONCURRENCY = 2

/** A part of a message as messages.getFull() gives it: the parts it holds, and the decoded text of a text part. */
export interface MessagePartLike {
  contentType?: string
  body?: string
  parts?: MessagePartLike[]
}

/**
 * The addresses of a srcset attribute, by the parsing rules of HTML: an address runs up to the next white space, so a
 * comma inside it belongs to it ("…/w_600,c_fill/a.jpg"); commas at its end, and the comma after its descriptors
 * ("2x", "640w"), end the candidate.
 */
export function srcsetUrls(value: string): string[] {
  const urls: string[] = []
  const space = (c: string) => /\s/.test(c)
  let at = 0
  while (at < value.length) {
    while (at < value.length && (space(value[at]) || value[at] === ",")) at++
    if (at >= value.length) break
    let end = at
    while (end < value.length && !space(value[end])) end++
    let url = value.slice(at, end)
    at = end
    if (url.endsWith(",")) url = url.replace(/,+$/, "")
    else {
      // The descriptors, up to the comma that ends the candidate; a comma inside parentheses belongs to them.
      let depth = 0
      for (; at < value.length; at++) {
        const c = value[at]
        if (c === "(") depth++
        else if (c === ")") depth = Math.max(0, depth - 1)
        else if (c === "," && depth === 0) {
          at++
          break
        }
      }
    }
    if (url) urls.push(url)
  }
  return urls
}

/** The addresses of the images of an HTML document: the src and every candidate of srcset of <img> and <picture><source>, resolved against <base href>, as remoteImageUrl() writes them. */
export function imageUrlsOf(doc: Document): Set<string> {
  const urls = new Set<string>()
  const baseHref = doc.querySelector("base[href]")?.getAttribute("href") ?? ""
  const base = remoteImageUrl(baseHref) ?? undefined
  const add = (value: string | null) => {
    if (!value) return
    try {
      const url = remoteImageUrl(new URL(value.trim(), base).href)
      if (url) urls.add(url)
    } catch {
      // Not an address.
    }
  }
  for (const el of Array.from(doc.querySelectorAll("img, picture source"))) {
    add(el.getAttribute("src"))
    for (const candidate of srcsetUrls(el.getAttribute("srcset") ?? "")) add(candidate)
  }
  return urls
}

/** The addresses of the images of every HTML part of a message (messages.getFull()), parsed with `parse`. */
export function messageImageUrls(message: MessagePartLike, parse: (html: string) => Document): Set<string> {
  const urls = new Set<string>()
  const walk = (part: MessagePartLike) => {
    if (part.contentType?.toLowerCase() === "text/html" && typeof part.body === "string") for (const url of imageUrlsOf(parse(part.body))) urls.add(url)
    for (const child of part.parts ?? []) walk(child)
  }
  walk(message)
  return urls
}

/**
 * A click in a message asked for the access to remote images. Thunderbird asks the user for a permission only from a
 * user action on a page of the extension, and a content script has no permissions API: the popup of the message in
 * window `windowId` opens, which offers the access (Thunderbird 113 and later open it without a user action); when the
 * button is not in a toolbar, the settings page opens at the line that offers it.
 */
export async function offerRemoteAccess(windowId: number | undefined, deps: { openPopup: (windowId: number | undefined) => Promise<boolean>; openOptions: () => Promise<void> }): Promise<void> {
  const opened = await deps.openPopup(windowId).catch(() => false)
  if (!opened) await deps.openOptions().catch(() => {})
}

/**
 * Whether the extension reads a remote image at `url`: a host on the public internet; besides, a server on this
 * computer at `localOrigin`, which only the e2e build names (src/hooks/servers.ts).
 */
export function readableHost(url: string, localOrigin?: string): boolean {
  if (isPublicHost(url)) return true
  try {
    return localOrigin !== undefined && new URL(url).origin === localOrigin
  } catch {
    return false
  }
}

export interface RemoteFetchOptions {
  fetchFn?: typeof fetch
  /** Aborted when no content script waits for the image any more. */
  signal?: AbortSignal
  maxBytes?: number
  timeoutMs?: number
  /** The origin of a server on this computer that may be read as well (readableHost()). */
  localOrigin?: string
}

/** Media types a server sends for any file: the bytes tell whether it is an image. */
const UNTYPED = new Set(["", "application/octet-stream", "binary/octet-stream"])

/**
 * The bytes and media type of the remote image at `url`; "large" when it is larger than `maxBytes`, null when it
 * cannot be read: another scheme, a host of this computer or the local network (at the address or after a redirect),
 * a failed or timed-out request, an answer that is no image. An answer without a media type or with
 * application/octet-stream counts as an image when its first bytes are those of PNG, GIF, JPEG or WebP. Throws only
 * when `signal` aborted.
 */
export async function fetchRemoteImage(url: string, { fetchFn = fetch, signal, maxBytes = REMOTE_MAX_BYTES, timeoutMs = REMOTE_TIMEOUT_MS, localOrigin }: RemoteFetchOptions = {}): Promise<{ bytes: Uint8Array; type: string } | "large" | null> {
  if (!remoteImageUrl(url) || !readableHost(url, localOrigin)) return null
  const timeout = AbortSignal.timeout(timeoutMs)
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetchFn(url, { method: "GET", credentials: "omit", cache: "default", referrerPolicy: "no-referrer", redirect: "follow", signal: both })
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
  const drop = () => void response.body?.cancel().catch(() => {})
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  // A redirect may lead anywhere: the answer counts only from a host the extension reads.
  const final = response.url || url
  if (!response.ok || !readableHost(final, localOrigin) || !(type.startsWith("image/") || UNTYPED.has(type))) {
    drop()
    return null
  }
  let bytes: Uint8Array
  try {
    bytes = await readBody(response, () => {}, both, maxBytes)
  } catch (error) {
    if (error instanceof BodyTooLargeError) return "large"
    if (signal?.aborted) throw error
    return null
  }
  if (!UNTYPED.has(type)) return { bytes, type }
  const sniffed = sniffImageType(bytes)
  return sniffed ? { bytes, type: sniffed } : null
}

type Original = { bytes: Uint8Array; type: string }

/**
 * The bytes of remote images every session keeps between the peek and the translation: at most HELD_BYTES for one
 * session and HELD_TOTAL for all; to keep a new image within the second limit, the oldest images of the other
 * sessions go first.
 */
export class HeldImages {
  /** In the order they came: [owner, address] → bytes. */
  private readonly entries = new Map<string, { owner: object; url: string; original: Original }>()
  private readonly owners = new Map<object, number>()
  private total = 0
  private readonly keys = new WeakMap<object, number>()
  private nextOwner = 0

  constructor(
    private readonly perSession = HELD_BYTES,
    private readonly all = HELD_TOTAL,
  ) {}

  private key(owner: object, url: string): string {
    if (!this.keys.has(owner)) this.keys.set(owner, this.nextOwner++)
    return `${this.keys.get(owner)}|${url}`
  }

  /** The bytes of all sessions together, for the tests. */
  get size(): number {
    return this.total
  }

  get(owner: object, url: string): Original | undefined {
    return this.entries.get(this.key(owner, url))?.original
  }

  /** Keep `original` for `owner`, unless it holds the image already or the image passes its limit. */
  hold(owner: object, url: string, original: Original): void {
    const key = this.key(owner, url)
    const length = original.bytes.length
    const mine = this.owners.get(owner) ?? 0
    if (this.entries.has(key) || mine + length > this.perSession || length > this.all) return
    for (const [other, entry] of this.entries) {
      if (this.total + length <= this.all) break
      if (entry.owner !== owner) this.remove(other)
    }
    if (this.total + length > this.all) return
    this.entries.set(key, { owner, url, original })
    this.owners.set(owner, mine + length)
    this.total += length
  }

  /** The image went to the decoder, or is no longer wanted. */
  release(owner: object, url: string): void {
    this.remove(this.key(owner, url))
  }

  /** Everything `owner` keeps goes. */
  clear(owner: object): void {
    for (const [key, entry] of this.entries) if (entry.owner === owner) this.remove(key)
  }

  private remove(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    const left = (this.owners.get(entry.owner) ?? 0) - entry.original.bytes.length
    if (left > 0) this.owners.set(entry.owner, left)
    else this.owners.delete(entry.owner)
    this.total -= entry.original.bytes.length
  }
}

export interface RemoteImagesDeps {
  /** The addresses of the images of the HTML of a message; without it no remote image is read. */
  imageUrls?: (messageId: number) => Promise<Set<string>>
  fetchFn?: typeof fetch
  held: HeldImages
  localOrigin?: string
}

/**
 * The remote images of the message of one session: the addresses its HTML names, read with the first remote image
 * and again after a failure; the bytes kept from a peek (HeldImages); the requests, REMOTE_CONCURRENCY at a time in a
 * queue of the session.
 */
export class RemoteImages {
  private urls?: Promise<Set<string>>
  private readonly queue = new RequestQueue({ concurrency: () => REMOTE_CONCURRENCY, maxRetries: () => 0 })

  constructor(private readonly deps: RemoteImagesDeps) {}

  /** Whether the extension reads a remote image at `url` at all: a public host (or the server of the e2e build). */
  readable(url: string): boolean {
    return readableHost(url, this.deps.localOrigin)
  }

  /** Whether an image of the HTML of message `message` names `url`. */
  private async named(message: number, url: string): Promise<boolean> {
    if (!this.deps.imageUrls) return false
    if (!this.urls) {
      const urls = this.deps.imageUrls(message)
      this.urls = urls
      // A failed read is tried again with the next image.
      void urls.catch(() => this.urls === urls && delete this.urls)
    }
    const urls = await this.urls.catch(() => null)
    return urls?.has(url) === true
  }

  /** The bytes of the remote image at `url` of message `message`: only at an address its HTML names; those kept from the peek when there are, otherwise read again. */
  async bytes(message: number, url: string, signal: AbortSignal): Promise<Original | "large" | null> {
    if (!(await this.named(message, url))) return null
    const held = this.deps.held.get(this, url)
    if (held) return held
    return this.queue.run(() => fetchRemoteImage(url, { fetchFn: this.deps.fetchFn, signal, localOrigin: this.deps.localOrigin }))
  }

  /** Keep the bytes read for a peek, for the translation of the image. */
  hold(url: string, original: Original): void {
    this.deps.held.hold(this, url, original)
  }

  /** The bytes went to the decoder: they are not kept any longer. */
  release(url: string): void {
    this.deps.held.release(this, url)
  }

  /** A retranslation, or the session ended: nothing is kept. */
  clear(): void {
    this.deps.held.clear(this)
  }
}
