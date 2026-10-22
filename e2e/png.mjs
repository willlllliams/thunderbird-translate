// PNG files for the e2e fixtures and the mock server: deterministic pixels, so a file is the same on every run.
import { crc32, deflateSync } from "node:zlib"

/** A PNG of width × height, RGB, with the colour of each pixel from `pixel(x, y)`. */
export function png(width, height, pixel) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, "ascii")
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) >>> 0, 0)
    return Buffer.concat([head, data, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}

/** Deterministic noise in 0–255. */
export const noise = (x, y) => (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 24) & 255

/** The remote image of the "image-remote" run (e2e/mock-server.mjs, /remote/offer.png): a banner with dark labels on white, 400 × 200. */
export const remoteOffer = png(400, 200, (x, y) => {
  if (y < 6) return [noise(x, y), noise(x + 1, y), noise(y, x)]
  if (y > 40 && y < 70 && x > 30 && x < 370) return [25, 25, 25]
  if (y > 120 && y < 140 && x > 30 && x < 250) return [200, 40, 40]
  return [255, 255, 255]
})

/** A 1 × 1 tracking pixel. */
export const remotePixel = png(1, 1, () => [255, 255, 255])
