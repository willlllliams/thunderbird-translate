/** Settings saved by every earlier version, and the normalization of every field. */
import { describe, expect, it } from "vitest"
import { LocalizedError } from "../src/shared/errors"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"
import { getPreset, PROVIDER_PRESETS } from "../src/shared/providers"
import {
  addedByDefault,
  createDefaultSettings,
  DEFAULT_DEEPL,
  emptyProviderConfig,
  enabledTiers,
  normalizeSettings,
  type ProviderConfig,
  resolveProvider,
  resolveProviderConfig,
  type Settings,
} from "../src/shared/settings"

/** The built-in system prompt of 1.0 – 1.3. */
const LEGACY_DEFAULT_PROMPT = `You are a professional translator working on email messages.
Translate the user's text into {{to}}.
Rules:
- Preserve the meaning, tone and level of politeness of the original email.
- Keep names, email addresses, URLs, numbers, dates, code and product names unchanged unless they have an established translation.
- Keep line breaks and list markers.
- If a passage is already in {{to}}, return it unchanged.
- Output only the translation. Do not add explanations, notes, quotes or labels.`

const cfg = (over: Partial<ProviderConfig> = {}) => ({ apiKey: "", baseURL: "", model: "", ...over })
const batch = { batchDelayMs: 80, maxCharsPerBatch: 4000, maxItemsPerBatch: 20, concurrency: 2, maxRetries: 1 }
const style = { preset: "highlight", color: "#ff8800", opacity: 0.6, fontScale: 1.1 }

/** Settings as each version wrote them. */
const SNAPSHOTS = {
  "1.0": {
    targetLang: "ja",
    mode: "translation-only",
    autoTranslate: true,
    activeProviderId: "deeplx",
    systemPrompt: "Translate into {{to}}, keep it short.",
    providers: { "google-free": cfg(), deeplx: cfg({ baseURL: "https://deeplx.example.com/translate" }), openai: cfg({ apiKey: "sk-old" }) },
    batch,
    cache: { enabled: false, maxEntries: 800 },
    style,
  },
  "1.1": {
    uiLanguage: "de",
    targetLang: "de",
    mode: "bilingual",
    activeProviderId: "ollama",
    systemPrompt: LEGACY_DEFAULT_PROMPT,
    providers: { ollama: cfg({ model: "qwen3:8b", temperature: 0.1 }), lmstudio: cfg() },
  },
  "1.2": {
    targetLang: "zh-TW",
    activeProviderId: "anthropic",
    race: { enabled: true, fastProviderId: "microsoft-free" },
    precise: { enabled: true },
    systemPrompt: `  ${LEGACY_DEFAULT_PROMPT}\n`,
    providers: {
      "google-free": { ...cfg(), enabled: false },
      "microsoft-free": { ...cfg(), enabled: true },
      anthropic: { ...cfg({ apiKey: "sk-ant", temperature: null }), enabled: true, thinking: true },
    },
    batch: { ...batch, llmBatchEnabled: false },
  },
  "1.3": {
    targetLang: "fr",
    activeProviderId: "microsoft-free",
    race: { enabled: false, fastProviderId: "google-free" },
    precise: { enabled: false },
    systemPrompt: "",
    providers: { "microsoft-free": { ...cfg({ apiKey: "azure", baseURL: "https://tt.cognitiveservices.azure.com/translate" }), enabled: true, mode: "key", region: "westeurope" } },
  },
  "1.4": {
    uiLanguage: "zh_TW",
    sourceLang: "en",
    targetLang: "zh-TW",
    tiers: { dictionary: "dictionary", machine: "bergamot", ai: "deepseek" },
    providers: { deepseek: { ...cfg({ apiKey: "sk-ds", temperature: 1 }), enabled: true, thinking: false } },
    prompts: { bilingual: "B {{to}}", translationOnly: "T {{to}}", precise: "P {{to}}" },
    precise: { enabled: true },
    dictionary: { releaseTag: "dicts-v2" },
  },
  "2.3": {
    targetLang: "de",
    translateSubject: false,
    renderMarkdown: false,
    tiers: { dictionary: null, machine: "google-free", ai: "openai" },
    providers: { openai: { ...cfg({ apiKey: "sk-oa" }), enabled: true } },
    onlineConsent: ["google-free", "openai"],
    summary: { provider: null, model: "gpt-5-mini", inlineButton: true, parts: ["summary", "actions"], maxOutputTokens: 900, display: "collapsed" },
  },
} as const

/** Prompts as stored: empty stands for the built-in prompt. */
const BUILT_IN = { bilingual: "", translationOnly: "", precise: "", summary: "", image: "" }

const migrated = Object.fromEntries(Object.entries(SNAPSHOTS).map(([v, s]) => [v, normalizeSettings(s, "en")])) as Record<keyof typeof SNAPSHOTS, Settings>

describe("settings of earlier versions", () => {
  it("1.0: the current machine translator becomes the machine tier; a custom prompt goes to both display modes; the rest is kept", () => {
    const s = migrated["1.0"]
    expect(s.tiers).toEqual({ dictionary: null, machine: "deeplx", ai: null })
    expect(s.prompts).toEqual({ precise: "", summary: "", image: "", bilingual: SNAPSHOTS["1.0"].systemPrompt, translationOnly: SNAPSHOTS["1.0"].systemPrompt })
    expect(s).toMatchObject({ targetLang: "ja", mode: "translation-only", autoTranslate: true, sourceLang: "auto", uiLanguage: "auto" })
    expect(s.batch).toEqual({ ...batch, timeoutSeconds: 60, llmBatchEnabled: true })
    expect(s.cache).toEqual({ enabled: false, maxEntries: 800 })
    // Before 1.9.0 there was no text colour: the translation keeps the colour of the message.
    expect(s.style).toEqual({ ...style, textColor: "" })
    expect(s.dictionary.releaseTag).toBe("dicts-v1")
    expect(s.precise.enabled).toBe(false)
    expect(Object.entries(s.providers).filter(([, c]) => c.enabled).map(([id]) => id).sort()).toEqual(["deeplx", "google-free", "microsoft-free", "openai"])
  })

  it("1.1: a keyless local service with a changed configuration is added and used; a copy of the built-in prompt is dropped", () => {
    const s = migrated["1.1"]
    expect(s.tiers).toEqual({ dictionary: null, machine: null, ai: "ollama" })
    expect(s.providers.ollama).toEqual({ enabled: true, apiKey: "", baseURL: "", model: "qwen3:8b", temperature: 0.1 })
    expect(s.providers.lmstudio.enabled).toBe(false)
    expect(s.prompts).toEqual(BUILT_IN)
    expect(s.uiLanguage).toBe("de")
  })

  it("1.2: race mode gives the machine tier; explicit choices, thinking, no temperature and precise mode stay", () => {
    const s = migrated["1.2"]
    expect(s.tiers).toEqual({ dictionary: null, machine: "microsoft-free", ai: "anthropic" })
    expect(s.providers["google-free"].enabled).toBe(false)
    expect(s.providers.anthropic).toEqual({ enabled: true, apiKey: "sk-ant", baseURL: "", model: "", temperature: null, thinking: true })
    expect(s.precise.enabled).toBe(true)
    expect(s.batch.llmBatchEnabled).toBe(false)
    // The built-in prompt with extra white space is still the built-in prompt.
    expect(s.prompts).toEqual(BUILT_IN)
  })

  it("1.3: Microsoft Translator keeps key mode, region and endpoint; race mode off adds no tier", () => {
    const s = migrated["1.3"]
    expect(s.tiers).toEqual({ dictionary: null, machine: "microsoft-free", ai: null })
    expect(s.providers["microsoft-free"]).toEqual({ ...SNAPSHOTS["1.3"].providers["microsoft-free"] })
    expect(resolveProvider(s, "microsoft-free")).toMatchObject({ mode: "key", region: "westeurope", baseURL: "https://tt.cognitiveservices.azure.com/translate" })
    expect(s.prompts).toEqual(BUILT_IN)
  })

  it("1.4: tiers, prompts, source language, precise mode and dictionary release are taken over as they are", () => {
    const s = migrated["1.4"]
    expect(s.tiers).toEqual(SNAPSHOTS["1.4"].tiers)
    expect(s.prompts).toEqual({ ...SNAPSHOTS["1.4"].prompts, summary: "", image: "" })
    expect(s).toMatchObject({ uiLanguage: "zh_TW", sourceLang: "en", targetLang: "zh-TW", precise: { enabled: true }, dictionary: { releaseTag: "dicts-v2" } })
    // thinking: false is the default and is not written.
    expect(s.providers.deepseek).toEqual({ enabled: true, apiKey: "sk-ds", baseURL: "", model: "", temperature: 1 })
    expect(s.providers.dictionary.enabled && s.providers.bergamot.enabled).toBe(true)
  })

  it("2.3: the subject switch is dropped, the consent gets the hosts and the summary keeps its choices", () => {
    const s = migrated["2.3"]
    expect("translateSubject" in s).toBe(false)
    expect(s.renderMarkdown).toBe(false)
    expect(s.onlineConsent).toEqual(["google-free@translate.googleapis.com", "openai@api.openai.com"])
    expect(s.summary).toMatchObject({ provider: null, model: "gpt-5-mini", inlineButton: true, parts: ["summary", "actions"], maxOutputTokens: 900, display: "collapsed" })
  })

  it.each(Object.keys(SNAPSHOTS))("%s: normalizing the result again changes nothing, and no old field is left", (version) => {
    const s = migrated[version as keyof typeof SNAPSHOTS]
    expect(normalizeSettings(structuredClone(s), "en")).toEqual(s)
    expect(Object.keys(s).sort()).toEqual(Object.keys(createDefaultSettings()).sort())
  })

  it.each([
    ["an unknown current service", { activeProviderId: "removed-service" }, { dictionary: null, machine: "google-free", ai: null }],
    ["race mode with a machine translator as current service", { activeProviderId: "deeplx", race: { enabled: true, fastProviderId: "microsoft-free" } }, { dictionary: null, machine: "deeplx", ai: null }],
    ["race mode whose fast service is not a machine translator", { activeProviderId: "gemini", race: { enabled: true, fastProviderId: "dictionary" } }, { dictionary: null, machine: "google-free", ai: "gemini" }],
    ["race mode stored as a string", { activeProviderId: "gemini", race: { enabled: "true", fastProviderId: "deeplx" } }, { dictionary: null, machine: null, ai: "gemini" }],
    ["tiers that are not an object", { tiers: "openai", activeProviderId: "openai" }, { dictionary: null, machine: null, ai: "openai" }],
    ["tiers with unknown services only", { tiers: { dictionary: "x", machine: "y", ai: "z" } }, { dictionary: null, machine: "google-free", ai: null }],
    ["tiers next to old fields", { tiers: { dictionary: null, machine: "deeplx", ai: null }, activeProviderId: "openai" }, { dictionary: null, machine: "deeplx", ai: null }],
  ])("tiers from %s", (_name, stored, tiers) => {
    expect(normalizeSettings(stored).tiers).toEqual(tiers)
  })
})

describe("normalization of each field", () => {
  const field = (stored: object, path: string) => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], normalizeSettings(stored))
  const at = (path: string, value: unknown) => path.split(".").reduceRight<unknown>((inner, k) => ({ [k]: inner }), value) as object

  it.each([
    ["batch.batchDelayMs", -5, 0],
    ["batch.batchDelayMs", 99999, 2000],
    ["batch.batchDelayMs", "120", 120],
    ["batch.batchDelayMs", "soon", 50],
    ["batch.batchDelayMs", Number.POSITIVE_INFINITY, 50],
    ["batch.maxCharsPerBatch", 10, 200],
    ["batch.maxCharsPerBatch", 1e6, 50000],
    ["batch.maxItemsPerBatch", 0, 1],
    ["batch.maxItemsPerBatch", 500, 200],
    ["batch.concurrency", 0, 1],
    ["batch.concurrency", 100, 20],
    ["batch.maxRetries", -1, 0],
    ["batch.maxRetries", 11, 10],
    ["batch.llmBatchEnabled", false, false],
    ["batch.llmBatchEnabled", "no", true],
    ["cache.enabled", false, false],
    ["cache.enabled", 0, true],
    ["cache.maxEntries", -1, 0],
    ["cache.maxEntries", 2e5, 100000],
    ["cache.maxEntries", null, 0],
    ["style.preset", "dashed", "dashed"],
    ["style.preset", "neon", "border"],
    ["style.color", "#ABC", "#ABC"],
    ["style.color", "#11223344", "#11223344"],
    ["style.color", "#12", "#4c8bf5"],
    ["style.color", "red", "#4c8bf5"],
    ["style.textColor", "#202124", "#202124"],
    ["style.textColor", "", ""],
    ["style.textColor", null, ""],
    ["style.textColor", "black", ""],
    ["style.opacity", 0, 0.3],
    ["style.opacity", 2, 1],
    ["style.fontScale", 0.1, 0.7],
    ["style.fontScale", 3, 1.5],
    ["mode", "translation-only", "translation-only"],
    ["mode", "side-by-side", "bilingual"],
    ["autoTranslate", "true", false],
    // On for settings saved before 2.2.0, which have no such field, and for anything but false.
    ["renderMarkdown", undefined, true],
    ["renderMarkdown", 0, true],
    ["renderMarkdown", false, false],
    ["precise.enabled", 1, false],
    ["dictionary.releaseTag", "  dicts-v2 ", "dicts-v2"],
    ["dictionary.releaseTag", "  ", "dicts-v1"],
    ["dictionary.releaseTag", 5, "dicts-v1"],
    ["targetLang", "", "en"],
    ["targetLang", 5, "en"],
    ["targetLang", "xx", "en"],
    ["targetLang", "zh-TW", "zh-TW"],
    ["batch.timeoutSeconds", 1, 5],
    ["batch.timeoutSeconds", 9999, 600],
    ["batch.timeoutSeconds", "x", 60],
    ["sourceLang", "auto", "auto"],
    ["sourceLang", "zh-TW", "zh-TW"],
    ["uiLanguage", "pt-BR", "auto"],
  ])("%s: %j → %j", (path, value, expected) => {
    expect(field(at(path, value), path)).toEqual(expected)
  })

  it("replaces an unknown target language with the default of the interface language, not with Chinese", () => {
    expect(normalizeSettings({ targetLang: "klingon" }, "ja").targetLang).toBe("ja")
    expect(normalizeSettings({ targetLang: "de-CH" }, "fr").targetLang).toBe("fr")
    expect(normalizeSettings({ targetLang: "pt-BR" }, "eo").targetLang).toBe("en")
  })

  it.each([null, undefined, "settings", 42, true])("stored settings %j give the defaults", (stored) => {
    expect(normalizeSettings(stored, "ja")).toEqual(createDefaultSettings("ja"))
  })

  it("keeps the defaults of groups stored as something else than an object", () => {
    const s = normalizeSettings({ batch: "fast", cache: 3, style: null, precise: "on", dictionary: [], prompts: "short" })
    const d = createDefaultSettings()
    expect([s.batch, s.cache, s.style, s.precise, s.dictionary, s.prompts]).toEqual([d.batch, d.cache, d.style, d.precise, d.dictionary, d.prompts])
  })

  it("takes the prompts that are strings, keeps the defaults for the others and ignores an old system prompt next to them", () => {
    const s = normalizeSettings({ prompts: { bilingual: "", translationOnly: 5, precise: "P" }, systemPrompt: "Old {{to}}" })
    expect(s.prompts).toEqual({ bilingual: "", translationOnly: "", precise: "P", summary: "", image: "" })
  })

  it("stores no copy of a built-in prompt, current or earlier, so a new release brings its prompts; prompts of the user stay", () => {
    const stored = { bilingual: `  ${DEFAULT_PROMPTS.bilingual}\n`, translationOnly: DEFAULT_PROMPTS.precise, precise: `${DEFAULT_PROMPTS.precise} Be brief.` }
    // The precise prompt chosen for translation-only display is the user's choice.
    expect(normalizeSettings({ prompts: stored }).prompts).toEqual({ bilingual: "", translationOnly: DEFAULT_PROMPTS.precise, precise: stored.precise, summary: "", image: "" })
    // Settings of 2.3.0 and later: a copy of the built-in summary prompt is not stored, the user's own one is.
    expect(normalizeSettings({ prompts: { ...stored, summary: ` ${DEFAULT_PROMPTS.summary}` } }).prompts.summary).toBe("")
    expect(normalizeSettings({ prompts: { ...stored, summary: "Summarize in {{to}}." } }).prompts.summary).toBe("Summarize in {{to}}.")
    expect(normalizeSettings({ prompts: { ...BUILT_IN, bilingual: LEGACY_DEFAULT_PROMPT } }).prompts).toEqual(BUILT_IN)
  })

  it("cleans each provider configuration", () => {
    const s = normalizeSettings({
      providers: {
        openai: { enabled: "yes", apiKey: 5, baseURL: null, model: ["m"], temperature: "0.5", thinking: "true", mode: "key", region: "" },
        gemini: { enabled: true, apiKey: "k", baseURL: "u", model: "m", temperature: 0, thinking: true, mode: "free", region: "eu" },
        deeplx: null,
        mistral: "sk",
        "removed-service": cfg({ apiKey: "k" }),
        "removed-enabled": { ...cfg(), enabled: true },
      },
    })
    // A non-boolean "enabled" is derived like before 1.2.0; "mode" is kept only as "key" (Microsoft uses it alone).
    expect(s.providers.openai).toEqual({ enabled: false, apiKey: "", baseURL: "", model: "", mode: "key" })
    expect(s.providers.gemini).toEqual({ enabled: true, apiKey: "k", baseURL: "u", model: "m", temperature: 0, thinking: true, region: "eu" })
    expect(s.providers.deeplx).toEqual(emptyProviderConfig())
    expect(s.providers.mistral).toEqual(emptyProviderConfig())
    // Services that no longer exist stay in storage but are never added.
    expect(s.providers["removed-service"].enabled).toBe(false)
    expect(s.providers["removed-enabled"].enabled).toBe(true)
    expect(PROVIDER_PRESETS.some((p) => p.id.startsWith("removed"))).toBe(false)
  })

  it("adds the services of the tiers even when their configuration is missing", () => {
    const s = normalizeSettings({ tiers: { dictionary: null, machine: "deeplx", ai: "custom" }, providers: { custom: null } })
    expect(s.providers.deeplx.enabled).toBe(true)
    expect(s.providers.custom).toEqual({ ...emptyProviderConfig(), enabled: true })
    expect(enabledTiers(s.tiers)).toEqual(["machine", "ai"])
  })
})

describe("services added without an explicit choice", () => {
  const preset = (id: string) => getPreset(id)!
  const config = (over: Partial<ProviderConfig> = {}) => ({ ...emptyProviderConfig(), ...over })

  it.each([
    ["google-free", {}, true],
    ["microsoft-free", {}, true],
    ["dictionary", { baseURL: "x" }, false],
    ["bergamot", { model: "x" }, false],
    ["deeplx", {}, false],
    ["deeplx", { baseURL: "https://deeplx.example.com" }, true],
    ["deeplx", { apiKey: "token" }, false],
    ["openai", {}, false],
    ["openai", { apiKey: "sk" }, true],
    ["openai", { baseURL: "https://proxy.example.com/v1", model: "m", temperature: 0.1 }, false],
    ["ollama", {}, false],
    ["ollama", { baseURL: "http://localhost:11434/v1" }, true],
    ["lmstudio", { model: "qwen" }, true],
    ["custom", { temperature: null }, true],
  ] as const)("%s with %j: %s", (id, over, expected) => {
    expect(addedByDefault(preset(id), config(over))).toBe(expected)
  })
})

describe("resolved provider configuration", () => {
  it("trims the fields, drops trailing slashes and falls back to the preset", () => {
    expect(resolveProviderConfig("openai", { apiKey: " sk ", baseURL: " https://proxy.example.com/v1// ", model: " " })).toEqual({
      id: "openai",
      apiKey: "sk",
      baseURL: "https://proxy.example.com/v1",
      model: "gpt-4.1-mini",
      temperature: 0.3,
      thinking: false,
      mode: "free",
      region: "",
      appId: "",
      edition: "standard",
      deepl: DEFAULT_DEEPL,
    })
  })

  it("sends no temperature for null, the preset temperature for a missing one, and keeps 0", () => {
    const base = cfg()
    expect(resolveProviderConfig("deepseek", base).temperature).toBe(1.3)
    expect(resolveProviderConfig("deepseek", { ...base, temperature: null }).temperature).toBeNull()
    expect(resolveProviderConfig("deepseek", { ...base, temperature: 0 }).temperature).toBe(0)
  })

  it("uses key mode for Microsoft Translator only", () => {
    expect(resolveProviderConfig("microsoft-free", { ...cfg(), mode: "key", region: " eastus " })).toMatchObject({ mode: "key", region: "eastus" })
    expect(resolveProviderConfig("openai", { ...cfg(), mode: "key" }).mode).toBe("free")
  })

  it("uses the preset for a service without configuration and refuses an unknown service", () => {
    const s = createDefaultSettings()
    delete s.providers.gemini
    expect(resolveProvider(s, "gemini")).toMatchObject({ apiKey: "", model: getPreset("gemini")!.defaultModel })
    expect(() => resolveProvider(s, "nope")).toThrow(LocalizedError)
    expect(() => resolveProvider(s, "nope")).toThrow("nope")
  })
})
