// The release notes of a version: its section of CHANGELOG.md, without the heading, with relative links made absolute
// (a release page resolves them against nothing). The workflow .github/workflows/release.yml writes them to a file and
// creates the release with it; a version without a section of its own fails.
//
// Usage: node scripts/release-notes.mjs <version> <output file>
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The repository the relative links of CHANGELOG.md point into. */
export const DEFAULT_REPOSITORY = "willlllliams/thunderbird-translate"

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The text of the section "## <version> - <date>" of `changelog`, up to the next "## " heading, trimmed. Relative links
 * point to the file at the tag v<version> of `repository`. Throws when the section is missing or empty.
 */
export function releaseNotes(changelog, version, repository = DEFAULT_REPOSITORY) {
  const lines = changelog.replace(/\r\n?/g, "\n").split("\n")
  const heading = new RegExp(`^## ${escape(version)}(\\s+-\\s+.*)?\\s*$`)
  const start = lines.findIndex((line) => heading.test(line))
  if (start === -1) throw new Error(`CHANGELOG.md has no section "## ${version} - <date>"`)
  const next = lines.findIndex((line, i) => i > start && line.startsWith("## "))
  const body = lines
    .slice(start + 1, next === -1 ? undefined : next)
    .join("\n")
    .trim()
  if (!body) throw new Error(`The section of ${version} in CHANGELOG.md is empty`)
  const base = `https://github.com/${repository}/blob/v${version}/`
  // [text](path) with a relative path, not an anchor of this page: absolute, at the tag of the version.
  return `${body.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (_, path) => `](${base}${path.replace(/^\.\//, "")})`)}\n`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, out] = process.argv.slice(2)
  if (!version || !out) {
    console.error("Usage: node scripts/release-notes.mjs <version> <output file>")
    process.exit(1)
  }
  try {
    const notes = releaseNotes(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version, process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY)
    writeFileSync(out, notes)
    console.log(`release notes of ${version}: ${notes.split("\n").length - 1} lines, written to ${out}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
