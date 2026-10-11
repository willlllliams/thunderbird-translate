/** PersistentCache (LRU + storage.local) and the cache keys the translation service builds. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { CACHE_STORAGE_KEY, cacheKey, LruCache, PersistentCache } from "../src/background/cache"
import { hashText } from "../src/shared/hash"
import { createMailContext } from "../src/shared/mail-context"
import { promptText } from "../src/shared/prompts"
import { createDefaultSettings } from "../src/shared/settings"
import { createService, memoryStorage } from "./helpers"

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

  it("store the machine tier under service and languages, the AI tier also under model, prompt and message", async () => {
    const settings = createDefaultSettings()
    settings.tiers.ai = "openai"
    settings.providers.openai.apiKey = "sk"
    settings.providers.openai.model = "gpt-test"
    settings.precise.enabled = true
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) =>
      Response.json(new URLSearchParams(String(init.body)).getAll("q").map((q) => [`G(${q})`, "de"])),
    )
    const llm = { batch: vi.fn(), single: vi.fn(async () => "AI"), analyze: vi.fn(async () => null) }
    const { service, cache } = createService(settings, { fetchFn: fetchFn as unknown as typeof fetch, llm })
    await service.translate({ text: "Hallo", sourceLang: "de", targetLang: "en", providerId: "google-free" })
    expect(await cache.get(cacheKey("google-free", "", "de>en", "Hallo"))).toBe("G(Hallo)")

    const context = createMailContext(["Hallo"], [0])
    service.setContext(context)
    await service.translate({ text: "Hallo", targetLang: "en", providerId: "openai", context: { id: context.id, index: 0 } })
    const sig = `precise:${hashText(promptText(settings.prompts, "precise"))}:${context.id}`
    expect(await cache.get(cacheKey("openai", "gpt-test", "auto>en", "Hallo", sig))).toBe("AI")
  })
})
