/** sha256 checks and zstd decompression of model files. */

import { decompress } from "fzstd"

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

export interface ExpectedFile {
  name: string
  /** sha256 of the compressed bytes. */
  hash: string
  decompressedHash: string
  decompressedSize: number
}

export type VerifyFailure = { ok: false; stage: "compressed" | "decompressed" | "zstd"; detail: string }
export type VerifyResult = { ok: true } | VerifyFailure

/** Check the compressed hash, decompress, then check the decompressed size and hash. */
export async function verifyModelFile(compressed: Uint8Array, expected: ExpectedFile): Promise<VerifyResult> {
  const outer = await sha256Hex(compressed)
  if (outer !== expected.hash.toLowerCase()) return { ok: false, stage: "compressed", detail: `sha256 ${outer}, expected ${expected.hash}` }
  let raw: Uint8Array
  try {
    raw = decompress(compressed)
  } catch (e) {
    return { ok: false, stage: "zstd", detail: e instanceof Error ? e.message : String(e) }
  }
  if (expected.decompressedSize && raw.byteLength !== expected.decompressedSize) {
    return { ok: false, stage: "decompressed", detail: `${raw.byteLength} bytes, expected ${expected.decompressedSize}` }
  }
  const inner = await sha256Hex(raw)
  if (inner !== expected.decompressedHash.toLowerCase()) return { ok: false, stage: "decompressed", detail: `sha256 ${inner}, expected ${expected.decompressedHash}` }
  return { ok: true }
}

export { decompress as zstdDecompress }
