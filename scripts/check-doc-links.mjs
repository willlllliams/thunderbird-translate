// Checks every relative link and anchor in the Markdown files of the repository, and that the files and directories
// named in code spans exist (checkCodePaths()).
// Anchors follow GitHub's rules: lower case, punctuation removed, spaces turned into "-",
// letters, marks and decimal digits of every script kept, images left out, and "-1", "-2"…
// appended to a heading whose anchor is already taken, until the anchor is free.
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
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`/g, "")
    .replace(/\*\*|__|\*/g, "")
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{Nd}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-")
}

/** The anchors of a Markdown text: one per heading, and those of <a name> and <a id>. */
export function anchorsOfText(text) {
  const anchors = new Set()
  /** How often each slug has been numbered, as GitHub counts. */
  const repeats = new Map()
  for (const line of proseLines(text)) {
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/)
    if (h) {
      const base = slug(h[1])
      let anchor = base
      while (anchors.has(anchor)) {
        const n = (repeats.get(base) ?? 0) + 1
        repeats.set(base, n)
        anchor = `${base}-${n}`
      }
      anchors.add(anchor)
    }
    for (const a of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) anchors.add(a[1])
  }
  return anchors
}

const anchorCache = new Map()
function anchorsOf(file) {
  if (!anchorCache.has(file)) anchorCache.set(file, anchorsOfText(readFileSync(file, "utf8")))
  return anchorCache.get(file)
}

/** Every broken relative link of the Markdown files under `dir`, and the number of links checked. */
export function checkLinks(dir = root) {
  const problems = []
  let checked = 0
  for (const file of markdownFiles(dir)) {
    const lines = proseLines(readFileSync(file, "utf8"))
    lines.forEach((raw, i) => {
      const line = raw.replace(/`[^`]*`/g, "")
      for (const m of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1]
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
        checked++
        const [pathPart, anchor] = target.split("#")
        const dest = pathPart ? resolve(dirname(file), decodeURIComponent(pathPart)) : file
        const where = `${relative(dir, file)}:${i + 1}`
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
  return { problems, checked }
}

/** Paths the documents name that are not part of the repository: build output, caches and installed packages. */
const NOT_IN_REPOSITORY = /(^|\/)(dist|web-ext-artifacts|\.cache|node_modules|coverage)(\/|$)/

/** Documents that name the paths of their time: the changelog and the archive. */
const historical = (rel) => rel === "CHANGELOG.md" || rel.startsWith("docs/archive/")

/** Files written by hand in this repository; a bare name with another extension (a bundle, a release asset, a report) is a generated file. */
const SOURCE_EXTENSION = /\.(ts|mjs|md|html|css)$/

/**
 * The path a code span names, or null: a path with "/" whose first part is a directory of the repository
 * (`docs/settings.md`, `background/router.ts`), or a bare name of a source file (`offline-admin.ts`). Left out: text
 * with spaces, placeholders such as <code> or wildcards, model names and other paths outside the repository
 * (`openai/gpt-4.1-mini`, `main/translations-models-v2`), and generated files. An anchor or query after the path and
 * a trailing "/" are dropped.
 */
export function pathOfSpan(span, directories) {
  const path = span.replace(/[#?].*$/, "").replace(/^\.\//, "").replace(/\/$/, "")
  if (!/^[\w./-]+$/.test(path)) return null
  if (path.includes("/")) return directories.has(path.split("/")[0]) ? path : null
  return SOURCE_EXTENSION.test(path) ? path : null
}

/** Every file and directory under `dir`, as paths relative to it with "/". */
function repositoryPaths(dir) {
  const paths = []
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      if (skipDirs.has(name)) continue
      const path = join(current, name)
      paths.push(relative(dir, path).split("\\").join("/"))
      if (statSync(path).isDirectory()) walk(path)
    }
  }
  walk(dir)
  return paths
}

/**
 * Every file or directory named in a code span of the Markdown files under `dir` that does not exist, and the number
 * of names checked. A name is looked for from the repository root, from the document's directory and from src/; a
 * name or partial path also counts when a path of the repository ends with it (`dictionary/manager.ts`). The
 * changelog and docs/archive/ are left out: they name the files of their time.
 */
export function checkCodePaths(dir = root) {
  const problems = []
  let checked = 0
  const paths = repositoryPaths(dir)
  const directories = new Set(paths.filter((p) => statSync(join(dir, p)).isDirectory()).map((p) => p.split("/").at(-1)))
  for (const file of markdownFiles(dir)) {
    const rel = relative(dir, file).split("\\").join("/")
    if (historical(rel)) continue
    proseLines(readFileSync(file, "utf8")).forEach((line, i) => {
      for (const m of line.matchAll(/`([^`]+)`/g)) {
        const path = pathOfSpan(m[1], directories)
        if (!path || NOT_IN_REPOSITORY.test(path)) continue
        checked++
        const found = [dir, dirname(file), join(dir, "src")].some((base) => existsSync(resolve(base, path))) || paths.some((p) => p === path || p.endsWith(`/${path}`))
        if (!found) problems.push(`${rel}:${i + 1}: no file or directory ${m[1]}`)
      }
    })
  }
  return { problems, checked }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const links = checkLinks()
  const paths = checkCodePaths()
  const problems = [...links.problems, ...paths.problems]
  if (problems.length) {
    console.error(problems.join("\n"))
    console.error(`${links.problems.length} broken of ${links.checked} relative links, ${paths.problems.length} missing of ${paths.checked} paths in code spans`)
    process.exit(1)
  }
  console.log(`${links.checked} relative links OK, ${paths.checked} paths in code spans OK`)
}
