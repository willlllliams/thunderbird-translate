/** Settings in storage.local: reading, writing and the three-way merge of edits made on several pages at once. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDefaultSettings, type Settings, SETTINGS_KEY } from "../src/shared/settings"
import { mergeChanges } from "../src/shared/settings-store"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** The store module over a fake storage.local holding `stored`. */
async function store(stored: unknown, uiLanguage = "en-US") {
  const area: Record<string, unknown> = { [SETTINGS_KEY]: structuredClone(stored) }
  const set = vi.fn(async (v: Record<string, unknown>) => void Object.assign(area, structuredClone(v)))
  vi.stubGlobal("browser", {
    storage: { local: { get: async (key: string) => ({ [key]: structuredClone(area[key]) }), set } },
    i18n: { getUILanguage: () => uiLanguage },
  })
  vi.resetModules()
  const mod = await import("../src/shared/settings-store")
  return { ...mod, set, stored: () => area[SETTINGS_KEY] as Settings }
}

describe("mergeChanges", () => {
  const merge = (target: object, base: object, source: object, keepTarget = false) => {
    const out = structuredClone(target)
    mergeChanges(out, base, source, keepTarget)
    return out
  }
  it.each([
    ["copies a changed value", { a: 1, b: 1 }, { a: 1, b: 1 }, { a: 2, b: 1 }, false, { a: 2, b: 1 }],
    ["leaves values the source did not change", { a: 5 }, { a: 1 }, { a: 1 }, false, { a: 5 }],
    ["overwrites a change of the target without keepTarget", { a: 5 }, { a: 1 }, { a: 2 }, false, { a: 2 }],
    ["keeps a change of the target with keepTarget", { a: 5 }, { a: 1 }, { a: 2 }, true, { a: 5 }],
    ["takes the source when the target is unchanged, with keepTarget", { a: 1 }, { a: 1 }, { a: 2 }, true, { a: 2 }],
    ["merges nested objects key by key", { p: { x: 1, y: 9 } }, { p: { x: 1, y: 1 } }, { p: { x: 2, y: 1 } }, false, { p: { x: 2, y: 9 } }],
    ["adds a key the base did not have", { a: 1 }, {}, { a: 1, n: { k: "v" } }, false, { a: 1, n: { k: "v" } }],
    ["merges into a new object of the source over a non-object base", { p: { x: 1 } }, { p: null }, { p: { y: 2 } }, false, { p: { x: 1, y: 2 } }],
    ["deletes a key the source removed", { m: "key", r: "eu" }, { m: "key", r: "eu" }, { r: "eu" }, false, { r: "eu" }],
    ["replaces an object by a value and a value by an object", { a: { x: 1 }, b: 1 }, { a: { x: 1 }, b: 1 }, { a: null, b: { y: 1 } }, false, { a: null, b: { y: 1 } }],
    ["treats arrays as values", { l: [1, 2] }, { l: [1] }, { l: [1, 3] }, false, { l: [1, 3] }],
  ])("%s", (_name, target, base, source, keepTarget, expected) => {
    expect(merge(target, base, source, keepTarget)).toEqual(expected)
  })

  it("copies values instead of sharing them with the source", () => {
    const source = { p: { x: [1] } }
    const target = { p: null }
    mergeChanges(target, { p: null }, source, false)
    source.p.x.push(2)
    expect(target).toEqual({ p: { x: [1] } })
  })
})

describe("settings in storage", () => {
  it("are read with defaults for a fresh installation in Thunderbird's language", async () => {
    const { loadSettings } = await store(undefined, "ko")
    expect(await loadSettings()).toEqual(createDefaultSettings("ko"))
  })

  it("are migrated when read", async () => {
    const { loadSettings, readSettings } = await store({ activeProviderId: "openai", providers: { openai: { apiKey: "sk", baseURL: "", model: "" } } })
    expect((await loadSettings()).tiers).toEqual({ dictionary: null, machine: null, ai: "openai" })
    expect(readSettings(null).tiers.machine).toBe("google-free")
  })

  it("updateSettings writes one change on top of what is stored", async () => {
    const s = createDefaultSettings("en")
    s.targetLang = "fr"
    const { updateSettings, stored, set } = await store(s)
    const result = await updateSettings((x) => (x.autoTranslate = true))
    expect(set).toHaveBeenCalledTimes(1)
    expect(stored()).toEqual(result)
    expect(stored()).toMatchObject({ targetLang: "fr", autoTranslate: true })
  })

  it("saveChanges writes only what one page changed, so a concurrent edit of another page survives", async () => {
    const base = createDefaultSettings("en")
    // The popup changed the target language and a key after the settings page loaded `base`.
    const latest = structuredClone(base)
    latest.targetLang = "de"
    latest.providers.openai.apiKey = "sk-popup"
    const { saveChanges, stored } = await store(latest)
    // The settings page changed the display mode and the model of the same service.
    const edited = structuredClone(base)
    edited.mode = "translation-only"
    edited.providers.openai.model = "gpt-4.1"
    const result = await saveChanges(base, edited)
    expect(result).toEqual(stored())
    expect(stored()).toMatchObject({ targetLang: "de", mode: "translation-only" })
    expect(stored().providers.openai).toMatchObject({ apiKey: "sk-popup", model: "gpt-4.1" })
  })

  it("saveChanges lets the saving page win when both pages changed the same value", async () => {
    const base = createDefaultSettings("en")
    const { saveChanges, stored } = await store({ ...structuredClone(base), targetLang: "de" })
    await saveChanges(base, { ...structuredClone(base), targetLang: "ja" })
    expect(stored().targetLang).toBe("ja")
  })
})
