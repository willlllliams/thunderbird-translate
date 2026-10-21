/** The settings of the background script (background/settings-state.ts): the first read, storing them in the current form, changes. */
import { describe, expect, it, vi } from "vitest"
import { createSettingsState } from "../src/background/settings-state"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"
import { createDefaultSettings, type Settings, SETTINGS_KEY, toPublicSettings } from "../src/shared/settings"
import { memoryStorage } from "./helpers"

/** A settings state over an in-memory storage.local holding `stored` (nothing: a fresh installation); `get` and `set` can be replaced before it reads. */
function state(stored?: unknown, beforeRead?: () => Promise<void>, over: { get?: (key: string) => Promise<unknown>; set?: (key: string, value: unknown) => Promise<void> } = {}) {
  const storage = memoryStorage()
  if (stored !== undefined) storage.data.set(SETTINGS_KEY, structuredClone(stored))
  if (over.get) storage.get = over.get
  if (over.set) storage.set = over.set
  const get = vi.spyOn(storage, "get")
  const set = vi.spyOn(storage, "set")
  const onAdopt = vi.fn((_s: Settings) => {})
  const onUiLanguage = vi.fn(async (_s: Settings) => {})
  const warn = vi.fn((_message: string, _error: unknown) => {})
  const settings = createSettingsState({ storage, beforeRead, onAdopt, onUiLanguage, warn })
  return { settings, storage, get, set, onAdopt, onUiLanguage, warn, stored: () => storage.data.get(SETTINGS_KEY) as Settings }
}

describe("settings of the background script", () => {
  it("stores the settings of a fresh installation", async () => {
    const { settings, set, stored } = state()
    await settings.ready()
    expect(set).toHaveBeenCalledTimes(1)
    expect(stored().tiers).toEqual(createDefaultSettings().tiers)
  })

  it("rewrites settings of 1.3 and earlier in the current form", async () => {
    const { settings, stored } = state({ activeProviderId: "deepseek", targetLang: "ja" })
    await settings.ready()
    expect(stored().tiers).toEqual({ dictionary: null, machine: null, ai: "deepseek" })
    expect(stored().targetLang).toBe("ja")
    expect(settings.current().tiers.ai).toBe("deepseek")
  })

  it("B13: counts a change of a key or an app ID, which leaves the signatures alone, and no other change", async () => {
    const { settings } = state(createDefaultSettings())
    await settings.ready()
    const start = settings.credentials()
    const s = createDefaultSettings()
    s.providers.baidu = { enabled: true, apiKey: "k", baseURL: "", model: "", appId: "1" }
    s.tiers.machine = "baidu"
    settings.adopt(s)
    const signatures = toPublicSettings(settings.current(), settings.credentials()).signatures
    s.providers.baidu.appId = "2"
    settings.adopt(structuredClone(s))
    expect(settings.credentials()).toBe(start + 2)
    expect(toPublicSettings(settings.current(), settings.credentials())).toMatchObject({ signatures, credentials: start + 2 })
    expect(JSON.stringify(toPublicSettings(settings.current(), settings.credentials()))).not.toContain('"2"')
    s.targetLang = "fr"
    settings.adopt(structuredClone(s))
    expect(settings.credentials()).toBe(start + 2)
  })

  it("leaves current settings alone", async () => {
    const { settings, set } = state(createDefaultSettings())
    await settings.ready()
    expect(set).not.toHaveBeenCalled()
  })

  it("L10: stores current settings again when reading them migrated a copy of a built-in prompt", async () => {
    const s = createDefaultSettings()
    s.prompts.bilingual = `  ${DEFAULT_PROMPTS.bilingual}
`
    s.prompts.precise = "My own prompt for {{to}}."
    const { settings, set, stored } = state(s)
    await settings.ready()
    expect(set).toHaveBeenCalledTimes(1)
    expect(stored().prompts).toEqual({ bilingual: "", translationOnly: "", precise: "My own prompt for {{to}}.", summary: "", image: "" })
  })

  it("adopts the settings it read and applies their interface language before it is ready", async () => {
    const s = createDefaultSettings()
    s.uiLanguage = "de"
    const { settings, onAdopt, onUiLanguage } = state(s)
    // Until the first read: the defaults.
    expect(settings.current().uiLanguage).toBe("auto")
    let applied = false
    onUiLanguage.mockImplementation(async () => {
      await Promise.resolve()
      applied = true
    })
    await settings.ready()
    expect(applied).toBe(true)
    expect(onAdopt).toHaveBeenCalledTimes(1)
    expect(onAdopt.mock.calls[0][0].uiLanguage).toBe("de")
    expect(onUiLanguage).toHaveBeenCalledTimes(1)
  })

  it("calls beforeRead at once and reads the settings only after it", async () => {
    let settle!: () => void
    const beforeRead = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)))
    const s = createDefaultSettings()
    s.targetLang = "fr"
    const { settings, onAdopt } = state(s, beforeRead)
    expect(beforeRead).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(onAdopt).not.toHaveBeenCalled()
    settle()
    await settings.ready()
    expect(settings.current().targetLang).toBe("fr")
  })

  it("takes over a change and applies the interface language only when it changed", async () => {
    const { settings, onAdopt, onUiLanguage } = state(createDefaultSettings())
    await settings.ready()
    const s = createDefaultSettings()
    s.targetLang = "ja"
    settings.adopt(s)
    expect(settings.current().targetLang).toBe("ja")
    expect(onAdopt).toHaveBeenCalledTimes(2)
    expect(onUiLanguage).toHaveBeenCalledTimes(1)
    s.uiLanguage = "fr"
    settings.adopt(s)
    expect(onUiLanguage).toHaveBeenCalledTimes(2)
    expect(onUiLanguage.mock.calls[1][0].uiLanguage).toBe("fr")
  })

  it("keeps a change taken over before the first read ended: the older stored settings are neither applied nor written back", async () => {
    let settle!: () => void
    const beforeRead = () => new Promise<void>((resolve) => (settle = resolve))
    // Settings of 1.3, which reading would migrate and write back.
    const { settings, set, onAdopt, stored } = state({ activeProviderId: "deepseek", targetLang: "ja" }, beforeRead)
    const newer = createDefaultSettings()
    newer.targetLang = "fr"
    settings.adopt(newer)
    settle()
    await settings.ready()
    expect(settings.current().targetLang).toBe("fr")
    expect(onAdopt.mock.calls.map(([s]) => s.targetLang)).toEqual(["fr"])
    expect(set).not.toHaveBeenCalled()
    expect(stored()).toEqual({ activeProviderId: "deepseek", targetLang: "ja" })
  })

  it("is ready although writing the migrated settings back fails, and says why", async () => {
    const { settings, onUiLanguage, warn } = state({ activeProviderId: "deepseek" }, undefined, { set: () => Promise.reject(new Error("quota exceeded")) })
    await expect(settings.ready()).resolves.toBeUndefined()
    expect(settings.current().tiers.ai).toBe("deepseek")
    expect(onUiLanguage).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not store"), new Error("quota exceeded"))
  })

  it("falls back to the defaults when reading fails, and reads again at the next request", async () => {
    const s = createDefaultSettings()
    s.targetLang = "ja"
    let failing = true
    const { settings, storage, get, onAdopt, onUiLanguage, warn } = state(s, undefined, {
      get: async (key) => {
        if (failing) throw new Error("storage unavailable")
        return storage.data.get(key)
      },
    })
    await expect(settings.ready()).resolves.toBeUndefined()
    expect(settings.current()).toEqual(createDefaultSettings())
    expect(onAdopt).toHaveBeenCalledTimes(1)
    expect(onUiLanguage).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not read"), new Error("storage unavailable"))
    failing = false
    await settings.ready()
    expect(settings.current().targetLang).toBe("ja")
    expect(get).toHaveBeenCalledTimes(2)
    // Read once: no further reads.
    await settings.ready()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("does not read again after a failed read when a change was taken over meanwhile", async () => {
    const { settings, get } = state(createDefaultSettings(), undefined, { get: () => Promise.reject(new Error("storage unavailable")) })
    await settings.ready()
    const s = createDefaultSettings()
    s.targetLang = "ko"
    settings.adopt(s)
    await settings.ready()
    expect(settings.current().targetLang).toBe("ko")
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("is ready when beforeRead or applying the interface language fails", async () => {
    const s = createDefaultSettings()
    s.targetLang = "ja"
    const { settings, onUiLanguage, warn } = state(s, () => Promise.reject(new Error("hook failed")))
    onUiLanguage.mockRejectedValueOnce(new Error("no messages"))
    await expect(settings.ready()).resolves.toBeUndefined()
    expect(settings.current().targetLang).toBe("ja")
    expect(warn.mock.calls.map(([, e]) => (e as Error).message)).toEqual(["hook failed", "no messages"])
  })
})
