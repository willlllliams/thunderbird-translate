import { describe, expect, it } from "vitest"
import { DEFAULT_PROMPTS, PROMPT_KINDS, promptText } from "../src/shared/prompts"
import { getPreset } from "../src/shared/providers"
import {
  addedByDefault,
  addedProviders,
  consentNeeds,
  consentParts,
  createDefaultSettings,
  hasConsent,
  isOnlineService,
  normalizeSettings,
  promptKindFor,
  type ProviderConfig,
  removalBlocker,
  resultInputs,
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
  it("default to the three built-in prompts, stored as empty texts", () => {
    const s = createDefaultSettings()
    expect(s.prompts).toEqual({ bilingual: "", translationOnly: "", precise: "", summary: "", image: "" })
    expect(PROMPT_KINDS.map((kind) => promptText(s.prompts, kind))).toEqual(PROMPT_KINDS.map((kind) => DEFAULT_PROMPTS[kind]))
  })

  it("migrate a custom system prompt to both display modes", () => {
    const s = normalizeSettings({ systemPrompt: "Translate into {{to}} like a pirate." })
    expect(s.prompts).toEqual({ precise: "", summary: "", image: "", bilingual: "Translate into {{to}} like a pirate.", translationOnly: "Translate into {{to}} like a pirate." })
  })

  it("do not migrate an empty system prompt or a copy of the old built-in one", () => {
    const builtIn = { bilingual: "", translationOnly: "", precise: "", summary: "", image: "" }
    expect(normalizeSettings({ systemPrompt: "" }).prompts).toEqual(builtIn)
    const oldDefault = `You are a professional translator working on email messages.
Translate the user's text into {{to}}.
Rules:
- Preserve the meaning, tone and level of politeness of the original email.
- Keep names, email addresses, URLs, numbers, dates, code and product names unchanged unless they have an established translation.
- Keep line breaks and list markers.
- If a passage is already in {{to}}, return it unchanged.
- Output only the translation. Do not add explanations, notes, quotes or labels.`
    expect(normalizeSettings({ systemPrompt: oldDefault }).prompts).toEqual(builtIn)
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

  it("carry the Markdown switch, which changes no signature and no input of a result", () => {
    const s = createDefaultSettings()
    s.tiers = { dictionary: "dictionary", machine: "google-free", ai: "openai" }
    const on = toPublicSettings(s)
    expect(on.renderMarkdown).toBe(true)
    const parts = resultInputs(s, "openai").parts
    s.renderMarkdown = false
    const off = toPublicSettings(s)
    expect(off.renderMarkdown).toBe(false)
    expect(off.signatures).toEqual(on.signatures)
    expect(resultInputs(s, "openai").parts).toEqual(parts)
  })

  it("hold no key, token or endpoint that may carry one, in any field; only the host of a service awaiting consent", () => {
    const s = createDefaultSettings()
    s.tiers = { dictionary: null, machine: "deeplx", ai: "openai" }
    s.providers.deeplx = { enabled: true, apiKey: "dlx-token-7f3a", baseURL: "https://api.deeplx.org/u7Rk29xQpL4mZ8vT1nW5/translate?token=dlx-query-9c1e", model: "" }
    s.providers.openai = { enabled: true, apiKey: "sk-live-4b8d", baseURL: "https://proxy.example/v1?key=sk-query-2e6f", model: "gpt-x" }
    const secrets = ["dlx-token-7f3a", "u7Rk29xQpL4mZ8vT1nW5", "dlx-query-9c1e", "sk-live-4b8d", "sk-query-2e6f"]
    const hosts = ["api.deeplx.org", "proxy.example"]
    const leaves = (v: unknown): string[] => (v && typeof v === "object" ? Object.values(v).flatMap(leaves) : [String(v)])
    const pub = toPublicSettings(s)
    for (const value of [...leaves(pub), ...Object.keys(pub.signatures)]) for (const secret of secrets) expect(value).not.toContain(secret)
    // The consent panel names the host a service sends to, nothing else of its endpoint.
    expect(pub.consent).toEqual([
      { id: "deeplx", host: "api.deeplx.org" },
      { id: "openai", host: "proxy.example" },
    ])
    // So does the consent the summary of the AI tier still needs.
    expect(pub.summary).toEqual({ available: true, inlineButton: false, auto: "off", collapsed: false, consent: { id: "openai", host: "proxy.example" } })
    // And the consent the images still need: the AI tier reads them.
    expect(pub.image.consent).toEqual({ id: "openai", host: "proxy.example" })
    const { consent, summary, image, ...rest } = pub
    for (const value of [...leaves(rest), ...leaves({ ...summary, consent: null }), ...leaves({ ...image, consent: null }), ...Object.keys(pub.signatures)]) for (const host of hosts) expect(value).not.toContain(host)
    s.onlineConsent = ["deeplx@api.deeplx.org", "openai@proxy.example"]
    expect(toPublicSettings(s).consent).toEqual([])
    expect(toPublicSettings(s).summary.consent).toBeNull()
    // Another endpoint still changes the signature, so the page asks the tier again.
    s.providers.deeplx.baseURL = "https://other.example/translate"
    expect(toPublicSettings(s).signatures.machine).not.toBe(pub.signatures.machine)
    s.providers.openai.temperature = 0.2
    expect(toPublicSettings(s).signatures.ai).not.toBe(pub.signatures.ai)
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

describe("muted notices about missing offline data", () => {
  it("keeps service and language pair entries once each, and hands them to content scripts", () => {
    const s = normalizeSettings({ offlineMutedPairs: ["dictionary:ja>zh-Hans", "bergamot:de>en", "dictionary:ja>zh-Hans", "google:de>en", "ja>zh-Hans", 3, null] })
    expect(s.offlineMutedPairs).toEqual(["dictionary:ja>zh-Hans", "bergamot:de>en"])
    expect(normalizeSettings({ offlineMutedPairs: "dictionary:ja>zh-Hans" }).offlineMutedPairs).toEqual([])
    expect(createDefaultSettings().offlineMutedPairs).toEqual([])
    expect(toPublicSettings(s).offlineMutedPairs).toEqual(["dictionary:ja>zh-Hans", "bergamot:de>en"])
  })
})

describe("consent to online services", () => {
  it("keeps online services once each with their hosts, and asks for the online tiers in use only", () => {
    expect(normalizeSettings({ onlineConsent: ["openai", "openai@api.openai.com", "dictionary", "bergamot@", "nope", "nope@x", 3] }).onlineConsent).toEqual(["openai@api.openai.com"])
    expect(normalizeSettings({ onlineConsent: "openai" }).onlineConsent).toEqual([])
    expect(createDefaultSettings().onlineConsent).toEqual([])
    const s = createDefaultSettings()
    s.tiers = { dictionary: "dictionary", machine: "bergamot", ai: null }
    expect(consentNeeds(s)).toEqual([])
    s.tiers = { dictionary: "dictionary", machine: "microsoft-free", ai: "ollama" }
    expect(consentNeeds(s)).toEqual([
      { id: "microsoft-free", host: "edge.microsoft.com" },
      { id: "ollama", host: "localhost" },
    ])
    s.onlineConsent = ["microsoft-free@edge.microsoft.com"]
    s.tiers.ai = "custom"
    expect(consentNeeds(s)).toEqual([{ id: "custom", host: "" }])
    expect([isOnlineService("google-free"), isOnlineService("dictionary"), isOnlineService("bergamot"), isOnlineService("nope")]).toEqual([true, false, false, false])
  })

  it("B9: asks again when the endpoint of an allowed service moves to another host", () => {
    // Saved before 3.0.0: the id alone stands for the endpoint the service has now.
    const s = normalizeSettings({ tiers: { machine: "google-free", ai: "ollama" }, onlineConsent: ["ollama"], imageConsent: ["ollama"] })
    expect([s.onlineConsent, s.imageConsent]).toEqual([["ollama@localhost"], ["ollama@localhost"]])
    expect(consentNeeds(s)).toEqual([{ id: "google-free", host: "translate.googleapis.com" }])
    expect(hasConsent(s, "onlineConsent", "ollama")).toBe(true)
    s.providers.ollama.baseURL = "https://gateway.example.com/v1"
    expect(consentNeeds(s)).toEqual([
      { id: "google-free", host: "translate.googleapis.com" },
      { id: "ollama", host: "gateway.example.com" },
    ])
    expect([hasConsent(s, "onlineConsent", "ollama"), hasConsent(s, "imageConsent", "ollama")]).toEqual([false, false])
    // Back to the host the user allowed: allowed again.
    s.providers.ollama.baseURL = "http://localhost:11434/v1"
    expect(hasConsent(s, "onlineConsent", "ollama")).toBe(true)
    expect(consentParts("ollama@localhost")).toEqual({ id: "ollama", host: "localhost" })
  })
})

describe("numbers", () => {
  it("U6, S3: round the counts and sizes to whole numbers, and keep the fractions of quality, ratio and megabytes", () => {
    const s = normalizeSettings({
      summary: { maxOutputTokens: 850.5 },
      batch: { concurrency: 2.5, maxRetries: "1.4", maxItemsPerBatch: 9.6 },
      cache: { maxEntries: 100.2 },
      image: { maxOutputTokens: 1000.5, concurrency: 1.5, maxPerMessage: 2.5, quality: 0.72, maxAspect: 2.5, maxMessageMB: 1.5 },
    })
    expect([s.summary.maxOutputTokens, s.batch.concurrency, s.batch.maxRetries, s.batch.maxItemsPerBatch, s.cache.maxEntries]).toEqual([851, 3, 1, 10, 100])
    expect([s.image.maxOutputTokens, s.image.concurrency, s.image.maxPerMessage]).toEqual([1001, 2, 3])
    expect([s.image.quality, s.image.maxAspect, s.image.maxMessageMB]).toEqual([0.72, 2.5, 1.5])
  })
})
