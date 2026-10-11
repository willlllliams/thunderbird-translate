/** What the offline services need for a language pair, and the recommended and common languages of the offline lists (src/shared/offline-needs.ts). */
import { describe, expect, it } from "vitest"
import {
  type Catalog,
  COMMON_LANGUAGES,
  commonDirections,
  itemSources,
  lacksData,
  type OfflineService,
  offlineState,
  orderItems,
  pairNeeds,
  recommendedLanguages,
  serviceLang,
} from "../src/shared/offline-needs"

/** Catalog of a release: English to and from every language of `tags`, plus `extra` directions. */
const catalog = (tags: string[], extra: string[] = []): Set<string> => new Set([...tags.flatMap((t) => [`${t}>en`, `en>${t}`]), ...extra])
const RELEASE = catalog(["zh-Hans", "zh-Hant", "ja", "ko", "fr", "de", "es", "pt", "ru", "tr", "vi"])
const set = (...ids: string[]) => new Set(ids)

describe("pairNeeds", () => {
  it.each<[string, OfflineService, string, string, Catalog, Set<string>, { required: string[]; missing: string[]; unsupported: boolean }]>([
    ["source English: the direct pack", "dictionary", "en", "zh-CN", RELEASE, set(), { required: ["en>zh-Hans"], missing: ["en>zh-Hans"], unsupported: false }],
    ["target English: the direct pack", "dictionary", "de", "en", RELEASE, set("de>en"), { required: ["de>en"], missing: [], unsupported: false }],
    ["no English, no direct pack: both through English", "dictionary", "ja", "zh-CN", RELEASE, set(), { required: ["ja>en", "en>zh-Hans"], missing: ["ja>en", "en>zh-Hans"], unsupported: false }],
    ["through English, one installed", "dictionary", "ja", "zh-CN", RELEASE, set("ja>en"), { required: ["ja>en", "en>zh-Hans"], missing: ["en>zh-Hans"], unsupported: false }],
    ["direct pack in the catalog", "dictionary", "ja", "zh-CN", new Set([...RELEASE, "ja>zh-Hans"]), set(), { required: ["ja>zh-Hans"], missing: ["ja>zh-Hans"], unsupported: false }],
    ["direct pack offered, the way through English installed", "dictionary", "ja", "zh-CN", new Set([...RELEASE, "ja>zh-Hans"]), set("ja>en", "en>zh-Hans"), { required: ["ja>en", "en>zh-Hans"], missing: [], unsupported: false }],
    ["direct pack installed, not in the catalog", "dictionary", "ja", "ko", RELEASE, set("ja>ko"), { required: ["ja>ko"], missing: [], unsupported: false }],
    ["Bergamot never has direct models", "bergamot", "ja", "zh-CN", new Set([...RELEASE, "ja>zh-Hans"]), set(), { required: ["ja>en", "en>zh-Hans"], missing: ["ja>en", "en>zh-Hans"], unsupported: false }],
    ["Bergamot with English", "bergamot", "en", "fr", RELEASE, set(), { required: ["en>fr"], missing: ["en>fr"], unsupported: false }],
    ["direction missing from the catalog", "dictionary", "de", "en", catalog(["fr"]), set(), { required: [], missing: [], unsupported: true }],
    ["Bergamot: a language Mozilla does not offer", "bergamot", "is", "zh-CN", RELEASE, set(), { required: [], missing: [], unsupported: true }],
    ["unknown catalog: everything counts as offered", "bergamot", "is", "en", null, set(), { required: ["is>en"], missing: ["is>en"], unsupported: false }],
    ["Simplified and Traditional Chinese", "dictionary", "zh-TW", "zh-CN", RELEASE, set(), { required: [], missing: [], unsupported: true }],
    ["Chinese variants for Bergamot too", "bergamot", "zh-CN", "zh-TW", null, set(), { required: [], missing: [], unsupported: true }],
    ["a language the dictionary does not have", "dictionary", "it", "en", RELEASE, set(), { required: [], missing: [], unsupported: true }],
    ["the same language", "dictionary", "en", "en-GB", RELEASE, set(), { required: [], missing: [], unsupported: false }],
  ])("%s", (_name, service, source, target, offered, installed, expected) => {
    expect(pairNeeds(service, source, target, offered, installed)).toEqual(expected)
  })

  it("maps codes to the languages of each service", () => {
    expect(serviceLang("dictionary", "zh-TW")).toBe("zh-Hant")
    expect(serviceLang("dictionary", "pt-BR")).toBe("pt")
    expect(serviceLang("dictionary", "it")).toBeNull()
    expect(serviceLang("bergamot", "iw")).toBe("he")
    expect(serviceLang("bergamot", "auto")).toBeNull()
  })
})

describe("offlineState", () => {
  it("with a fixed source language, what the pair lacks", () => {
    expect(offlineState("dictionary", "ja", "zh-CN", RELEASE, set("ja>en"))).toEqual({ required: ["ja>en", "en>zh-Hans"], missing: ["en>zh-Hans"], unsupported: false })
  })

  it("with automatic detection into another language than English, the direction from English", () => {
    const state = offlineState("bergamot", "auto", "zh-CN", RELEASE, set("ja>en"))
    expect(state).toMatchObject({ missing: ["en>zh-Hans"], unsupported: false })
    expect(lacksData(state)).toBe(true)
    expect(lacksData(offlineState("bergamot", "auto", "zh-CN", RELEASE, set("en>zh-Hans")))).toBe(false)
  })

  it("with automatic detection into English, any direction into English", () => {
    const none = offlineState("dictionary", "auto", "en", RELEASE, set("en>de"))
    expect(none).toEqual({ missing: [], unsupported: false, anyInto: "en" })
    expect(lacksData(none)).toBe(true)
    expect(lacksData(offlineState("dictionary", "auto", "en", RELEASE, set("de>en")))).toBe(false)
    expect(offlineState("dictionary", "auto", "en", set("en>de"), set())).toEqual({ missing: [], unsupported: true })
    expect(lacksData(offlineState("dictionary", "auto", "en", null, set()))).toBe(true)
  })

  it("asks for nothing when the pair is unsupported", () => {
    const state = offlineState("dictionary", "auto", "it", RELEASE, set())
    expect(state.unsupported).toBe(true)
    expect(lacksData(state)).toBe(false)
  })
})

describe("recommended languages", () => {
  it("merges the sources of each language, by language tag; leaves out auto and empty codes", () => {
    expect(
      recommendedLanguages({
        target: ["zh-CN"],
        source: ["auto"],
        addon: ["zh-SG"],
        thunderbird: ["en-US"],
        system: ["zh-TW", "en-GB", "de", ""],
      }),
    ).toEqual([
      { tag: "zh-Hans", sources: ["target", "addon"] },
      { tag: "en", sources: ["thunderbird", "system"] },
      { tag: "zh-Hant", sources: ["system"] },
      { tag: "de", sources: ["system"] },
    ])
  })

  it("labels a direction with the sources of its language other than English, also for a direct pack", () => {
    const recommended = recommendedLanguages({ target: ["de"], source: ["ja"], system: ["ja-JP", "en"] })
    expect(itemSources("dictionary", "ja>en", recommended)).toEqual(["source", "system"])
    expect(itemSources("dictionary", "ja>de", recommended)).toEqual(["target", "source", "system"])
    expect(itemSources("dictionary", "fr>en", recommended)).toEqual([])
    expect(itemSources("bergamot", "en>de", recommended)).toEqual(["target"])
  })

  it("orders the directions of recommended languages first, by their most important source, then by name", () => {
    const recommended = recommendedLanguages({ target: ["de"], system: ["fr"] })
    const items = ["en>ja", "fr>en", "en>de", "en>fr", "de>en", "en>es"].map((id) => ({ id }))
    const ordered = orderItems(items, (i) => itemSources("dictionary", i.id, recommended), (i) => i.id, "en")
    expect(ordered.map((i) => i.id)).toEqual(["de>en", "en>de", "en>fr", "fr>en", "en>es", "en>ja"])
  })
})

describe("common languages", () => {
  it("are eight fixed languages besides English", () => {
    expect(COMMON_LANGUAGES).toEqual(["zh-Hans", "es", "fr", "de", "ja", "pt", "ru", "ko"])
  })

  it("download both directions with English of each, as far as the catalog has them", () => {
    expect(commonDirections(RELEASE)).toHaveLength(16)
    expect(commonDirections(["en>fr", "fr>en", "en>vi", "de>en", "en>zh-Hant", "ja>zh-Hans"])).toEqual(["fr>en", "en>fr", "de>en"])
    expect(commonDirections([])).toEqual([])
  })
})
