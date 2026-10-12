/** The settings of the background script (background/settings-state.ts): the first read, storing them in the current form, changes. */
import { describe, expect, it, vi } from "vitest"
import { createSettingsState } from "../src/background/settings-state"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"
import { createDefaultSettings, type Settings, SETTINGS_KEY } from "../src/shared/settings"
import { memoryStorage } from "./helpers"

/** A settings state over an in-memory storage.local holding `stored` (nothing: a fresh installation). */
function state(stored?: unknown, beforeRead?: () => Promise<void>) {
  const storage = memoryStorage()
  if (stored !== undefined) storage.data.set(SETTINGS_KEY, structuredClone(stored))
  const set = vi.spyOn(storage, "set")
  const onAdopt = vi.fn((_s: Settings) => {})
  const onUiLanguage = vi.fn(async (_s: Settings) => {})
  const settings = createSettingsState({ storage, beforeRead, onAdopt, onUiLanguage })
  return { settings, set, onAdopt, onUiLanguage, stored: () => storage.data.get(SETTINGS_KEY) as Settings }
}

describe("settings of the background script", () => {
  it("stores the settings of a fresh installation", async () => {
    const { settings, set, stored } = state()
    await settings.ready
    expect(set).toHaveBeenCalledTimes(1)
    expect(stored().tiers).toEqual(createDefaultSettings().tiers)
  })

  it("rewrites settings of 1.3 and earlier in the current form", async () => {
    const { settings, stored } = state({ activeProviderId: "deepseek", targetLang: "ja" })
    await settings.ready
    expect(stored().tiers).toEqual({ dictionary: null, machine: null, ai: "deepseek" })
    expect(stored().targetLang).toBe("ja")
    expect(settings.current().tiers.ai).toBe("deepseek")
  })

  it("leaves current settings alone", async () => {
    const { settings, set } = state(createDefaultSettings())
    await settings.ready
    expect(set).not.toHaveBeenCalled()
  })

  it("L10: stores current settings again when reading them migrated a copy of a built-in prompt", async () => {
    const s = createDefaultSettings()
    s.prompts.bilingual = `  ${DEFAULT_PROMPTS.bilingual}
`
    s.prompts.precise = "My own prompt for {{to}}."
    const { settings, set, stored } = state(s)
    await settings.ready
    expect(set).toHaveBeenCalledTimes(1)
    expect(stored().prompts).toEqual({ bilingual: "", translationOnly: "", precise: "My own prompt for {{to}}." })
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
    await settings.ready
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
    await settings.ready
    expect(settings.current().targetLang).toBe("fr")
  })

  it("takes over a change and applies the interface language only when it changed", async () => {
    const { settings, onAdopt, onUiLanguage } = state(createDefaultSettings())
    await settings.ready
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
})
