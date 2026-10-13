export const BERGAMOT_WASM: {
  name: string
  release: string
  version: string
  revision: string
  location: string
  size: number
  hash: string
  decompressedSize: number
  decompressedHash: string
}
export const BERGAMOT_WASM_FILE: string
export const VENDOR_WASM: string
export function verifyBergamotWasm(bytes: Uint8Array): void
export function ensureBergamotWasm(vendorFile?: string): Promise<string>
