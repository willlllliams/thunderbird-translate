/**
 * Golden values of the cache keys and batch keys of the translation service.
 * Cache keys are stored with every cached translation (storage.local), so a
 * change of their form would make every stored translation unreachable. A
 * failure here means the key of an existing setting changed: keep the old
 * form unless the cache is meant to be dropped.
 */
import { describe, expect, it } from "vitest"
import { createMailContext } from "../src/shared/mail-context"
import type { TranslateRequest } from "../src/shared/messages"
import { TIERS } from "../src/shared/providers"
import { createDefaultSettings, type Settings, toPublicSettings } from "../src/shared/settings"
import golden from "./fixtures/result-keys.json"
import { createService } from "./helpers"

/** The job of one tier for one paragraph; TranslationService.job() is private, the keys it builds are what this file pins. */
type JobOf = { job(req: TranslateRequest, providerId: string, settings: Settings, data: string): { key: string; batchKey: string } }

const MAIL = createMailContext(["Hello world", "Second paragraph"], [0, 1])
const request = (): TranslateRequest => ({ text: "Hello world", sourceLang: "en", targetLang: "zh-CN", tiers: [...TIERS] })

/** Changes of the settings or the request, each applied to the same base on its own. */
const VARIATIONS: [string, (s: Settings, req: TranslateRequest) => void][] = [
  ["base", () => {}],
  ["translation-only mode", (s) => (s.mode = "translation-only")],
  ["precise mode", (s) => (s.precise.enabled = true)],
  ["precise mode with a registered message", (s, req) => ((s.precise.enabled = true), (req.context = { id: MAIL.id, index: 0 }))],
  ["own bilingual prompt", (s) => (s.prompts.bilingual = "Translate into {{to}}, carefully.")],
  ["own translation-only prompt in that mode", (s) => ((s.mode = "translation-only"), (s.prompts.translationOnly = "Only {{to}}."))],
  ["own precise prompt in precise mode", (s) => ((s.precise.enabled = true), (s.prompts.precise = "Precise {{to}}."))],
  ["own prompt of another mode", (s) => (s.prompts.translationOnly = "Only {{to}}.")],
  ["AI endpoint", (s) => (s.providers.openai.baseURL = "https://proxy.example.com/v1")],
  ["AI endpoint with a trailing slash", (s) => (s.providers.openai.baseURL = "https://api.openai.com/v1/")],
  ["AI model", (s) => (s.providers.openai.model = "gpt-4.1")],
  ["AI temperature", (s) => (s.providers.openai.temperature = 0.7)],
  ["AI without temperature", (s) => (s.providers.openai.temperature = null)],
  ["AI thinking", (s) => (s.providers.openai.thinking = true)],
  ["AI key", (s) => (s.providers.openai.apiKey = "sk-other")],
  ["another AI service", (s) => (s.tiers.ai = "deepseek")],
  ["Microsoft key mode", (s) => (s.providers["microsoft-free"].mode = "key")],
  ["Microsoft key mode with region and endpoint", (s) => Object.assign(s.providers["microsoft-free"], { mode: "key", region: "westeurope", baseURL: "https://api.cognitive.microsofttranslator.com" })],
  ["Google as the machine tier", (s) => (s.tiers.machine = "google-free")],
  ["Google endpoint", (s) => ((s.tiers.machine = "google-free"), (s.providers["google-free"].baseURL = "https://translate.example.com"))],
  ["Bergamot as the machine tier", (s) => (s.tiers.machine = "bergamot")],
  ["source language detected", (_s, req) => (req.sourceLang = "auto")],
  ["other target language", (_s, req) => (req.targetLang = "ja")],
  ["other text", (_s, req) => (req.text = "Good morning")],
  ["batch, cache and style settings", (s) => ((s.batch.maxItemsPerBatch = 5), (s.cache.maxEntries = 10), (s.style.preset = "plain"))],
  ["interface language and automatic translation", (s) => ((s.uiLanguage = "de"), (s.autoTranslate = true))],
]

/** Signature of the installed dictionary packs or offline models, as Dictionary.signature() and BergamotManager.signature() return it; "" without data. */
const DATA = ["", "1a2b3c"]

/** The settings and the request of a variation. */
function variation(name: string): { settings: Settings; req: TranslateRequest } {
  const settings = createDefaultSettings()
  settings.tiers = { dictionary: "dictionary", machine: "microsoft-free", ai: "openai" }
  settings.providers.openai.apiKey = "sk-test"
  const req = request()
  VARIATIONS.find(([n]) => n === name)![1](settings, req)
  return { settings, req }
}

function keysOf(name: string, data: string): Record<string, [string, string]> {
  const { settings, req } = variation(name)
  const { service } = createService(settings)
  service.setContext(MAIL)
  const jobs = service as unknown as JobOf
  return Object.fromEntries(TIERS.map((tier) => {
    const job = jobs.job(req, settings.tiers[tier]!, settings, data)
    return [tier, [job.key, job.batchKey]]
  }))
}

describe("cache keys and batch keys", () => {
  it("cover 26 changes of the settings", () => {
    expect(VARIATIONS).toHaveLength(26)
    expect(new Set(VARIATIONS.map(([name]) => name)).size).toBe(26)
  })

  it.each(VARIATIONS.flatMap(([name]) => DATA.map((data) => [name, data] as const)))("stay as they were: %s, data %j", (name, data) => {
    expect(keysOf(name, data)).toEqual((golden as Record<string, Record<string, unknown>>)[name][data || "none"])
  })

  it.each(VARIATIONS.filter(([name]) => JSON.stringify(variation(name).req) === JSON.stringify(request())).map(([name]) => name))(
    "change together with the signature of the tier the content script compares: %s",
    (name) => {
      const before = { keys: keysOf("base", ""), signatures: toPublicSettings(variation("base").settings).signatures }
      const after = { keys: keysOf(name, ""), signatures: toPublicSettings(variation(name).settings).signatures }
      for (const tier of TIERS) expect([tier, after.signatures[tier] !== before.signatures[tier]]).toEqual([tier, after.keys[tier][0] !== before.keys[tier][0]])
    },
  )
})
