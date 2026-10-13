// The source archive for the add-on site: npm run source-zip writes
// web-ext-artifacts/thunderbird-translate-<version>-source.zip with everything `npm ci` and `npm run build` need,
// and nothing else: the sources without the e2e test build (src/e2e/, which a regular build never reads), the static
// files, the build scripts, the interface texts, the vendored Bergamot engine, the license texts, the package files
// and SOURCE-BUILD.md. Files are sorted and every entry has the same time stamp, so the archive of one commit is the
// same byte for byte wherever it is made.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
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

function walk(base, dir, files) {
  for (const name of readdirSync(join(base, dir)).sort()) {
    const rel = `${dir}/${name}`
    if (statSync(join(base, rel)).isDirectory()) {
      if (!EXCLUDED_DIRS.includes(rel)) walk(base, rel, files)
    } else if (!EXCLUDED_FILES.includes(rel)) files.push(rel)
  }
}

/** The paths of the archive in the tree `base`, sorted. */
export function sourceFiles(base = root) {
  const files = []
  for (const dir of SOURCE_DIRS) {
    if (!existsSync(join(base, dir))) throw new Error(`source archive: ${dir}/ is missing`)
    walk(base, dir, files)
  }
  for (const file of SOURCE_FILES) {
    if (!existsSync(join(base, file))) throw new Error(`source archive: ${file} is missing`)
    files.push(file)
  }
  return files.sort()
}

/** The archive as bytes. */
export function sourceZip(base = root) {
  const entries = {}
  for (const file of sourceFiles(base)) entries[file] = new Uint8Array(readFileSync(join(base, file)))
  return zipSync(entries, { level: 9, mtime: SOURCE_MTIME })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync(join(root, "static", "manifest.json"), "utf8"))
  const out = join(root, "web-ext-artifacts", `thunderbird-translate-${version}-source.zip`)
  mkdirSync(dirname(out), { recursive: true })
  const zip = sourceZip()
  writeFileSync(out, zip)
  console.log(`packed ${posix(relative(root, out))} (${(zip.length / 1024).toFixed(0)} KiB, ${sourceFiles().length} files)`)
}
