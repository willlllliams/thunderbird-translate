/** PersistentCache (memory + IndexedDB, moved from storage.local) and the cache keys the translation service builds. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { IDBFactory } from "fake-indexeddb"
import { CACHE_STORAGE_KEY, cacheKey, idbCacheStore, LruCache, PersistentCache } from "../src/background/cache"
import { hashText } from "../src/shared/hash"
import { createDefaultSettings, type Settings } from "../src/shared/settings"
import { createService, fakeDictionary, memoryCacheStore, memoryStorage, translateOne, until, useFakeTimers } from "./helpers"

afterEach(() => vi.useRealTimers())

describe("LruCache", () => {
  it("shrinks to a lower maximum, oldest first, and holds nothing at 0", () => {
    const lru = new LruCache<number>(5)
    for (const [key, value] of [["a", 1], ["b", 2], ["c", 3], ["d", 4]] as const) lru.set(key, value)
    lru.setMaxEntries(2)
    expect(lru.entries()).toEqual([["c", 3], ["d", 4]])
    lru.setMaxEntries(-3)
    expect(lru.size).toBe(0)
    lru.set("e", 5)
    expect(lru.get("e")).toBeUndefined()
  })

  it("overwrites a key as the newest entry", () => {
    const lru = new LruCache<number>(2)
    lru.set("a", 1)
    lru.set("b", 2)
    lru.set("a", 3)
    lru.set("c", 4)
    expect(lru.entries()).toEqual([["a", 3], ["c", 4]])
    lru.clear()
    expect(lru.size).toBe(0)
  })
})

describe("PersistentCache", () => {
  /** A cache over a database of its own, `idb`, and storage.local `storage`; writes go 10 ms after them. */
  const open = (max = 10, idb = new IDBFactory(), storage = memoryStorage()) => ({ cache: new PersistentCache(storage, max, 10, idbCacheStore(() => idb)), idb, storage })
  const reopen = (idb: IDBFactory, max = 10) => new PersistentCache(memoryStorage(), max, 10, idbCacheStore(() => idb))

  it("F1: writes one record per entry into IndexedDB, nothing into storage.local, and a burst in one transaction", async () => {
    const { cache, idb, storage } = open(2000)
    const set = vi.spyOn(storage, "set")
    for (let i = 0; i < 1000; i++) await cache.set(`k${i}`, `v${i}`)
    expect(await cache.size()).toBe(1000)
    expect(set).not.toHaveBeenCalled()
    const later = reopen(idb, 2000)
    expect([await later.get("k0"), await later.get("k999"), await later.get("nope")]).toEqual(["v0", "v999", undefined])
  })

  it("F1: moves the cache of storage.local into the database once, keeping what was written meanwhile, and drops malformed entries", async () => {
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, [["old", "1"], ["k", 2], "junk", ["mid", "2"], ["new", "3"]])
    const remove = vi.spyOn(storage, "remove")
    const { cache, idb } = open(10, new IDBFactory(), storage)
    await cache.set("mid", "written")
    expect([await cache.get("old"), await cache.get("mid"), await cache.get("new"), await cache.get("k")]).toEqual(["1", "written", "3", undefined])
    expect(remove).toHaveBeenCalledTimes(1)
    expect(storage.data.has(CACHE_STORAGE_KEY)).toBe(false)
    expect(await reopen(idb).size()).toBe(3)
    // A read of storage.local that fails is tried again later, not with every use.
    useFakeTimers(new Date())
    const busy = memoryStorage()
    busy.data.set(CACHE_STORAGE_KEY, [["a", "1"]])
    const read = vi.spyOn(busy, "get").mockRejectedValueOnce(new Error("storage busy"))
    const retried = open(10, new IDBFactory(), busy).cache
    expect(await retried.get("a")).toBeUndefined()
    expect(await retried.get("a")).toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(61_000)
    expect(await retried.get("a")).toBe("1")
    vi.useRealTimers()
    // Stored data that is not a list goes as well.
    const odd = memoryStorage()
    odd.data.set(CACHE_STORAGE_KEY, { not: "a list" })
    expect(await open(5, new IDBFactory(), odd).cache.size()).toBe(0)
    expect(odd.data.has(CACHE_STORAGE_KEY)).toBe(false)
  })

  it("BG1: moves the old cache although the database holds some of its keys already, and removes it from storage.local", async () => {
    const idb = new IDBFactory()
    const first = open(10, idb).cache
    await first.set("known", "newer")
    expect(await first.size()).toBe(1)
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, [["known", "older"], ["other", "2"]])
    const { cache } = open(10, idb, storage)
    expect([await cache.get("known"), await cache.get("other")]).toEqual(["newer", "2"])
    expect(storage.data.has(CACHE_STORAGE_KEY)).toBe(false)
  })

  it("RG3: reads storage.local once, not with every use, while the database cannot take the old cache", async () => {
    useFakeTimers(new Date())
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, [["a", "1"]])
    const read = vi.spyOn(storage, "get")
    const store = memoryCacheStore()
    store.addMissing = async () => {
      throw new Error("quota")
    }
    const cache = new PersistentCache(storage, 10, 10, store)
    for (let i = 0; i < 100; i++) expect(await cache.get(`k${i}`)).toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
    expect(storage.data.has(CACHE_STORAGE_KEY)).toBe(true)
    // The write of results goes on, and the old cache is tried again a minute later.
    await cache.set("k", "v")
    expect(await cache.get("k")).toBe("v")
    store.addMissing = async (list) => void list.forEach(([key, entry]) => store.data.set(key, entry))
    await vi.advanceTimersByTimeAsync(61_000)
    expect(await cache.get("a")).toBe("1")
    expect(storage.data.has(CACHE_STORAGE_KEY)).toBe(false)
    vi.useRealTimers()
  })

  it("RG8: adopting the same settings again touches no database; a lower maximum trims with the next write", async () => {
    useFakeTimers()
    const store = memoryCacheStore()
    const write = vi.spyOn(store, "write")
    const trim = vi.spyOn(store, "trim")
    const cache = new PersistentCache(memoryStorage(), 10, 10, store)
    cache.configure(true, 10)
    cache.configure(true, 10)
    await vi.advanceTimersByTimeAsync(100)
    expect([write.mock.calls.length, trim.mock.calls.length]).toEqual([0, 0])
    cache.configure(true, 5)
    await vi.advanceTimersByTimeAsync(100)
    expect([write.mock.calls.length, trim.mock.calls.length]).toEqual([0, 1])
    expect(trim).toHaveBeenCalledWith(5)
    vi.useRealTimers()
  })

  it("F1: drops the entries used least recently beyond the maximum", async () => {
    const { cache, idb } = open(10)
    for (let i = 0; i < 15; i++) await cache.set(`k${i}`, "v")
    // Used again: newer than the ones written after it.
    await cache.get("k0")
    await cache.set("k15", "v")
    expect(await cache.size()).toBe(10)
    const later = reopen(idb)
    const kept = []
    for (let i = 0; i < 16; i++) if ((await later.get(`k${i}`)) !== undefined) kept.push(i)
    expect(kept).toEqual([0, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  })

  it("does not store empty translations, forgets a deleted entry, and is empty once cleared", async () => {
    const { cache, idb } = open()
    await cache.set("k", "")
    expect(await cache.size()).toBe(0)
    await cache.set("a", "1")
    await cache.set("b", "2")
    await cache.delete("a")
    expect(await cache.get("a")).toBeUndefined()
    expect(await reopen(idb).get("a")).toBeUndefined()
    await cache.clear()
    expect([await cache.size(), await cache.get("b"), await reopen(idb).get("b")]).toEqual([0, undefined, undefined])
  })

  it("answers nothing and stores nothing while disabled, and resizes with configure()", async () => {
    const { cache } = open(5)
    await cache.set("a", "1")
    await cache.set("b", "2")
    cache.configure(false, 5)
    expect(await cache.get("a")).toBeUndefined()
    await cache.set("c", "3")
    await cache.delete("b")
    cache.configure(true, 1)
    expect(await cache.size()).toBe(1)
    expect(await cache.get("b")).toBe("2")
    expect(await cache.get("c")).toBeUndefined()
  })

  it("cancels a pending write when cleared", async () => {
    useFakeTimers()
    const { cache, idb } = open()
    await cache.set("k", "v")
    await cache.clear()
    await vi.advanceTimersByTimeAsync(200)
    expect(await reopen(idb).get("k")).toBeUndefined()
  })

  it("keeps working in memory when the database cannot be opened", async () => {
    const broken = () => {
      throw new Error("no IndexedDB")
    }
    const cache = new PersistentCache(memoryStorage(), 5, 0, idbCacheStore(broken))
    await cache.set("k", "v")
    expect(await cache.get("k")).toBe("v")
    expect(await cache.get("other")).toBeUndefined()
    expect(await cache.size()).toBe(1)
  })
})

describe("cache keys of the translation service", () => {
  it("are built from service, model, languages, prompt and text", () => {
    expect(cacheKey("openai", "gpt", "auto>zh-CN", "Hello", "bilingual:abc")).toBe(`openai|gpt|auto>zh-CN|bilingual:abc|${hashText("Hello")}`)
    expect(cacheKey("google-free", "", "en>de", "Hi")).toBe(`google-free||en>de||${hashText("Hi")}`)
  })

  it("hashes text by content and length", () => {
    expect(hashText("a")).toBe(hashText("a"))
    expect(new Set(["a", "b", "ab", "ba", "", "a ".repeat(500)].map(hashText)).size).toBe(6)
  })

  /** OpenAI as AI tier and Google as machine tier over a cache in `storage`; `asked()` counts the requests of each. */
  function keyed() {
    const settings = createDefaultSettings()
    settings.tiers.ai = "openai"
    settings.providers.openai.apiKey = "sk"
    settings.providers.openai.model = "gpt-test"
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) =>
      Response.json(new URLSearchParams(String(init.body)).getAll("q").map((q) => [`G(${q})`, "de"])),
    )
    const llm = { batch: vi.fn(), single: vi.fn(async () => "AI"), analyze: vi.fn(async () => null) }
    const store = memoryCacheStore()
    const { service, settings: s } = createService(settings, { fetchFn: fetchFn as unknown as typeof fetch, llm, cache: new PersistentCache(memoryStorage(), 100, 0, store) })
    const request = { text: "Hallo", sourceLang: "de", targetLang: "en" }
    const ask = (providerId: string) => translateOne(service, { ...request, providerId })
    return { s, store, request, fetchFn, llm, ask }
  }

  it("store the machine tier under its endpoint", async () => {
    const { s, fetchFn, ask } = keyed()
    await ask("google-free")
    await ask("google-free")
    expect(fetchFn).toHaveBeenCalledTimes(1)
    s.providers["google-free"].baseURL = "https://gt.example.com"
    await ask("google-free")
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it("give the machine tier one entry for all display modes and prompts", async () => {
    const { s, fetchFn, ask } = keyed()
    await ask("google-free")
    s.mode = "translation-only"
    s.prompts.translationOnly = "Translate into {{to}}."
    await ask("google-free")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it.each<[string, (s: Settings, request: { sourceLang: string; targetLang: string; text: string }) => void]>([
    ["endpoint", (s) => (s.providers.openai.baseURL = "https://proxy.example/v1")],
    ["model", (s) => (s.providers.openai.model = "gpt-other")],
    ["thinking", (s) => (s.providers.openai.thinking = true)],
    ["temperature", (s) => (s.providers.openai.temperature = 0.7)],
    ["prompt", (s) => (s.prompts.bilingual = "Translate into {{to}}, carefully.")],
    ["display mode", (s) => (s.mode = "translation-only")],
    ["source language", (_s, request) => (request.sourceLang = "fr")],
    ["target language", (_s, request) => (request.targetLang = "ja")],
    ["text", (_s, request) => (request.text = "Hallo Welt")],
  ])("store the AI tier under its %s", async (_field, change) => {
    const { s, request, llm, ask } = keyed()
    await ask("openai")
    await ask("openai")
    expect(llm.single).toHaveBeenCalledTimes(1)
    change(s, request)
    await ask("openai")
    expect(llm.single).toHaveBeenCalledTimes(2)
  })

  it("keep the entry of a configuration when another one is used for a while", async () => {
    const { s, llm, ask } = keyed()
    await ask("openai")
    s.providers.openai.thinking = true
    await ask("openai")
    s.providers.openai.thinking = false
    await ask("openai")
    expect(llm.single).toHaveBeenCalledTimes(2)
  })

  it("stay compact: service, model, languages, one hash for everything else and one for the text", async () => {
    const { s, store, ask } = keyed()
    await ask("google-free")
    await ask("openai")
    s.providers.openai.thinking = true
    await ask("openai")
    await until(() => expect(store.data.size).toBe(3))
    const keys = [...store.data.keys()].map((key) => key.split("|"))
    expect(keys.every((parts) => parts.length === 5 && parts[3].length <= 24)).toBe(true)
    expect(keys.map(([id, model, langs]) => `${id} ${model} ${langs}`)).toEqual(["google-free  de>en", "openai gpt-test de>en", "openai gpt-test de>en"])
  })

  it("store the dictionary tier under the installed packs: another pack version translates again", async () => {
    const settings = createDefaultSettings()
    settings.tiers.dictionary = "dictionary"
    let packs = "en>zh-Hans@1"
    const dictionary = fakeDictionary()
    dictionary.signature.mockImplementation(async () => packs)
    const { service } = createService(settings, { dictionary })
    const ask = () => translateOne(service, { text: "Hello", providerId: "dictionary" })
    await ask()
    await ask()
    expect(dictionary.translate).toHaveBeenCalledTimes(1)
    packs = "en>zh-Hans@2"
    await ask()
    expect(dictionary.translate).toHaveBeenCalledTimes(2)
  })

  it("store no dictionary result when the installed packs changed while it was translated", async () => {
    const settings = createDefaultSettings()
    settings.tiers.dictionary = "dictionary"
    let packs = "none"
    let release!: () => void
    const dictionary = fakeDictionary(new Promise<void>((resolve) => (release = resolve)))
    dictionary.signature.mockImplementation(async () => packs)
    const { service } = createService(settings, { dictionary })
    const ask = () => translateOne(service, { text: "Hello", providerId: "dictionary" })
    const first = ask()
    await until(() => expect(dictionary.translate).toHaveBeenCalledTimes(1))
    // A pack is installed while the batch runs, which may already use it: the result is not stored under the key of no packs.
    packs = "en>zh-Hans@1"
    release()
    expect(await first).toBe("D(Hello)")
    // The pack is removed again: the paragraph is translated again, not answered from the cache.
    packs = "none"
    await ask()
    expect(dictionary.translate).toHaveBeenCalledTimes(2)
    // That result started and ended with the same packs and is kept.
    await ask()
    expect(dictionary.translate).toHaveBeenCalledTimes(2)
    // A signature that cannot be read at the end does not match the one read at the start.
    packs = "en>zh-Hans@2"
    dictionary.signature.mockImplementationOnce(async () => packs).mockImplementationOnce(async () => Promise.reject(new Error("idb")))
    await ask()
    await ask()
    expect(dictionary.translate).toHaveBeenCalledTimes(4)
  })
})
