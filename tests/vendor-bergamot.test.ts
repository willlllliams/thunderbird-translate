/** The Bergamot engine kept in vendor/bergamot/ (scripts/fetch-bergamot.mjs): the build takes it without network and checks it. */
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { BERGAMOT_WASM, ensureBergamotWasm, VENDOR_WASM, verifyBergamotWasm } from "../scripts/fetch-bergamot.mjs"

const readme = readFileSync(join(__dirname, "..", "vendor", "bergamot", "README.md"), "utf8")

describe("vendored Bergamot engine", () => {
  it("is the pinned file, used by the build as it is, and named with its hashes in vendor/bergamot/README.md", async () => {
    const bytes = readFileSync(VENDOR_WASM)
    expect(bytes.byteLength).toBe(BERGAMOT_WASM.size)
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BERGAMOT_WASM.hash)
    expect(() => verifyBergamotWasm(bytes)).not.toThrow()
    expect(await ensureBergamotWasm()).toBe(VENDOR_WASM)
    for (const value of [BERGAMOT_WASM.hash, BERGAMOT_WASM.decompressedHash, BERGAMOT_WASM.revision, BERGAMOT_WASM.release, BERGAMOT_WASM.location]) expect(readme).toContain(value)
  })

  it("stops the build when the vendored file differs from the pinned one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bergamot-"))
    try {
      const file = join(dir, "bergamot-translator.wasm.zst")
      const bytes = readFileSync(VENDOR_WASM)
      bytes[100] ^= 0xff
      writeFileSync(file, bytes)
      await expect(ensureBergamotWasm(file)).rejects.toThrow(`expected ${BERGAMOT_WASM.hash}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
