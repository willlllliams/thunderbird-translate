// The Bergamot translation engine (WebAssembly, zstd-compressed) that the
// extension ships, checked against pinned hashes.
//
// The repository keeps the file in vendor/bergamot/ (see vendor/bergamot/README.md),
// so a build needs no network. Only when that file is missing is it downloaded
// from its source and cached in .cache/: Mozilla Remote Settings, collection
// main/translations-wasm-v2, the record Firefox and Thunderbird use with
// bergamot-translator.js v0.6.0+eea6e5a8 (vendor/bergamot/). The file stays
// compressed in the xpi; the worker decompresses it with fzstd at run time.
//
// Usage: node scripts/fetch-bergamot.mjs   (npm run build calls ensureBergamotWasm())
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { decompress } from "fzstd"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

/** Remote Settings record main/translations-wasm-v2/ce71828c-5e7a-4024-8f18-03064bf0b9f0. */
export const BERGAMOT_WASM = {
  name: "bergamot-translator",
  release: "v0.6.0",
  version: "4.0",
  revision: "1de4a085d3a7afb625c51a60aabb5ad298e4059f",
  location: "main-workspace/translations-wasm-v2/a76f9efe-b185-4a7f-9c3b-5f5d216d12e6.zst",
  size: 1211955,
  /** sha256 of the zstd file. */
  hash: "327fcfc7b7e9d95f6fa0844ebf899cfc05469872ef02d3aef5783182839a6255",
  decompressedSize: 4960506,
  /** sha256 of the decompressed .wasm. */
  decompressedHash: "f38ef807636a7c994afedaab7ff8ffe0d590d21897f05139f747b80fd7bbe926",
}

/** File name inside the extension. */
export const BERGAMOT_WASM_FILE = "bergamot-translator.wasm.zst"

const SERVER = "https://firefox.settings.services.mozilla.com/v1/"
const FALLBACK_ATTACHMENTS = "https://firefox-settings-attachments.cdn.mozilla.net/"
/** The copy in the repository. */
export const VENDOR_WASM = join(root, "vendor", "bergamot", BERGAMOT_WASM_FILE)
const cacheDir = join(root, ".cache", "bergamot")
const cacheFile = join(cacheDir, BERGAMOT_WASM_FILE)

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

/** Throws unless `bytes` is the pinned engine (compressed and decompressed hashes). */
export function verifyBergamotWasm(bytes) {
  const hash = sha256(bytes)
  if (hash !== BERGAMOT_WASM.hash) throw new Error(`bergamot wasm: sha256 ${hash}, expected ${BERGAMOT_WASM.hash}`)
  const wasm = decompress(bytes)
  const inner = sha256(wasm)
  if (wasm.length !== BERGAMOT_WASM.decompressedSize || inner !== BERGAMOT_WASM.decompressedHash) {
    throw new Error(`bergamot wasm: decompressed sha256 ${inner} (${wasm.length} bytes), expected ${BERGAMOT_WASM.decompressedHash}`)
  }
}

async function attachmentsBase() {
  try {
    const res = await fetch(SERVER)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const base = (await res.json())?.capabilities?.attachments?.base_url
    if (typeof base === "string" && base) return base.endsWith("/") ? base : `${base}/`
  } catch (e) {
    console.warn(`bergamot: ${SERVER} unavailable (${e instanceof Error ? e.message : e}), using ${FALLBACK_ATTACHMENTS}`)
  }
  return FALLBACK_ATTACHMENTS
}

/**
 * Path of the verified .wasm.zst: the copy in vendor/bergamot/, which must match the pinned hashes; without it the
 * copy in .cache/, downloaded on first use.
 */
export async function ensureBergamotWasm(vendorFile = VENDOR_WASM) {
  if (existsSync(vendorFile)) {
    verifyBergamotWasm(readFileSync(vendorFile))
    return vendorFile
  }
  console.warn(`bergamot: ${vendorFile} is missing, using the download cache`)
  if (existsSync(cacheFile)) {
    try {
      verifyBergamotWasm(readFileSync(cacheFile))
      return cacheFile
    } catch (e) {
      console.warn(`bergamot: cached file rejected (${e.message}), downloading again`)
    }
  }
  const url = (await attachmentsBase()) + BERGAMOT_WASM.location
  console.log(`bergamot: downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`bergamot: ${url} answered HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  verifyBergamotWasm(bytes)
  mkdirSync(cacheDir, { recursive: true })
  const tmp = `${cacheFile}.part`
  writeFileSync(tmp, bytes)
  renameSync(tmp, cacheFile)
  return cacheFile
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const file = await ensureBergamotWasm()
  console.log(`bergamot: ${file} (${BERGAMOT_WASM.size} bytes, sha256 ${BERGAMOT_WASM.hash})`)
}
