// Checks the layers of src/: every relative import of a source file must point into a directory its layer may use.
// Import forms: import … from, import type … from, export … from, side-effect import "…", import x = require("…"),
// dynamic import("…") and import(`…`), also over several lines. A layer imports only the npm packages PACKAGES lists
// for it; outside src/ only locales/*.json may be imported. The files of src/hooks/ hold no code that runs: they
// import types only.
//
// The imports are read from the tokens of TypeScript's own scanner (typescript/unstable/ast/scanner, the scanner
// TypeScript 7 publishes for tools), the way ts.preProcessFile of TypeScript 5 read them: comments, strings,
// template literals and regular expressions are tokens of their own, so text inside them is never taken for code.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { SyntaxKind as K } from "typescript/unstable/ast"
import { createScanner } from "typescript/unstable/ast/scanner"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The directories under src/ each layer may import from, besides itself. */
export const LAYERS = {
  shared: [],
  hooks: ["shared", "offline", "background", "content", "welcome", "subjects"],
  offline: ["shared", "hooks"],
  background: ["shared", "offline", "hooks"],
  content: ["shared", "hooks"],
  popup: ["shared"],
  // The pages reach the offline data through the background script only, so no download or storage code goes into them.
  options: ["shared", "content"],
  welcome: ["shared", "content", "options", "hooks"],
  // The page of translated subjects translates its cells with the controller of the content script.
  subjects: ["shared", "content", "hooks"],
  e2e: ["shared", "hooks", "offline", "background", "content", "popup", "options", "welcome", "subjects"],
}

/**
 * The npm packages each layer may import: a name, every package of a scope ("@ai-sdk/*"), or "type " and a name for
 * import type only. The AI SDK stays in the AI chunk of the background script, the Zstandard decoder in the offline
 * layer; content scripts and pages import none.
 */
export const PACKAGES = {
  background: ["ai", "@ai-sdk/*", "zod"],
  offline: ["fzstd"],
  shared: ["type ai"],
}

/** Layers whose files hold no code that runs: they may import types only (import type, export type). */
export const TYPE_ONLY_LAYERS = new Set(["hooks"])

/** Tokens after which a slash divides; after any other token it starts a regular expression. */
const EXPRESSION_END = new Set([
  K.Identifier,
  K.NumericLiteral,
  K.BigIntLiteral,
  K.StringLiteral,
  K.NoSubstitutionTemplateLiteral,
  K.TemplateTail,
  K.RegularExpressionLiteral,
  K.CloseParenToken,
  K.CloseBracketToken,
  K.CloseBraceToken,
  K.ThisKeyword,
  K.SuperKeyword,
  K.TrueKeyword,
  K.FalseKeyword,
  K.NullKeyword,
])

/** The tokens of a source text without comments and white space: kind, the value of a literal, and the start offset. */
export function tokensOf(text) {
  const scanner = createScanner(true, 0, text)
  const tokens = []
  // The brace depth at which each open template substitution `${ … }` started.
  const templates = []
  let depth = 0
  for (;;) {
    let kind = scanner.scan()
    if (kind === K.EndOfFile) break
    if ((kind === K.SlashToken || kind === K.SlashEqualsToken) && !EXPRESSION_END.has(tokens.at(-1)?.kind)) kind = scanner.reScanSlashToken()
    if (kind === K.TemplateHead) templates.push(depth)
    else if (kind === K.OpenBraceToken) depth++
    else if (kind === K.CloseBraceToken) {
      if (templates.at(-1) === depth) {
        kind = scanner.reScanTemplateToken(false)
        if (kind === K.TemplateTail) templates.pop()
      } else depth--
    }
    tokens.push({ kind, value: scanner.getTokenValue(), start: scanner.getTokenStart() })
  }
  return tokens
}

const isString = (token) => token?.kind === K.StringLiteral || token?.kind === K.NoSubstitutionTemplateLiteral

/** Tokens of an import clause: names, braces, commas, `*`, `as`, `type`; a `from` ends it only before the path. */
const inClause = (tokens, j) => {
  const token = tokens[j]
  if (!token || token.kind === K.SemicolonToken || token.kind === K.EqualsToken || isString(token)) return false
  // `import { from } from "…"`, `import from from "…"`: a `from` that is not followed by the path is a name.
  return token.kind !== K.FromKeyword || !isString(tokens[j + 1])
}

/**
 * The import specifiers of a source text with their line numbers, in the order they appear; typeOnly for import type
 * and export type. A dynamic import whose path is a template literal with substitutions gets computed: true.
 */
export function importsOf(text) {
  const tokens = tokensOf(text)
  const found = []
  const add = (token, typeOnly, computed = false) => {
    const entry = { spec: token.value, line: text.slice(0, token.start).split("\n").length, typeOnly }
    found.push(computed ? { ...entry, computed } : entry)
  }
  for (let i = 0; i < tokens.length; i++) {
    const { kind } = tokens[i]
    const previous = tokens[i - 1]?.kind
    // obj.import, obj?.import
    if (previous === K.DotToken || previous === K.QuestionDotToken) continue
    if (kind === K.ImportKeyword) {
      const next = tokens[i + 1]
      if (!next || next.kind === K.DotToken) continue
      if (next.kind === K.OpenParenToken) {
        const arg = tokens[i + 2]
        if (isString(arg)) add(arg, false)
        else if (arg?.kind === K.TemplateHead) add(arg, false, true)
        continue
      }
      let j = i + 1
      let typeOnly = false
      if (next.kind === K.TypeKeyword) {
        // `import type from "…"`, `import type, { a } from "…"` and `import type = require("…")` import a value named type.
        const after = tokens[j + 1]
        const namedType = after?.kind === K.CommaToken || after?.kind === K.EqualsToken || (after?.kind === K.FromKeyword && isString(tokens[j + 2]))
        if (!namedType) {
          typeOnly = true
          j++
        }
      }
      if (isString(tokens[j])) {
        add(tokens[j], typeOnly)
        continue
      }
      while (inClause(tokens, j)) j++
      if (tokens[j]?.kind === K.FromKeyword) add(tokens[j + 1], typeOnly)
      else if (tokens[j]?.kind === K.EqualsToken && tokens[j + 1]?.kind === K.RequireKeyword && tokens[j + 2]?.kind === K.OpenParenToken && isString(tokens[j + 3]))
        add(tokens[j + 3], typeOnly)
    } else if (kind === K.ExportKeyword) {
      let j = i + 1
      let typeOnly = false
      if (tokens[j]?.kind === K.TypeKeyword) {
        typeOnly = true
        j++
      }
      if (tokens[j]?.kind === K.AsteriskToken) {
        j++
        if (tokens[j]?.kind === K.AsKeyword) j += 2
      } else if (tokens[j]?.kind === K.OpenBraceToken) {
        while (j < tokens.length && tokens[j].kind !== K.CloseBraceToken) j++
        j++
      } else continue
      if (tokens[j]?.kind === K.FromKeyword && isString(tokens[j + 1])) add(tokens[j + 1], typeOnly)
    }
  }
  return found
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
    for (const { spec, line, typeOnly, computed } of importsOf(readFileSync(file, "utf8"))) {
      const where = `${name}:${line}`
      if (computed) {
        problems.push(`${where}: the path of a dynamic import is computed and cannot be checked (${spec}…)`)
        continue
      }
      if (TYPE_ONLY_LAYERS.has(layer) && !typeOnly) problems.push(`${where}: ${layer} may import types only (${spec})`)
      if (!spec.startsWith(".")) {
        const name = spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/")
        const may = PACKAGES[layer] ?? []
        if (!may.includes(name) && !may.includes(`${name.split("/")[0]}/*`) && !(typeOnly && may.includes(`type ${name}`))) problems.push(`${where}: ${layer} must not import the package ${spec}`)
        continue
      }
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
