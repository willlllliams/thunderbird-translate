/** PersistentCache (LRU + storage.local) and the cache keys the translation service builds. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { CACHE_STORAGE_KEY, cacheKey, LruCache, PersistentCache } from "../src/background/cache"
import { hashText } from "../src/shared/hash"
import { createMailContext } from "../src/shared/mail-context"
import { promptText } from "../src/shared/prompts"
import { createDefaultSettings } from "../src/shared/settings"
import { createService, memoryStorage, translateOne } from "./helpers"

afterEach(() => vi.useRealTimers())

describe("LruCache", () => {
  it("shrinks to a lower maximum, oldest first, and holds nothing at 0", () => {
    const lru = new LruCache<number>(5)
    lru.load([["a", 1], ["b", 2], ["c", 3], ["d", 4]])
    lru.setMaxEntries(2)
    expect(lru.entries()).toEqual([["c", 3], ["d", 4]])
    lru.setMaxEntries(-3)
    expect(lru.size).toBe(0)
    lru.set("e", 5)
    expect(lru.get("e")).toBeUndefined()
  })

  it("overwrites a key as the newest entry and evicts on load", () => {
    const lru = new LruCache<number>(2)
    lru.set("a", 1)
    lru.set("b", 2)
    lru.set("a", 3)
    lru.set("c", 4)
    expect(lru.entries()).toEqual([["a", 3], ["c", 4]])
    lru.load([["x", 1], ["y", 2], ["z", 3]])
    expect(lru.entries().map(([k]) => k)).toEqual(["y", "z"])
    lru.clear()
    expect(lru.size).toBe(0)
  })
})

describe("PersistentCache", () => {
  it("writes a burst of entries with one storage write after the delay", async () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const set = vi.spyOn(storage, "set")
    const cache = new PersistentCache(storage, 10, 1000)
    for (const k of ["a", "b", "c"]) await cache.set(k, k.toUpperCase())
    expect(set).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(set).toHaveBeenCalledTimes(1)
    expect(storage.data.get(CACHE_STORAGE_KEY)).toEqual([["a", "A"], ["b", "B"], ["c", "C"]])
  })

  it("keeps only the newest entries on reload and drops malformed ones", async () => {
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, [["old", "1"], ["k", 2], "junk", ["mid", "2"], ["new", "3"]])
    const cache = new PersistentCache(storage, 2, 0)
    expect(await cache.size()).toBe(2)
    expect(await cache.get("old")).toBeUndefined()
    expect(await cache.get("new")).toBe("3")
  })

  it("ignores stored data that is not a list, and a storage read that fails", async () => {
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, { not: "a list" })
    expect(await new PersistentCache(storage, 5).size()).toBe(0)
    storage.get = () => Promise.reject(new Error("storage unavailable"))
    const cache = new PersistentCache(storage, 5, 0)
    await cache.set("k", "v")
    expect(await cache.get("k")).toBe("v")
  })

  it("survives a storage write that fails", async () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    storage.set = () => Promise.reject(new Error("quota exceeded"))
    const cache = new PersistentCache(storage, 5, 10)
    await cache.set("k", "v")
    await vi.advanceTimersByTimeAsync(10)
    expect(await cache.get("k")).toBe("v")
  })

  it("evicts the oldest stored entry for a new one", async () => {
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, [["a", "stored"], ["b", "stored"]])
    const cache = new PersistentCache(storage, 2, 0)
    await cache.set("c", "fresh")
    expect(await cache.get("c")).toBe("fresh")
    expect(await cache.size()).toBe(2)
    expect(await cache.get("a")).toBeUndefined()
  })

  it("does not store empty translations", async () => {
    const cache = new PersistentCache(memoryStorage(), 5, 0)
    await cache.set("k", "")
    expect(await cache.size()).toBe(0)
  })

  it("answers nothing and stores nothing while disabled, and resizes with configure()", async () => {
    const cache = new PersistentCache(memoryStorage(), 5, 0)
    await cache.set("a", "1")
    await cache.set("b", "2")
    cache.configure(false, 5)
    expect(await cache.get("a")).toBeUndefined()
    await cache.set("c", "3")
    cache.configure(true, 1)
    expect(await cache.size()).toBe(1)
    expect(await cache.get("b")).toBe("2")
    expect(await cache.get("c")).toBeUndefined()
  })

  it("keeps the stored entries when a read fails: it reads again before the first write", async () => {
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, [["old", "1"]])
    vi.spyOn(storage, "get").mockRejectedValueOnce(new Error("storage busy"))
    const cache = new PersistentCache(storage, 10, 0)
    await cache.set("new", "2")
    await vi.waitFor(() => expect(storage.data.get(CACHE_STORAGE_KEY)).toEqual([
      ["old", "1"],
      ["new", "2"],
    ]))
    expect(await cache.get("old")).toBe("1")
  })

  it("writes nothing while the stored entries cannot be read", async () => {
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, [["old", "1"]])
    vi.spyOn(storage, "get").mockRejectedValue(new Error("storage broken"))
    const set = vi.spyOn(storage, "set")
    const cache = new PersistentCache(storage, 10, 0)
    await cache.set("new", "2")
    expect(await cache.get("new")).toBe("2")
    await new Promise((r) => setTimeout(r, 20))
    expect(set).not.toHaveBeenCalled()
    expect(storage.data.get(CACHE_STORAGE_KEY)).toEqual([["old", "1"]])
  })

  it("cancels a pending write when cleared", async () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const set = vi.spyOn(storage, "set")
    const cache = new PersistentCache(storage, 5, 100)
    await cache.set("k", "v")
    await cache.clear()
    await vi.advanceTimersByTimeAsync(200)
    expect(set).not.toHaveBeenCalled()
    expect(await cache.size()).toBe(0)
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

  it("store every tier under service, endpoint, languages and text; the AI tier also under model, prompt, thinking, temperature and message", async () => {
    const settings = createDefaultSettings()
    settings.tiers.ai = "openai"
    settings.providers.openai.apiKey = "sk"
    settings.providers.openai.model = "gpt-test"
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) =>
      Response.json(new URLSearchParams(String(init.body)).getAll("q").map((q) => [`G(${q})`, "de"])),
    )
    const llm = { batch: vi.fn(), single: vi.fn(async () => "AI"), analyze: vi.fn(async () => null) }
    const storage = memoryStorage()
    const { service, settings: s } = createService(settings, { fetchFn: fetchFn as unknown as typeof fetch, llm, cache: new PersistentCache(storage, 100, 0) })
    const google = () => translateOne(service, { text: "Hallo", sourceLang: "de", targetLang: "en", providerId: "google-free" })
    await google()
    await google()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    s.providers["google-free"].baseURL = "https://gt.example.com"
    await google()
    expect(fetchFn).toHaveBeenCalledTimes(2)

    const ai = () => translateOne(service, { text: "Hallo", targetLang: "en", providerId: "openai" })
    const asked = async () => {
      await ai()
      return llm.single.mock.calls.length
    }
    expect(await asked()).toBe(1)
    expect(await asked()).toBe(1)
    const openai = s.providers.openai
    for (const change of [() => (openai.baseURL = "https://proxy.example/v1"), () => (openai.thinking = true), () => (openai.temperature = 0.7), () => (openai.model = "gpt-other")]) {
      const before = llm.single.mock.calls.length
      change()
      expect(await asked()).toBe(before + 1)
    }
    // Back to the first configuration: its entry is still there.
    Object.assign(openai, { baseURL: "", thinking: false, temperature: undefined, model: "gpt-test" })
    expect(await asked()).toBe(5)
    // Keys stay compact: service, model, languages, one hash for everything else, one for the text.
    await vi.waitFor(() => expect(storage.data.get(CACHE_STORAGE_KEY)).toHaveLength(7))
    const keys = (storage.data.get(CACHE_STORAGE_KEY) as [string, string][]).map(([key]) => key.split("|"))
    expect(keys.every((parts) => parts.length === 5 && parts[3].length <= 24)).toBe(true)
    expect(keys.filter(([id]) => id === "openai").map(([, model, langs]) => `${model} ${langs}`).sort()).toEqual(["gpt-other auto>en", ...Array(4).fill("gpt-test auto>en")])
  })

  it("store the dictionary tier under the installed packs: another pack version translates again", async () => {
    const settings = createDefaultSettings()
    settings.tiers.dictionary = "dictionary"
    let packs = "en>zh-Hans@1"
    const dictionary = {
      translate: vi.fn(async (texts: string[]) => texts.map((t): PromiseSettledResult<string> => ({ status: "fulfilled", value: `D(${t})` }))),
      signature: vi.fn(async () => packs),
    }
    const { service } = createService(settings, { dictionary })
    const ask = () => translateOne(service, { text: "Hello", providerId: "dictionary" })
    await ask()
    await ask()
    expect(dictionary.translate).toHaveBeenCalledTimes(1)
    packs = "en>zh-Hans@2"
    await ask()
    expect(dictionary.translate).toHaveBeenCalledTimes(2)
  })
})
