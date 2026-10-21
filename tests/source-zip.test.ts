/** The source archive for the add-on site (scripts/source-zip.mjs, npm run source-zip). */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unzipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { SOURCE_DIRS, SOURCE_FILES, SOURCE_MTIME, sourceFiles, sourceZip, uncommitted } from "../scripts/source-zip.mjs"

const root = join(__dirname, "..")
const script = join(root, "scripts", "source-zip.mjs")
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" })
/** The files git tracks under `dir` in the last commit of this repository. */
const tracked = (dir: string) => git(root, "ls-tree", "-r", "--name-only", "HEAD", "--", dir).split("\n").filter(Boolean)

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A git repository with one committed file in each path of the archive. */
function repository(): string {
  const dir = mkdtempSync(join(tmpdir(), "tt-source-zip-"))
  temps.push(dir)
  for (const sub of SOURCE_DIRS) {
    mkdirSync(join(dir, sub), { recursive: true })
    writeFileSync(join(dir, sub, "a.txt"), `${sub}\n`)
  }
  for (const file of SOURCE_FILES) writeFileSync(join(dir, file), file === "package.json" ? "{}\n" : `${file}\n`)
  writeFileSync(join(dir, "static", "manifest.json"), '{"version":"9.9.9"}\n')
  git(dir, "init", "-q")
  git(dir, "add", ".")
  git(dir, "commit", "-q", "-m", "first")
  return dir
}

describe("source archive", () => {
  it("holds what npm ci and npm run build read, without the e2e build, the experimental build, the tests and the documents", () => {
    const files = sourceFiles()
    for (const file of ["package.json", "package-lock.json", "tsconfig.json", "LICENSE", "SOURCE-BUILD.md", "scripts/build.mjs", "static/manifest.json", "locales/en.json", "vendor/bergamot/bergamot-translator.wasm.zst", "vendor/bergamot/bergamot-translator.js", "licenses/Apache-2.0.txt"]) {
      expect(files).toContain(file)
    }
    expect(files.filter((f) => f.startsWith("src/")).sort()).toEqual(tracked("src").filter((f) => !f.startsWith("src/e2e/") && !f.startsWith("src/experiments/")).sort())
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

  it("I6: holds the files of the last commit, without untracked files and with the committed contents", () => {
    const dir = repository()
    writeFileSync(join(dir, "src", "untracked.ts"), "export {}\n")
    expect(sourceFiles(dir)).not.toContain("src/untracked.ts")
    // A change in the tree does not reach the archive; an untracked file alone leaves the tree clean.
    expect(uncommitted(dir)).toBe("")
    writeFileSync(join(dir, "src", "a.txt"), "changed\n")
    expect(new TextDecoder().decode(unzipSync(sourceZip(dir))["src/a.txt"])).toBe("src\n")
    expect(uncommitted(dir)).toContain("src/a.txt")
  }, 20000)

  it("I6: the command refuses a tree with changes that are not committed, and packs a clean one", () => {
    const dir = repository()
    writeFileSync(join(dir, "src", "a.txt"), "changed\n")
    const refused = spawnSync(process.execPath, [script, dir], { encoding: "utf8" })
    expect(refused.status).not.toBe(0)
    expect(refused.stderr).toContain("src/a.txt")
    git(dir, "commit", "-q", "-am", "second")
    const packed = spawnSync(process.execPath, [script, dir], { encoding: "utf8" })
    expect(packed.status).toBe(0)
    expect(packed.stdout).toContain("thunderbird-translate-9.9.9-source.zip")
  }, 20000)
})
