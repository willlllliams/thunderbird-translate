/**
 * What the background script reads off the bytes of an image file before anything is decoded: its type, whether it
 * is animated, its size, and the bytes of a data: URI. Every parser starts from the type of sniffImageType().
 */

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))

/** The media type of an image read off the first bytes of its file: PNG, GIF, JPEG or WebP; null for anything else. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "image/png"
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif"
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp"
  return null
}

/**
 * Whether the bytes are an animated image, read from the content, never from a name: a GIF with a second image
 * descriptor (the blocks are skipped by their lengths, so the scan takes time linear in the size), a WebP whose VP8X
 * chunk has the animation flag, a PNG with an acTL chunk before its image data (APNG). A truncated file counts the
 * frames it holds.
 */
export function isAnimated(bytes: Uint8Array): boolean {
  switch (sniffImageType(bytes)) {
    case "image/gif":
      return gifFrames(bytes) > 1
    case "image/webp":
      return ascii(bytes, 12, 4) === "VP8X" && ((bytes[20] ?? 0) & 0x02) !== 0
    case "image/png": {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      for (let at = 8; at + 8 <= bytes.length; ) {
        const type = ascii(bytes, at + 4, 4)
        if (type === "acTL") return true
        if (type === "IDAT") return false
        at += 12 + view.getUint32(at)
      }
      return false
    }
    default:
      return false
  }
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

/** Start-of-frame markers of JPEG that carry the size: SOF0 to SOF15 without DHT (C4), JPG (C8) and DAC (CC). */
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

/**
 * The size of an image from the header of its file, before anything is decoded: the IHDR chunk of a PNG, the logical
 * screen of a GIF, the start of frame of a JPEG (the segments before it are skipped by their lengths), the VP8, VP8L
 * or VP8X chunk of a WebP. Null for another format and for a file that ends before its size.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const has = (end: number) => bytes.length >= end
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  switch (sniffImageType(bytes)) {
    case "image/png":
      return has(24) && ascii(bytes, 12, 4) === "IHDR" ? { width: view.getUint32(16), height: view.getUint32(20) } : null
    case "image/gif":
      return has(10) ? { width: view.getUint16(6, true), height: view.getUint16(8, true) } : null
    case "image/jpeg":
      for (let at = 2; has(at + 4); ) {
        if (bytes[at] !== 0xff) return null
        const marker = bytes[at + 1]
        if (marker === 0xff) {
          at++
          continue
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
          at += 2
          continue
        }
        if (JPEG_SOF.has(marker)) return has(at + 9) ? { width: view.getUint16(at + 7), height: view.getUint16(at + 5) } : null
        at += 2 + view.getUint16(at + 2)
      }
      return null
    case "image/webp": {
      const chunk = ascii(bytes, 12, 4)
      if (chunk === "VP8 " && has(30)) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
      if (chunk === "VP8L" && has(25)) {
        const bits = view.getUint32(21, true)
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      }
      const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
      return chunk === "VP8X" && has(30) ? { width: u24(24) + 1, height: u24(27) + 1 } : null
    }
    default:
      return null
  }
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
