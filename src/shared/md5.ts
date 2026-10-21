/**
 * MD5 (RFC 1321) of the UTF-8 bytes of a string, as 32 lower-case hex
 * digits. Baidu Translate signs its requests with it, and Web Crypto has no
 * MD5. Not for anything that needs a secure hash.
 */

/** Per-round shift amounts, four per round. */
const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
/** K[i] = floor(abs(sin(i + 1)) * 2^32). */
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text)
  // Message, the bit 1, zeros up to 56 bytes modulo 64, then the length in bits as 64-bit little endian.
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, (bytes.length * 8) >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(bytes.length / 0x20000000), true)

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  const m = new Array<number>(16)
  for (let block = 0; block < padded.length; block += 64) {
    for (let j = 0; j < 16; j++) m[j] = view.getUint32(block + j * 4, true)
    let [a, b, c, d] = h
    for (let i = 0; i < 64; i++) {
      const round = i >> 4
      let f: number
      let g: number
      if (round === 0) [f, g] = [(b & c) | (~b & d), i]
      else if (round === 1) [f, g] = [(d & b) | (~d & c), (5 * i + 1) % 16]
      else if (round === 2) [f, g] = [b ^ c ^ d, (3 * i + 5) % 16]
      else [f, g] = [c ^ (b | ~d), (7 * i) % 16]
      const sum = (a + f + K[i] + m[g]) | 0
      const s = SHIFTS[round * 4 + (i % 4)]
      ;[a, d, c] = [d, c, b]
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0
    }
    h[0] = (h[0] + a) | 0
    h[1] = (h[1] + b) | 0
    h[2] = (h[2] + c) | 0
    h[3] = (h[3] + d) | 0
  }
  const out = new DataView(new ArrayBuffer(16))
  h.forEach((word, i) => out.setUint32(i * 4, word, true))
  return Array.from(new Uint8Array(out.buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
