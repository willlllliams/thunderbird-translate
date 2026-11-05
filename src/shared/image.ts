/**
 * The images of a displayed message as the content script sees them: where
 * an image comes from, read off its address, and the filters on its natural
 * size and its place, which come before anything is read or sent. The
 * filters on the bytes run in the background script (background/images.ts).
 *
 * A remote image (http or https) counts as an image of the body: it takes
 * part only once Thunderbird shows it, that is when the message may load
 * remote content and the image has loaded. An address with a user name or a
 * password is never read.
 */

import type { ImageRequest } from "./messages"
import type { PublicImageSettings } from "./settings"

/** The address of a remote image as the extension may read it: http or https, with a host and without a user name or password; null otherwise. */
export function remoteImageUrl(src: string): string | null {
  try {
    const url = new URL(src)
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

/** The largest image read, in bytes, whether it comes from a remote server, a part of the message or a data: URI: well above the images of a newsletter, and the size decoding still copes with. */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024

/** A part number as libmime writes it: "1.2", "1.1.3". */
const PART = /^\d+(?:\.\d+)*$/

/**
 * Where an image comes from, by its address, as an image request names it: a part of the message, a data: URI or a
 * remote address (http, https); null for anything else (an unreplaced cid:, a blob:). Thunderbird puts the address
 * of the message part in place of a cid: reference and of an image attachment it shows under the body, with the part
 * number in the parameter "part" (mailbox:, imap:, news:, file: messages alike), and its file name in "filename" when
 * the part has one. A data: URI above the largest image is no source: it would cross to the background script three
 * times to be refused there.
 */
export function imageSource(src: string): ImageRequest["source"] | null {
  if (/^data:image\//i.test(src)) return src.length > (IMAGE_MAX_BYTES * 4) / 3 + 1000 ? null : { data: src }
  if (/^https?:/i.test(src)) {
    const url = remoteImageUrl(src)
    return url ? { url } : null
  }
  try {
    const params = new URL(src).searchParams
    const part = params.get("part")
    const name = params.get("filename")
    if (part && PART.test(part)) return { part, ...(name ? { name } : {}) }
  } catch {
    // Not an address.
  }
  return null
}

/** What the content script knows of an image: its natural size, its address, whether it lies in a signature and whether it is an attachment shown under the body. */
export interface ImageCandidate {
  width: number
  height: number
  src: string
  inSignature: boolean
  attachment: boolean
}

/** Why an image is left out by the content script. */
export type ImageFilterReason = "source" | "tracking" | "signature" | "small" | "area" | "aspect"

/**
 * The reason the content script leaves an image whose source it reads out, null when it passes: the sources of the
 * settings (a remote image is an image of the body); a side of 2 px or less is a tracking pixel, always; images in a
 * signature; the short side, the area and the ratio of the long side to the short one, on the natural size.
 */
export function filterShape(c: Omit<ImageCandidate, "src">, s: Pick<PublicImageSettings, "sources" | "skipSignature" | "minSide" | "minArea" | "maxAspect">): ImageFilterReason | null {
  if (!(c.attachment ? s.sources.attachments : s.sources.inline)) return "source"
  if (c.width <= 2 || c.height <= 2) return "tracking"
  if (c.inSignature && s.skipSignature) return "signature"
  const short = Math.min(c.width, c.height)
  if (short < s.minSide) return "small"
  if (c.width * c.height < s.minArea) return "area"
  if (Math.max(c.width, c.height) / short > s.maxAspect) return "aspect"
  return null
}

