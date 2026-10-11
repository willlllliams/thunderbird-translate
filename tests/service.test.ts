import { describe, expect, it, vi } from "vitest"
import { CACHE_STORAGE_KEY, cacheKey, LruCache, PersistentCache } from "../src/background/cache"
import type { LlmImpl } from "../src/background/service"
import { BatchParseError, llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle } from "../src/background/translators/llm"
import type { Segment } from "../src/background/translators/llm-prompt"
import { createDefaultSettings, type Settings } from "../src/shared/settings"
import { asFetch, chatCompletion, createService, jsonResponse, memoryStorage } from "./helpers"

function setup(over: (s: Settings) => void = () => {}, extra: { llm?: LlmImpl; fetchFn?: unknown } = {}) {
  const settings = createDefaultSettings()
  over(settings)
  return createService(settings, { llm: extra.llm, fetchFn: asFetch(extra.fetchFn) })
}

describe("LRU cache", () => {
  it("evicts the least recently used entry", () => {
    const lru = new LruCache<string>(2)
    lru.set("a", "1")
    lru.set("b", "2")
    lru.get("a")
    lru.set("c", "3")
    expect(lru.entries().map(([k]) => k)).toEqual(["a", "c"])
  })

  it("persists to storage and reloads in a new instance", async () => {
    const storage = memoryStorage()
    const c1 = new PersistentCache(storage, 10, 0)
    await c1.set("k1", "v1")
    await vi.waitFor(() => expect(storage.data.get(CACHE_STORAGE_KEY)).toEqual([["k1", "v1"]]))
    const c2 = new PersistentCache(storage, 10, 0)
    expect(await c2.get("k1")).toBe("v1")
    await c2.clear()
    expect(storage.data.has(CACHE_STORAGE_KEY)).toBe(false)
  })

  it("stays empty when cleared while the stored entries are still loading", async () => {
    const storage = memoryStorage()
    storage.data.set(CACHE_STORAGE_KEY, [["k1", "v1"]])
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const read = storage.get
    // The read answers with the entries stored at the time of the request.
    storage.get = (k) => {
      const answer = read(k)
      return gate.then(() => answer)
    }
    const cache = new PersistentCache(storage, 10, 0)
    const first = cache.get("k1")
    const cleared = cache.clear()
    release()
    await Promise.all([first, cleared])
    expect(await cache.get("k1")).toBeUndefined()
    expect(await cache.size()).toBe(0)
    expect(storage.data.has(CACHE_STORAGE_KEY)).toBe(false)
  })

  it("keys depend on provider, model, language and text", () => {
    const base = cacheKey("openai", "gpt", "zh-CN", "Hello")
    expect(cacheKey("openai", "gpt", "zh-CN", "Hello")).toBe(base)
    expect(cacheKey("openai", "gpt2", "zh-CN", "Hello")).not.toBe(base)
    expect(cacheKey("openai", "gpt", "ja", "Hello")).not.toBe(base)
    expect(cacheKey("deepseek", "gpt", "zh-CN", "Hello")).not.toBe(base)
    expect(cacheKey("openai", "gpt", "zh-CN", "Hello!")).not.toBe(base)
  })
})

describe("TranslationService with Google", () => {
  it("merges paragraphs from one window into one request and caches them", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const qs = new URLSearchParams(String(init.body)).getAll("q")
      return jsonResponse(qs.map((q) => [`ZH(${q})`, "en"]))
    })
    const { service } = setup(() => {}, { fetchFn })
    const out = await Promise.all(["One", "Two", "Three"].map((t) => service.translate({ text: t, targetLang: "zh-CN", providerId: "google-free" })))
    expect(out).toEqual(["ZH(One)", "ZH(Two)", "ZH(Three)"])
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // Second time: all from cache, no request.
    expect(await service.translate({ text: "Two", targetLang: "zh-CN", providerId: "google-free" })).toBe("ZH(Two)")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("deduplicates identical paragraphs in flight", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const qs = new URLSearchParams(String(init.body)).getAll("q")
      return jsonResponse(qs.map((q) => [`ZH(${q})`, "en"]))
    })
    const { service } = setup(() => {}, { fetchFn })
    await Promise.all([service.translate({ text: "Same", targetLang: "zh-CN", providerId: "google-free" }), service.translate({ text: "Same", targetLang: "zh-CN", providerId: "google-free" })])
    const body = new URLSearchParams(String(fetchFn.mock.calls[0][1].body))
    expect(body.getAll("q")).toEqual(["Same"])
  })

  it("splits into several requests when maxItemsPerBatch is small", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const qs = new URLSearchParams(String(init.body)).getAll("q")
      return jsonResponse(qs.map((q) => [q, "en"]))
    })
    const { service } = setup((s) => (s.batch.maxItemsPerBatch = 2), { fetchFn })
    await Promise.all(["a1", "a2", "a3", "a4", "a5"].map((t) => service.translate({ text: t, targetLang: "zh-CN", providerId: "google-free" })))
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })
})

describe("TranslationService with an LLM", () => {
  const useOpenAI = (s: Settings) => {
    s.activeProviderId = "openai"
    s.providers.openai.apiKey = "sk-test"
  }

  it("sends one LLM call per batch", async () => {
    const llm: LlmImpl = {
      batch: vi.fn(async (segs: Segment[]) => segs.map((g) => `ZH(${g.text})`)),
      single: vi.fn(async (g: Segment) => `ZH(${g.text})`),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup(useOpenAI, { llm })
    const out = await Promise.all(["a", "b", "c", "d"].map((t) => service.translate({ text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(out).toEqual(["ZH(a)", "ZH(b)", "ZH(c)", "ZH(d)"])
    expect(llm.batch).toHaveBeenCalledTimes(1)
    expect(llm.single).not.toHaveBeenCalled()
  })

  it("falls back to one call per paragraph when the batch answer cannot be parsed", async () => {
    const llm: LlmImpl = {
      batch: vi.fn(async () => {
        throw new BatchParseError("count mismatch")
      }),
      single: vi.fn(async (g: Segment) => `ZH(${g.text})`),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup(useOpenAI, { llm })
    const out = await Promise.all(["a", "b", "c"].map((t) => service.translate({ text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(out).toEqual(["ZH(a)", "ZH(b)", "ZH(c)"])
    expect(llm.batch).toHaveBeenCalledTimes(1)
    expect(llm.single).toHaveBeenCalledTimes(3)
  })

  it("does not fall back on authentication errors", async () => {
    const llm: LlmImpl = {
      batch: vi.fn(async () => {
        throw Object.assign(new Error("Incorrect API key"), { statusCode: 401, isRetryable: false })
      }),
      single: vi.fn(async (g: Segment) => g.text),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup(useOpenAI, { llm })
    const results = await Promise.allSettled(["a", "b"].map((t) => service.translate({ text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(results.every((r) => r.status === "rejected" && /Incorrect API key/.test(String(r.reason)))).toBe(true)
    expect(llm.single).not.toHaveBeenCalled()
  })

  it("translates one paragraph per call when LLM batching is disabled", async () => {
    const llm: LlmImpl = {
      batch: vi.fn(async (segs: Segment[]) => segs.map((g) => g.text)),
      single: vi.fn(async (g: Segment) => `ZH(${g.text})`),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup(
      (s) => {
        useOpenAI(s)
        s.batch.llmBatchEnabled = false
      },
      { llm },
    )
    await Promise.all(["a", "b", "c"].map((t) => service.translate({ text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(llm.batch).not.toHaveBeenCalled()
    expect(llm.single).toHaveBeenCalledTimes(3)
  })

  it("end to end through the AI SDK: one HTTP request, system prompt sent once", async () => {
    const bodies: { messages: { role: string; content: string }[] }[] = []
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      const content = '```json\n["早上好", "晚安", "谢谢"]\n```'
      return chatCompletion(content)
    })
    const { service } = setup(useOpenAI, {
      fetchFn,
      llm: { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail },
    })
    const out = await Promise.all(["Good morning", "Good night", "Thanks"].map((t) => service.translate({ text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(out).toEqual(["早上好", "晚安", "谢谢"])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const systemMessages = bodies[0].messages.filter((m) => m.role === "system")
    expect(systemMessages).toHaveLength(1)
    expect(systemMessages[0].content).toContain("Simplified Chinese")
    const user = bodies[0].messages.find((m) => m.role === "user")!.content as unknown as string
    expect(JSON.stringify(user)).toContain("exactly 3 strings")
  })

  it("end to end: mismatched batch output falls back to single requests", async () => {
    let call = 0
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      call++
      const body = JSON.parse(String(init?.body))
      const prompt = JSON.stringify(body.messages)
      // First call is the batch: answer with only one item. Then single calls.
      const content = call === 1 ? '["只有一条"]' : prompt.includes("Good morning") ? "早上好" : "晚安"
      return chatCompletion(content)
    })
    const { service } = setup(useOpenAI, {
      fetchFn,
      llm: { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail },
    })
    const out = await Promise.all(["Good morning", "Good night"].map((t) => service.translate({ text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(out).toEqual(["早上好", "晚安"])
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })
})
