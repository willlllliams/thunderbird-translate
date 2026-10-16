/** The source archive for the add-on site (scripts/source-zip.mjs, npm run source-zip). */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { unzipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { SOURCE_MTIME, sourceFiles, sourceZip } from "../scripts/source-zip.mjs"

const root = join(__dirname, "..")
const tree = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => (statSync(join(root, dir, name)).isDirectory() ? tree(`${dir}/${name}`) : [`${dir}/${name}`]))

describe("source archive", () => {
  it("holds what npm ci and npm run build read, without the e2e build, the experimental build, the tests and the documents", () => {
    const files = sourceFiles()
    for (const file of ["package.json", "package-lock.json", "tsconfig.json", "LICENSE", "SOURCE-BUILD.md", "scripts/build.mjs", "static/manifest.json", "locales/en.json", "vendor/bergamot/bergamot-translator.wasm.zst", "vendor/bergamot/bergamot-translator.js", "licenses/Apache-2.0.txt"]) {
      expect(files).toContain(file)
    }
    expect(files.filter((f) => f.startsWith("src/")).sort()).toEqual(tree("src").filter((f) => !f.startsWith("src/e2e/") && !f.startsWith("src/experiments/")).sort())
    expect(files.filter((f) => !/^(src|static|scripts|locales|vendor|licenses)\//.test(f))).toEqual(["LICENSE", "SOURCE-BUILD.md", "VENDOR.md", "package-lock.json", "package.json", "tsconfig.json"])
    expect(files).not.toContain("scripts/live-test.mjs")
    expect(files).toEqual([...files].sort())
  })

  it("is the same byte for byte when made again, with one time stamp for every entry", () => {
    const zip = sourceZip()
    expect(Buffer.from(sourceZip()).equals(Buffer.from(zip))).toBe(true)
    const entries = unzipSync(zip)
    expect(Object.keys(entries).sort()).toEqual(sourceFiles())
    // The DOS date and time of the first local header: 2026-01-01 00:00 in every time zone.
    const view = new DataView(zip.buffer, zip.byteOffset)
    expect([view.getUint16(10, true), view.getUint16(12, true)]).toEqual([0, ((2026 - 1980) << 9) | (1 << 5) | 1])
    expect([SOURCE_MTIME.getFullYear(), SOURCE_MTIME.getMonth(), SOURCE_MTIME.getDate(), SOURCE_MTIME.getHours()]).toEqual([2026, 0, 1, 0])
  })
})
