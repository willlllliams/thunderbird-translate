// Checks the layers of src/: every relative import of a source file must point into a directory its layer may use.
// Import forms: import … from, import type … from, export … from, side-effect import "…", dynamic import("…"),
// also over several lines. npm packages are not checked; outside src/ only locales/*.json may be imported.
// The files of src/hooks/ hold no code that runs: they import types only.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The directories under src/ each layer may import from, besides itself. */
export const LAYERS = {
  shared: [],
  hooks: ["shared", "offline", "background", "content", "welcome"],
  offline: ["shared", "hooks"],
  background: ["shared", "offline", "hooks"],
  content: ["shared", "hooks"],
  popup: ["shared"],
  // The pages reach the offline data through the background script only, so no download or storage code goes into them.
  options: ["shared", "content"],
  welcome: ["shared", "content", "options", "hooks"],
  e2e: ["shared", "hooks", "offline", "background", "content", "popup", "options", "welcome"],
}

/** Layers whose files hold no code that runs: they may import types only (import type, export type). */
export const TYPE_ONLY_LAYERS = new Set(["hooks"])

/** The source with comments blanked out (newlines kept), so positions and line numbers stay as they are. */
export function withoutComments(text) {
  const blank = (s) => s.replace(/[^\n]/g, " ")
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s;{}])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)))
}

const IMPORT_PATTERNS = [
  // import x from, import { a, b } from (also over several lines), import type, import * as, export … from
  /\b(?:import|export)\s+(?<type>type\s+)?[\w$\s{},*]*?\bfrom\s*(?<q>["'])(?<spec>[^"'\n]+)\k<q>/g,
  // side-effect import
  /\bimport\s*(?<q>["'])(?<spec>[^"'\n]+)\k<q>/g,
  // dynamic import
  /\bimport\s*\(\s*(?<q>["'])(?<spec>[^"'\n]+)\k<q>\s*\)/g,
]

/** The import specifiers of a source text with their line numbers, in the order they appear; typeOnly for import type and export type. */
export function importsOf(text) {
  const code = withoutComments(text)
  const found = new Map()
  for (const pattern of IMPORT_PATTERNS) {
    for (const m of code.matchAll(pattern)) {
      const { q, spec, type } = m.groups
      const at = m.index + m[0].lastIndexOf(q + spec + q)
      found.set(at, { spec, line: code.slice(0, at).split("\n").length, typeOnly: type !== undefined })
    }
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([, v]) => v)
}

function sourceFiles(dir) {
  const files = []
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path))
    else if (/\.(ts|mts|js|mjs)$/.test(name) && !name.endsWith(".d.ts")) files.push(path)
  }
  return files
}

const posix = (path) => path.split(sep).join("/")

/** Every import of src/ under `dir` that crosses a layer boundary, and the number of relative imports checked. */
export function checkImports(dir = root) {
  const src = join(dir, "src")
  const problems = []
  let checked = 0
  for (const file of sourceFiles(src)) {
    const name = posix(relative(dir, file))
    const layer = posix(relative(src, file)).split("/")[0]
    const allowed = LAYERS[layer]
    if (!allowed) {
      problems.push(`${name}: directory src/${layer}/ belongs to no layer`)
      continue
    }
    for (const { spec, line, typeOnly } of importsOf(readFileSync(file, "utf8"))) {
      const where = `${name}:${line}`
      if (TYPE_ONLY_LAYERS.has(layer) && !typeOnly) problems.push(`${where}: ${layer} may import types only (${spec})`)
      if (!spec.startsWith(".")) continue
      checked++
      const target = posix(relative(dir, resolve(dirname(file), spec)))
      if (!target.startsWith("src/")) {
        if (!/^locales\/[^/]+\.json$/.test(target)) problems.push(`${where}: ${spec} is outside src/`)
        continue
      }
      const to = target.split("/")[1]
      if (to === layer || allowed.includes(to)) continue
      problems.push(`${where}: ${layer} must not import ${to} (${spec})`)
    }
  }
  return { problems, checked }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, checked } = checkImports()
  if (problems.length) {
    console.error(problems.join("\n"))
    console.error(`${problems.length} of ${checked} relative imports cross a layer boundary`)
    process.exit(1)
  }
  console.log(`${checked} relative imports OK`)
}
