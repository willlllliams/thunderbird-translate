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

  it("are declared in VENDOR.md, for the source review, with the upstream addresses vendor/bergamot/README.md names", () => {
    const vendor = readFileSync(join(__dirname, "..", "VENDOR.md"), "utf8")
    const entries = [...vendor.matchAll(/^(\S+):\n- Version: .+\n- URL: (https:\/\/\S+)$/gm)].map(([, file, url]) => [file, url])
    expect(entries.map(([file]) => file)).toEqual(["vendor/bergamot/bergamot-translator.js", "vendor/bergamot/bergamot-translator.wasm.zst"])
    expect(entries[0][1]).toBe("https://raw.githubusercontent.com/mozilla-firefox/firefox/48d55cf7ec80093903e2ef7f58b61a84a22ef716/toolkit/components/translations/bergamot-translator/bergamot-translator.js")
    expect(readme).toContain("48d55cf7ec80093903e2ef7f58b61a84a22ef716")
    expect(entries[1][1]).toBe(`https://firefox-settings-attachments.cdn.mozilla.net/${BERGAMOT_WASM.location}`)
    expect(readme).toContain(entries[1][1])
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
