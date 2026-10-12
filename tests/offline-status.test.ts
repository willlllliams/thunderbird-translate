/** What the offline services lack for a pair of languages (background/offline-status.ts), with the catalogs read ahead. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createOfflineStatus } from "../src/background/offline-status"
import type { Settings } from "../src/shared/settings"
import { jsonResponse } from "./helpers"

/** The offline engine of the background page: its model list and installed models. */
const bergamot = vi.hoisted(() => ({ catalog: async (): Promise<Set<string> | null> => null, installedKeys: async () => new Set<string>() }))
vi.mock("../src/offline/bergamot", () => ({ getBergamot: () => bergamot }))

const pack = (src: string, tgt: string) => ({ src, tgt, file: `dict-${src}-${tgt}.tsv.gz`, bytes: 1, rawBytes: 1, entries: 1, forms: 0, sha256: "00".repeat(32), source: "", license: "", attribution: "" })
const both: Settings["tiers"] = { dictionary: "dictionary", machine: "bergamot", ai: null }

/** The status over a dictionary index served by `index` (a failed request without it) and the installed packs `installed`. */
function source({ installed = async () => new Set<string>(), tag = () => "dicts-v1" }: { installed?: () => Promise<Set<string>>; tag?: () => string } = {}) {
  let index: () => Promise<Response> = () => Promise.reject(new TypeError("NetworkError"))
  const fetch = vi.fn((url: string) => (url.endsWith("dict-index.json") ? index() : Promise.reject(new Error(`unexpected ${url}`))))
  vi.stubGlobal("fetch", fetch)
  const reads = () => fetch.mock.calls.length
  return { offline: createOfflineStatus({ releaseTag: tag, installedPacks: installed }), reads, serve: (packs: ReturnType<typeof pack>[]) => (index = async () => jsonResponse({ version: 1, packs })) }
}

beforeEach(() => {
  bergamot.catalog = vi.fn(async () => new Set(["en>zh-Hans", "ja>en"]))
  bergamot.installedKeys = vi.fn(async () => new Set(["en>zh-Hans"]))
})

describe("offline status", () => {
  it("says what the offline services of the tiers lack for the languages, reading the dictionary index again after a failure and after six hours", async () => {
    const { offline, reads, serve } = source()
    const ask = (sourceLang: string, targetLang: string, tiers = both) => offline.status(sourceLang, targetLang, tiers)
    const t0 = Date.now()
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0)
    const at = (ms: number) => clock.mockReturnValue(t0 + ms)
    // Without the index nothing is known to be downloadable.
    expect(await ask("auto", "zh-CN")).toEqual({
      dictionary: { required: ["en>zh-Hans"], missing: [], unsupported: false },
      bergamot: { required: ["en>zh-Hans"], missing: [], unsupported: false },
    })
    expect(reads()).toBe(1)
    // A failed index is read again after ten minutes, not before.
    serve([])
    expect(await ask("ja", "zh-CN")).toMatchObject({ dictionary: { required: ["ja>en", "en>zh-Hans"], missing: [], unsupported: false } })
    at(10 * 60_000 - 1)
    await ask("ja", "zh-CN")
    expect(reads()).toBe(1)
    at(10 * 60_000)
    expect(await ask("ja", "zh-CN")).toEqual({
      dictionary: { required: [], missing: [], unsupported: true },
      bergamot: { required: ["ja>en", "en>zh-Hans"], missing: ["ja>en"], unsupported: false },
    })
    await ask("de", "en")
    expect(reads()).toBe(2)
    // A background page that runs for days reads the index again after six hours.
    at(10 * 60_000 + 6 * 60 * 60_000 - 1)
    await ask("de", "en")
    expect(reads()).toBe(2)
    at(10 * 60_000 + 6 * 60 * 60_000)
    await ask("de", "en")
    expect(reads()).toBe(3)
    expect(await ask("auto", "zh-CN", { dictionary: null, machine: "google-free", ai: null })).toEqual({})
  })

  it("names the packs to download from the index and the installed packs", async () => {
    const { offline, serve } = source({ installed: async () => new Set(["en>zh-Hans"]) })
    serve([pack("ja", "en"), pack("en", "zh-Hans")])
    expect(await offline.status("ja", "zh-CN", { dictionary: "dictionary", machine: null, ai: null })).toEqual({
      dictionary: { required: ["ja>en", "en>zh-Hans"], missing: ["ja>en"], unsupported: false },
    })
  })

  it("says nothing about a service whose store cannot be read", async () => {
    const { offline, serve } = source({ installed: () => Promise.reject(new Error("db gone")) })
    serve([])
    bergamot.installedKeys = vi.fn(() => Promise.reject(new Error("db gone")))
    expect(await offline.status("ja", "zh-CN", both)).toEqual({})
  })

  it("reads the catalogs of the offline services in use ahead, and keeps the dictionary index for translations", async () => {
    const { offline, reads, serve } = source()
    serve([pack("en", "zh-Hans")])
    offline.readAhead({ dictionary: null, machine: "google-free", ai: null })
    expect([reads(), vi.mocked(bergamot.catalog).mock.calls.length]).toEqual([0, 0])
    expect(offline.knownDictionaryCatalog()).toBeNull()
    offline.readAhead(both)
    expect([reads(), vi.mocked(bergamot.catalog).mock.calls.length]).toEqual([1, 1])
    await vi.waitFor(() => expect(offline.knownDictionaryCatalog()).toEqual(new Set(["en>zh-Hans"])))
    // Read once: the index in memory answers until it is six hours old.
    offline.readAhead(both)
    expect(reads()).toBe(1)
  })

  it("keeps one index per release tag", async () => {
    let tag = "dicts-v1"
    const { offline, reads, serve } = source({ tag: () => tag })
    serve([pack("en", "zh-Hans")])
    offline.readAhead(both)
    await vi.waitFor(() => expect(offline.knownDictionaryCatalog()).not.toBeNull())
    tag = "dicts-v2"
    expect(offline.knownDictionaryCatalog()).toBeNull()
    offline.readAhead(both)
    expect(reads()).toBe(2)
  })
})
