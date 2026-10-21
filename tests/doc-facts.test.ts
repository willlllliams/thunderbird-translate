/**
 * Numbers and names the documents state, checked against the code: the number of AI provider presets, the extension name, the interface
 * languages and the keyboard shortcuts. The 12 READMEs share their structure, so a translated README states a number
 * on the same lines as README.md.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { SUPPORTED_LOCALES } from "../src/shared/locales"
import { PROVIDER_PRESETS, tierOf } from "../src/shared/providers"

const root = join(__dirname, "..")
const read = (path: string) => readFileSync(join(root, path), "utf8")
const READMES = ["README.md", ...readdirSync(join(root, "readmes")).map((name) => `readmes/${name}`)]
const DOCS = readdirSync(join(root, "docs"))
  .filter((name) => name.endsWith(".md"))
  .map((name) => `docs/${name}`)

/** Line numbers (from 1) of the lines of `text` that contain `number` as a number of its own. */
const linesWith = (text: string, number: number) =>
  text.split("\n").flatMap((line, i) => (new RegExp(`(^|[^\\d.])${number}(?![\\d.]\\d)`).test(line) ? [i + 1] : []))

describe("facts in the documents", () => {
  it("count the AI provider presets as the provider table does", () => {
    const presets = PROVIDER_PRESETS.filter((p) => tierOf(p) === "ai").length
    const readme = read("README.md")
    expect([/(\d+) AI provider presets/, /\| (\d+) AI providers \|/, /\| AI \| (\d+) presets \|/].map((pattern) => Number(readme.match(pattern)?.[1]))).toEqual([presets, presets, presets])
    const lines = linesWith(readme, presets)
    expect(lines).toHaveLength(3)
    for (const file of READMES) expect([file, linesWith(read(file), presets)]).toEqual([file, lines])
    // The package description gives a lower bound.
    const atLeast = Number((JSON.parse(read("package.json")) as { description: string }).description.match(/(\d+)\+ AI providers/)?.[1])
    expect(presets).toBeGreaterThanOrEqual(atLeast)
  })

  it("count the interface languages as the locale table does, with a README and a locale file for each", () => {
    const languages = SUPPORTED_LOCALES.length
    const readme = read("README.md")
    expect(Number(readme.match(/Interface in (\d+) languages/)?.[1])).toBe(languages)
    const line = readme.split("\n").findIndex((l) => l.startsWith("- Interface in")) + 1
    for (const file of READMES) expect([file, linesWith(read(file), languages).includes(line)]).toEqual([file, true])
    expect(READMES).toHaveLength(languages)
    expect(readdirSync(join(root, "locales")).filter((name) => name.endsWith(".json")).map((name) => name.replace(".json", "")).sort()).toEqual([...SUPPORTED_LOCALES].sort())
    const development = read("docs/development.md")
    expect(Number(development.match(/The README exists in the same (\d+) languages/)?.[1])).toBe(languages)
    const table = [...development.matchAll(/^\| `([a-z]{2}(?:_[A-Z]{2})?)` \| /gm)].map((m) => m[1])
    expect(table).toEqual([...SUPPORTED_LOCALES])
  })

  it("name the extension '<name> for Thunderbird' in every interface language, as the add-on site requires, and title each README with it", () => {
    const readmeOf = (locale: string) => (locale === "en" ? "README.md" : `readmes/README.${locale.replace("_", "-")}.md`)
    for (const locale of SUPPORTED_LOCALES) {
      const name = (JSON.parse(read(`locales/${locale}.json`)) as { extensionName: string }).extensionName
      // Thunderbird appears once, at the end, after the word for "for" of the language.
      expect([locale, /^\S.* (for|para|pour|für|для|cho) Thunderbird$/u.test(name), name.split("Thunderbird").length]).toEqual([locale, true, 2])
      expect([locale, name.startsWith("Thunderbird")]).toEqual([locale, false])
      expect([locale, read(readmeOf(locale)).split("\n")[0]]).toEqual([locale, `# ${name}`])
    }
    expect((JSON.parse(read("locales/en.json")) as { extensionName: string }).extensionName).toBe("Multi Translate for Thunderbird")
  })

  it("name the keyboard shortcuts of the manifest, and no other", () => {
    const commands = (JSON.parse(read("static/manifest.json")) as { commands: Record<string, { suggested_key?: { default: string } }> }).commands
    // The summary has no key of its own.
    const keys = Object.values(commands).flatMap((c) => (c.suggested_key ? [c.suggested_key.default] : []))
    expect(keys).toEqual(["Alt+A", "Alt+S", "Alt+R"])
    for (const file of READMES) {
      const table = [...read(file).matchAll(/^\| (Alt\+\w) \|/gm)].map((m) => m[1])
      expect([file, table]).toEqual([file, keys])
    }
    for (const file of [...READMES, ...DOCS, "locales/en.json"]) {
      const named = new Set([...read(file).matchAll(/\bAlt\+\w+/g)].map((m) => m[0]))
      for (const key of named) expect([file, key, keys.includes(key)]).toEqual([file, key, true])
    }
  })
})
