/**
 * cyrb53: fast, well-distributed 53-bit string hash (public domain, bryc).
 * Two seeds give ~106 bits, which keeps cache-key collisions negligible.
 */
function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function hashText(str: string): string {
  return cyrb53(str, 0).toString(36) + cyrb53(str, 0x9e3779b9).toString(36) + str.length.toString(36)
}

/** Hex SHA-256 of downloaded files (dictionary packs, offline models). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>))
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")
}
