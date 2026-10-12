// Checks the layers of src/: every relative import of a source file must point into a directory its layer may use.
// Import forms: import … from, import type … from, export … from, side-effect import "…", dynamic import("…"),
// also over several lines. npm packages are not checked; outside src/ only locales/*.json may be imported.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The directories under src/ each layer may import from, besides itself. */
export const LAYERS = {
  shared: [],
  offline: ["shared"],
  background: ["shared", "offline"],
  content: ["shared"],
  popup: ["shared"],
  options: ["shared", "offline", "content"],
  welcome: ["shared", "offline", "content", "options"],
  e2e: ["shared", "offline", "background", "content", "popup", "options", "welcome"],
}

/**
 * Production files that still import the e2e hooks of src/e2e/ (removed by the __E2E__ define in every
 * other build). They are allowed until the hooks are injected from the outside.
 */
export const E2E_IMPORTERS = new Set(["src/background/index.ts", "src/content/client.ts", "src/welcome/index.ts"])

/** The source with comments blanked out (newlines kept), so positions and line numbers stay as they are. */
export function withoutComments(text) {
  const blank = (s) => s.replace(/[^\n]/g, " ")
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s;{}])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)))
}

const IMPORT_PATTERNS = [
  // import x from, import { a, b } from (also over several lines), import type, import * as, export … from
  /\b(?:import|export)\s+(?:type\s+)?[\w$\s{},*]*?\bfrom\s*(["'])([^"'\n]+)\1/g,
  // side-effect import
  /\bimport\s*(["'])([^"'\n]+)\1/g,
  // dynamic import
  /\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g,
]

/** The import specifiers of a source text with their line numbers, in the order they appear. */
export function importsOf(text) {
  const code = withoutComments(text)
  const found = new Map()
  for (const pattern of IMPORT_PATTERNS) {
    for (const m of code.matchAll(pattern)) {
      const at = m.index + m[0].lastIndexOf(m[1] + m[2] + m[1])
      found.set(at, { spec: m[2], line: code.slice(0, at).split("\n").length })
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
    for (const { spec, line } of importsOf(readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) continue
      checked++
      const target = posix(relative(dir, resolve(dirname(file), spec)))
      const where = `${name}:${line}`
      if (!target.startsWith("src/")) {
        if (!/^locales\/[^/]+\.json$/.test(target)) problems.push(`${where}: ${spec} is outside src/`)
        continue
      }
      const to = target.split("/")[1]
      if (to === layer || allowed.includes(to)) continue
      if (to === "e2e" && E2E_IMPORTERS.has(name)) continue
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
