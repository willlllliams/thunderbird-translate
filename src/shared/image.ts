/**
 * The images of a displayed message as the content script sees them: where
 * an image comes from, read off its address, and the filters on its natural
 * size and its place, which come before anything is read or sent. The
 * filters on the bytes run in the background script (background/images.ts).
 */

import type { PublicImageSettings } from "./settings"

/** Where an image comes from: a part of the message (with the file name of its address), a data: URI, a remote address, or anything else (an unreplaced cid:, a blob:). */
export type ImageSource = { kind: "part"; part: string; name?: string } | { kind: "data"; data: string } | { kind: "remote" } | { kind: "other" }

/** A part number as libmime writes it: "1.2", "1.1.3". */
const PART = /^\d+(?:\.\d+)*$/

/**
 * The source of an image by its address. Thunderbird puts the address of the message part in place of a cid:
 * reference and of an image attachment it shows under the body, with the part number in the parameter "part"
 * (mailbox:, imap:, news:, file: messages alike), and its file name in "filename" when the part has one.
 */
export function imageSource(src: string): ImageSource {
  if (/^data:image\//i.test(src)) return { kind: "data", data: src }
  if (/^https?:/i.test(src)) return { kind: "remote" }
  try {
    const params = new URL(src).searchParams
    const part = params.get("part")
    const name = params.get("filename")
    if (part && PART.test(part)) return { kind: "part", part, ...(name ? { name } : {}) }
  } catch {
    // Not an address.
  }
  return { kind: "other" }
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
export type ImageFilterReason = "remote" | "source" | "tracking" | "signature" | "small" | "area" | "aspect"

/**
 * The reason the content script leaves an image out, null when it passes: remote images never go anywhere; the
 * sources of the settings; a side of 2 px or less is a tracking pixel, always; images in a signature; the short side,
 * the area and the ratio of the long side to the short one, on the natural size.
 */
export function filterImage(c: ImageCandidate, s: Pick<PublicImageSettings, "sources" | "skipSignature" | "minSide" | "minArea" | "maxAspect">): ImageFilterReason | null {
  const source = imageSource(c.src)
  if (source.kind === "remote") return "remote"
  if (source.kind === "other" || !(c.attachment ? s.sources.attachments : s.sources.inline)) return "source"
  if (c.width <= 2 || c.height <= 2) return "tracking"
  if (c.inSignature && s.skipSignature) return "signature"
  const short = Math.min(c.width, c.height)
  if (short < s.minSide) return "small"
  if (c.width * c.height < s.minArea) return "area"
  if (Math.max(c.width, c.height) / short > s.maxAspect) return "aspect"
  return null
}
