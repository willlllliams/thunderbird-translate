// The source archive for the add-on site: npm run source-zip writes
// web-ext-artifacts/thunderbird-translate-<version>-source.zip with everything `npm ci` and `npm run build` need,
// and nothing else: the sources without the e2e test build (src/e2e/), which a regular build never reads, the static
// files, the build scripts, the interface texts, the vendored Bergamot engine, the license texts, the package files
// and SOURCE-BUILD.md. The files are those git tracks, as the last commit holds them (line endings included), so
// untracked and changed files stay out; the command refuses a tree with changes under these paths, so the archive is
// the one of the commit it names. Files are sorted and every entry has the same time stamp, so the archive of one
// commit is the same byte for byte wherever it is made. The release workflow makes it and attaches it to the release.
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { zipSync } from "fflate"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** Directories of the archive, and directories inside them that stay out. */
export const SOURCE_DIRS = ["src", "static", "scripts", "locales", "vendor", "licenses"]
export const EXCLUDED_DIRS = ["src/e2e"]
/** Files inside them that stay out: the test of the real Google and Microsoft endpoints (npm run live-test), which no build runs. */
export const EXCLUDED_FILES = ["scripts/live-test.mjs"]
/** Single files of the archive. */
export const SOURCE_FILES = ["package.json", "package-lock.json", "tsconfig.json", "LICENSE", "SOURCE-BUILD.md", "VENDOR.md"]
/** Time stamp of every entry, 2026-01-01 00:00: a zip stores local time, so the date is made from local fields (see scripts/build.mjs). */
export const SOURCE_MTIME = new Date(2026, 0, 1)

const posix = (path) => path.split(sep).join("/")
const git = (base, args, input) => execFileSync("git", args, { cwd: base, input, maxBuffer: 1 << 30 })

/** The paths of the archive in the last commit of the git tree `base`, sorted. */
export function sourceFiles(base = root) {
  const listed = git(base, ["ls-tree", "-r", "-z", "--name-only", "HEAD", "--", ...SOURCE_DIRS, ...SOURCE_FILES]).toString("utf8").split("\0").filter(Boolean)
  const files = listed.filter((file) => !EXCLUDED_DIRS.some((dir) => file.startsWith(`${dir}/`)) && !EXCLUDED_FILES.includes(file))
  for (const path of [...SOURCE_DIRS, ...SOURCE_FILES]) {
    if (!files.some((file) => file === path || file.startsWith(`${path}/`))) throw new Error(`source archive: ${path} is not in the last commit`)
  }
  return files.sort()
}

/** The changes under the paths of the archive that are not committed, as `git status --porcelain` lists them; empty for a clean tree. */
export function uncommitted(base = root) {
  return git(base, ["status", "--porcelain", "--untracked-files=no", "--", ...SOURCE_DIRS, ...SOURCE_FILES]).toString("utf8").trim()
}

/** The contents of `files` in the last commit, read in one call of git. */
function committed(base, files) {
  const out = git(base, ["cat-file", "--batch"], files.map((file) => `HEAD:${file}`).join("\n") + "\n")
  const entries = {}
  let at = 0
  for (const file of files) {
    const end = out.indexOf(10, at)
    const [, type, size] = out.subarray(at, end).toString("utf8").split(" ")
    if (type !== "blob") throw new Error(`source archive: ${file} is no file of the last commit`)
    entries[file] = new Uint8Array(out.subarray(end + 1, end + 1 + Number(size)))
    at = end + 1 + Number(size) + 1
  }
  return entries
}

/** The archive as bytes. */
export function sourceZip(base = root) {
  return zipSync(committed(base, sourceFiles(base)), { level: 9, mtime: SOURCE_MTIME })
}

// node scripts/source-zip.mjs [tree]: the tree of this script when none is named.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] ? resolve(process.argv[2]) : root
  const changes = uncommitted(base)
  if (changes) {
    console.error(`source archive: commit or stash these changes first, the archive holds the last commit:\n${changes}`)
    process.exit(1)
  }
  const { version } = JSON.parse(readFileSync(join(base, "static", "manifest.json"), "utf8"))
  const out = join(base, "web-ext-artifacts", `thunderbird-translate-${version}-source.zip`)
  mkdirSync(dirname(out), { recursive: true })
  const zip = sourceZip(base)
  writeFileSync(out, zip)
  console.log(`packed ${posix(relative(base, out))} (${(zip.length / 1024).toFixed(0)} KiB, ${sourceFiles(base).length} files)`)
}
