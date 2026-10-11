import { describe, expect, it } from "vitest"
import { getPreset } from "../src/shared/providers"
import {
  addedByDefault,
  addedProviders,
  createDefaultSettings,
  normalizeSettings,
  type ProviderConfig,
  removalBlocker,
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
    expect(s.activeProviderId).toBe("gemini")
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

describe("race and precise settings", () => {
  it("defaults to off with Google as fast service", () => {
    const s = createDefaultSettings()
    expect(s.race).toEqual({ enabled: false, fastProviderId: "google-free" })
    expect(s.precise).toEqual({ enabled: false })
  })

  it("accepts only non-AI services as fast service", () => {
    expect(normalizeSettings({ race: { enabled: true, fastProviderId: "openai" } }).race.fastProviderId).toBe("google-free")
    expect(normalizeSettings({ race: { enabled: true, fastProviderId: "deeplx" } }).race.fastProviderId).toBe("deeplx")
    expect(normalizeSettings({ race: { enabled: "yes", fastProviderId: "nope" } }).race).toEqual({ enabled: false, fastProviderId: "google-free" })
  })

  it("tells the content script about precise mode only for AI services", () => {
    const s = createDefaultSettings()
    s.precise.enabled = true
    expect(toPublicSettings(s).precise).toBe(false)
    s.activeProviderId = "openai"
    const pub = toPublicSettings(s)
    expect(pub.precise).toBe(true)
    // Turning precise mode on or off translates the message again.
    s.precise.enabled = false
    expect(toPublicSettings(s).providerSignature).not.toBe(pub.providerSignature)
  })
})

describe("removing a service", () => {
  it("is blocked for the current service and for the fast service of race mode", () => {
    const s = createDefaultSettings()
    s.activeProviderId = "openai"
    expect(removalBlocker(s, "openai")).toBe("active")
    expect(removalBlocker(s, "google-free")).toBeNull()
    s.race.enabled = true
    expect(removalBlocker(s, "google-free")).toBe("race")
    expect(removalBlocker(s, "microsoft-free")).toBeNull()
  })
})
