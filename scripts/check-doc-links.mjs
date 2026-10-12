// Checks every relative link and anchor in the Markdown files of the repository.
// Anchors follow GitHub's rules: lower case, punctuation removed, spaces turned into "-",
// letters of every script kept, "-1", "-2"… appended to repeated headings.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const skipDirs = new Set(["node_modules", "dist", ".cache", "web-ext-artifacts", ".git", "coverage"])

function markdownFiles(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files.push(...markdownFiles(path))
    else if (name.endsWith(".md")) files.push(path)
  }
  return files
}

/** Lines outside fenced code blocks, with inline code spans blanked for link scanning. */
function proseLines(text) {
  const lines = []
  let fence = null
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(```+|~~~+)/)
    if (m) {
      if (!fence) fence = m[1][0]
      else if (m[1][0] === fence) fence = null
      lines.push("")
      continue
    }
    lines.push(fence ? "" : line)
  }
  return lines
}

export function slug(heading) {
  const text = heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`/g, "")
    .replace(/\*\*|__|\*/g, "")
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-")
}

const anchorCache = new Map()
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file)
  const anchors = new Set()
  const seen = new Map()
  const text = readFileSync(file, "utf8")
  for (const line of proseLines(text)) {
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/)
    if (h) {
      const base = slug(h[1])
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      anchors.add(n ? `${base}-${n}` : base)
    }
    for (const a of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) anchors.add(a[1])
  }
  anchorCache.set(file, anchors)
  return anchors
}

const problems = []
let checked = 0
for (const file of markdownFiles(root)) {
  const lines = proseLines(readFileSync(file, "utf8"))
  lines.forEach((raw, i) => {
    const line = raw.replace(/`[^`]*`/g, "")
    for (const m of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1]
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      checked++
      const [pathPart, anchor] = target.split("#")
      const dest = pathPart ? resolve(dirname(file), decodeURIComponent(pathPart)) : file
      const where = `${relative(root, file)}:${i + 1}`
      if (!existsSync(dest)) {
        problems.push(`${where}: missing file ${target}`)
        continue
      }
      if (anchor !== undefined) {
        if (!dest.endsWith(".md")) {
          problems.push(`${where}: anchor on a non-Markdown file ${target}`)
          continue
        }
        if (!anchorsOf(dest).has(decodeURIComponent(anchor))) problems.push(`${where}: missing anchor ${target}`)
      }
    }
  })
}

if (problems.length) {
  console.error(problems.join("\n"))
  console.error(`${problems.length} broken of ${checked} relative links`)
  process.exit(1)
}
console.log(`${checked} relative links OK`)
