/**
 * The remote images of a displayed message, for image translation: the
 * addresses the message itself names, and the bytes of one of them.
 *
 * The content script hands over the address of a remote image only once
 * Thunderbird shows it, that is once the message may load remote content and
 * the image has loaded. The background script reads it again only when the
 * address appears in an image of the HTML of that message (imageUrlsOf()), so
 * a content script can make it read no other address; and only with the
 * optional host permission for it, which the user grants from a click in the
 * popup or on the settings page.
 *
 * The request carries no cookies and no referrer and lets the HTTP cache of
 * Thunderbird answer when it holds the image ("force-cache"); it ends after
 * REMOTE_TIMEOUT_MS, and a response larger than REMOTE_MAX_BYTES is dropped,
 * by its Content-Length before anything is read, otherwise as soon as the
 * bytes read pass the limit.
 */

import { remoteImageUrl } from "../shared/image"

/** The largest remote image read, in bytes: well above the images of a newsletter, and the size decoding still copes with. */
export const REMOTE_MAX_BYTES = 15 * 1024 * 1024

/** How long reading a remote image may take. */
export const REMOTE_TIMEOUT_MS = 20_000

/** A part of a message as messages.getFull() gives it: the parts it holds, and the decoded text of a text part. */
export interface MessagePartLike {
  contentType?: string
  body?: string
  parts?: MessagePartLike[]
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
    // "a.png 1x, b.png 2x": the address is the first token of each candidate.
    for (const candidate of (el.getAttribute("srcset") ?? "").split(",")) add(candidate.trim().split(/\s+/)[0] ?? "")
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

export interface RemoteFetchOptions {
  fetchFn?: typeof fetch
  /** Aborted when no content script waits for the image any more. */
  signal?: AbortSignal
  maxBytes?: number
  timeoutMs?: number
}

/**
 * The bytes and media type of the remote image at `url`; "large" when it is larger than `maxBytes`, null when it
 * cannot be read: another scheme, a failed or timed-out request, an answer that is no image. Throws only when
 * `signal` aborted.
 */
export async function fetchRemoteImage(url: string, { fetchFn = fetch, signal, maxBytes = REMOTE_MAX_BYTES, timeoutMs = REMOTE_TIMEOUT_MS }: RemoteFetchOptions = {}): Promise<{ bytes: Uint8Array; type: string } | "large" | null> {
  if (!remoteImageUrl(url)) return null
  const timeout = AbortSignal.timeout(timeoutMs)
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetchFn(url, { method: "GET", credentials: "omit", cache: "force-cache", referrerPolicy: "no-referrer", redirect: "follow", signal: both })
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
  const drop = () => void response.body?.cancel().catch(() => {})
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  if (!response.ok || !type.startsWith("image/")) {
    drop()
    return null
  }
  const length = Number(response.headers.get("content-length") ?? "")
  if (Number.isFinite(length) && length > maxBytes) {
    drop()
    return "large"
  }
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > maxBytes) {
        void reader.cancel().catch(() => {})
        return "large"
      }
      chunks.push(value)
    }
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return { bytes, type }
}
