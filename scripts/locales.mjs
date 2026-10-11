// Interface text: locales/<locale>.json (flat key → text, en.json is the reference)
// → dist/_locales/<locale>/messages.json in the WebExtension format.
//
//   node scripts/locales.mjs            check every locale against en.json
//   node scripts/locales.mjs --out DIR  check, then write DIR/<locale>/messages.json
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
export const LOCALES_DIR = join(root, "locales")
export const REFERENCE_LOCALE = "en"

/** { locale: { key: text } } for every locales/*.json. */
export function readLocaleSources(dir = LOCALES_DIR) {
  const out = {}
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue
    out[name.slice(0, -5)] = JSON.parse(readFileSync(join(dir, name), "utf8"))
  }
  return out
}

/** Substitution numbers used in a message, e.g. "$2 of $1" → ["1", "2"]. `$$` is a literal dollar. */
export function placeholderNumbers(text) {
  const found = new Set()
  for (const m of String(text).matchAll(/\$(\$|[1-9])/g)) if (m[1] !== "$") found.add(m[1])
  return [...found].sort()
}

/** Literal tokens such as {{apiKey}} that translations must keep. */
export function literalTokens(text) {
  return [...String(text).matchAll(/\{\{\w+\}\}/g)].map((m) => m[0]).sort()
}

/** Problems found when comparing every locale with the reference. Empty array = all good. */
export function checkLocales(sources) {
  const problems = []
  const ref = sources[REFERENCE_LOCALE]
  if (!ref) return [`missing ${REFERENCE_LOCALE}.json`]
  const refKeys = Object.keys(ref)
  for (const [locale, table] of Object.entries(sources)) {
    const keys = Object.keys(table)
    for (const k of refKeys) if (!(k in table)) problems.push(`${locale}: missing key ${k}`)
    for (const k of keys) if (!(k in ref)) problems.push(`${locale}: unknown key ${k}`)
    for (const k of refKeys) {
      const v = table[k]
      if (v === undefined) continue
      if (typeof v !== "string" || !v.trim()) {
        problems.push(`${locale}: empty value for ${k}`)
        continue
      }
      if (placeholderNumbers(v).join() !== placeholderNumbers(ref[k]).join()) {
        problems.push(`${locale}: ${k} uses $${placeholderNumbers(v).join(",$") || "-"} but ${REFERENCE_LOCALE} uses $${placeholderNumbers(ref[k]).join(",$") || "-"}`)
      }
      if (literalTokens(v).join() !== literalTokens(ref[k]).join()) problems.push(`${locale}: ${k} changes {{…}} tokens`)
    }
  }
  return problems
}

/** One locale as a WebExtension messages.json object, with named placeholders. */
export function toMessagesJson(table) {
  const out = {}
  for (const [key, text] of Object.entries(table)) {
    const placeholders = {}
    const message = text.replace(/\$(\$|[1-9])/g, (m, g) => {
      if (g === "$") return m
      placeholders[`arg${g}`] = { content: `$${g}` }
      return `$ARG${g}$`
    })
    out[key] = Object.keys(placeholders).length ? { message, placeholders } : { message }
  }
  return out
}

/** Write <outDir>/<locale>/messages.json for every locale. Returns the locale list. */
export function writeLocales(outDir, sources = readLocaleSources()) {
  for (const [locale, table] of Object.entries(sources)) {
    const file = join(outDir, locale, "messages.json")
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(toMessagesJson(table), null, 2)}\n`)
  }
  return Object.keys(sources)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = readLocaleSources()
  const problems = checkLocales(sources)
  for (const p of problems) console.error(p)
  if (problems.length) process.exit(1)
  const outIndex = process.argv.indexOf("--out")
  if (outIndex > 0 && process.argv[outIndex + 1]) {
    const written = writeLocales(resolve(process.argv[outIndex + 1]), sources)
    console.log(`wrote ${written.length} locales: ${written.join(", ")}`)
  } else {
    console.log(`${Object.keys(sources).length} locales OK (${Object.keys(sources[REFERENCE_LOCALE]).length} keys each)`)
  }
}
