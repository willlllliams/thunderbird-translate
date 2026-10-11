import { describe, expect, it } from "vitest"
import { DEFAULT_PROMPTS, promptText } from "../src/shared/prompts"
import { getPreset } from "../src/shared/providers"
import {
  addedByDefault,
  addedProviders,
  createDefaultSettings,
  normalizeSettings,
  promptKindFor,
  type ProviderConfig,
  removalBlocker,
  tiersValid,
  toPublicSettings,
} from "../src/shared/settings"

/** Provider entry as stored by 1.1.x: no "enabled" field. */
const old = (over: Partial<ProviderConfig> = {}) => ({ apiKey: "", baseURL: "", model: "", ...over })

describe("added services: migration of settings saved before 1.2.0", () => {
  const stored = {
    activeProviderId: "gemini",
    providers: {
      "google-free": old(),
      "microsoft-free": old(),
      deeplx: old({ baseURL: "https://deeplx.example.com/translate" }),
      openai: old({ apiKey: "sk-1" }),
      anthropic: old(),
      gemini: old(),
      ollama: old({ model: "qwen3:8b" }),
      lmstudio: old(),
      custom: old({ baseURL: "http://localhost:8080/v1" }),
      groq: old({ model: "llama-3.1-8b-instant" }),
    },
  }
  const s = normalizeSettings(stored)
  const enabled = (id: string) => s.providers[id].enabled

  it("adds the free Google and Microsoft translators", () => {
    expect(enabled("google-free")).toBe(true)
    expect(enabled("microsoft-free")).toBe(true)
  })

  it("adds DeepLX with an endpoint and AI services with a key", () => {
    expect(enabled("deeplx")).toBe(true)
    expect(enabled("openai")).toBe(true)
    expect(enabled("anthropic")).toBe(false)
  })

  it("adds keyless local services only when their configuration was changed", () => {
    expect(enabled("ollama")).toBe(true)
    expect(enabled("custom")).toBe(true)
    expect(enabled("lmstudio")).toBe(false)
    // A model alone does not add a service that needs a key.
    expect(enabled("groq")).toBe(false)
  })

  it("always adds the current service", () => {
    expect(s.tiers.ai).toBe("gemini")
    expect(enabled("gemini")).toBe(true)
  })

  it("keeps an explicit choice, except for the services in use", () => {
    const next = normalizeSettings({
      activeProviderId: "openai",
      race: { enabled: true, fastProviderId: "microsoft-free" },
      providers: { "google-free": { ...old(), enabled: false }, openai: { ...old({ apiKey: "k" }), enabled: false }, "microsoft-free": { ...old(), enabled: false } },
    })
    expect(next.providers["google-free"].enabled).toBe(false)
    expect(next.providers.openai.enabled).toBe(true)
    expect(next.providers["microsoft-free"].enabled).toBe(true)
  })

  it("starts a fresh installation with the two free translators", () => {
    expect(addedProviders(createDefaultSettings()).map((p) => p.id)).toEqual(["google-free", "microsoft-free"])
  })

  it("derives the default from the configuration alone", () => {
    expect(addedByDefault(getPreset("deeplx")!, { enabled: false, ...old() })).toBe(false)
    expect(addedByDefault(getPreset("lmstudio")!, { enabled: false, ...old({ temperature: 0.2 }) })).toBe(true)
  })
})

describe("tiers: migration of settings saved before 1.4.0", () => {
  it("turns an AI service into the AI tier, with the fast service of race mode as machine tier", () => {
    const s = normalizeSettings({ activeProviderId: "openai", race: { enabled: true, fastProviderId: "deeplx" } })
    expect(s.tiers).toEqual({ dictionary: null, machine: "deeplx", ai: "openai" })
    expect(s.providers.deeplx.enabled).toBe(true)
  })

  it("leaves the machine tier empty when race mode was off", () => {
    expect(normalizeSettings({ activeProviderId: "openai", race: { enabled: false, fastProviderId: "deeplx" } }).tiers).toEqual({ dictionary: null, machine: null, ai: "openai" })
  })

  it("takes Google as machine tier when the old fast service is unusable", () => {
    expect(normalizeSettings({ activeProviderId: "openai", race: { enabled: true, fastProviderId: "anthropic" } }).tiers.machine).toBe("google-free")
  })

  it("turns a machine translator into the machine tier", () => {
    expect(normalizeSettings({ activeProviderId: "microsoft-free", race: { enabled: true, fastProviderId: "google-free" } }).tiers).toEqual({
      dictionary: null,
      machine: "microsoft-free",
      ai: null,
    })
  })

  it("drops the old fields", () => {
    const s = normalizeSettings({ activeProviderId: "openai", race: { enabled: true, fastProviderId: "google-free" }, systemPrompt: "x" }) as unknown as Record<string, unknown>
    expect(s.activeProviderId).toBeUndefined()
    expect(s.race).toBeUndefined()
    expect(s.systemPrompt).toBeUndefined()
  })
})

describe("tiers", () => {
  it("accept only services of their own tier", () => {
    const s = normalizeSettings({ tiers: { dictionary: "google-free", machine: "openai", ai: "deepseek" } })
    expect(s.tiers).toEqual({ dictionary: null, machine: null, ai: "deepseek" })
    expect(normalizeSettings({ tiers: { dictionary: "dictionary", machine: "bergamot", ai: null } }).tiers).toEqual({ dictionary: "dictionary", machine: "bergamot", ai: null })
  })

  it("never end up all empty", () => {
    expect(normalizeSettings({ tiers: { dictionary: null, machine: null, ai: null } }).tiers).toEqual({ dictionary: null, machine: "google-free", ai: null })
    expect(tiersValid({ dictionary: null, machine: null, ai: null })).toBe(false)
    expect(tiersValid({ dictionary: "dictionary", machine: null, ai: null })).toBe(true)
  })

  it("block the removal of their services", () => {
    const s = createDefaultSettings()
    s.tiers = { dictionary: "dictionary", machine: "google-free", ai: "openai" }
    expect(removalBlocker(s, "dictionary")).toBe("dictionary")
    expect(removalBlocker(s, "google-free")).toBe("machine")
    expect(removalBlocker(s, "openai")).toBe("ai")
    expect(removalBlocker(s, "microsoft-free")).toBeNull()
  })

  it("are always added", () => {
    const s = normalizeSettings({ tiers: { dictionary: "dictionary", machine: "bergamot", ai: null }, providers: { dictionary: { ...old(), enabled: false } } })
    expect(addedProviders(s).map((p) => p.id)).toEqual(["dictionary", "bergamot", "google-free", "microsoft-free"])
  })
})

describe("source language", () => {
  it("defaults to automatic detection and accepts only known languages", () => {
    expect(createDefaultSettings().sourceLang).toBe("auto")
    expect(normalizeSettings({ sourceLang: "de" }).sourceLang).toBe("de")
    expect(normalizeSettings({ sourceLang: "xx" }).sourceLang).toBe("auto")
  })
})

describe("prompts", () => {
  it("default to the three built-in prompts", () => {
    expect(createDefaultSettings().prompts).toEqual(DEFAULT_PROMPTS)
  })

  it("migrate a custom system prompt to both display modes", () => {
    const s = normalizeSettings({ systemPrompt: "Translate into {{to}} like a pirate." })
    expect(s.prompts).toEqual({ ...DEFAULT_PROMPTS, bilingual: "Translate into {{to}} like a pirate.", translationOnly: "Translate into {{to}} like a pirate." })
  })

  it("do not migrate an empty system prompt or a copy of the old built-in one", () => {
    expect(normalizeSettings({ systemPrompt: "" }).prompts).toEqual(DEFAULT_PROMPTS)
    const oldDefault = `You are a professional translator working on email messages.
Translate the user's text into {{to}}.
Rules:
- Preserve the meaning, tone and level of politeness of the original email.
- Keep names, email addresses, URLs, numbers, dates, code and product names unchanged unless they have an established translation.
- Keep line breaks and list markers.
- If a passage is already in {{to}}, return it unchanged.
- Output only the translation. Do not add explanations, notes, quotes or labels.`
    expect(normalizeSettings({ systemPrompt: oldDefault }).prompts).toEqual(DEFAULT_PROMPTS)
  })

  it("fall back to the default when a prompt is emptied", () => {
    expect(promptText({ ...DEFAULT_PROMPTS, precise: "  " }, "precise")).toBe(DEFAULT_PROMPTS.precise)
  })

  it("follow the display mode, and precise mode overrides it", () => {
    const s = createDefaultSettings()
    expect(promptKindFor(s)).toBe("bilingual")
    s.mode = "translation-only"
    expect(promptKindFor(s)).toBe("translationOnly")
    s.precise.enabled = true
    expect(promptKindFor(s)).toBe("precise")
  })
})

describe("public settings", () => {
  it("tell the content script about precise mode only with an AI tier", () => {
    const s = createDefaultSettings()
    s.precise.enabled = true
    expect(toPublicSettings(s).precise).toBe(false)
    s.tiers.ai = "openai"
    expect(toPublicSettings(s).precise).toBe(true)
  })

  it("change the AI signature with the display mode and the prompt, the other signatures not", () => {
    const s = createDefaultSettings()
    s.tiers = { dictionary: "dictionary", machine: "google-free", ai: "openai" }
    const a = toPublicSettings(s)
    expect(a.tiers).toEqual(["dictionary", "machine", "ai"])
    s.mode = "translation-only"
    const b = toPublicSettings(s)
    expect(b.signatures.ai).not.toBe(a.signatures.ai)
    expect(b.signatures.machine).toBe(a.signatures.machine)
    expect(b.signatures.dictionary).toBe(a.signatures.dictionary)
    s.prompts.translationOnly = "Other {{to}}"
    expect(toPublicSettings(s).signatures.ai).not.toBe(b.signatures.ai)
  })

  it("list only the tiers in use, without keys", () => {
    const s = createDefaultSettings()
    s.providers["google-free"].apiKey = "SECRET"
    const pub = toPublicSettings(s)
    expect(pub.tiers).toEqual(["machine"])
    expect(Object.keys(pub.signatures)).toEqual(["machine"])
    expect(JSON.stringify(pub)).not.toContain("SECRET")
  })
})
