import { describe, expect, it, vi } from "vitest"
import { CACHE_STORAGE_KEY, cacheKey, LruCache, PersistentCache } from "../src/background/cache"
import { errorContext, type LlmImpl, type TranslationService } from "../src/background/service"
import { type LlmCallOptions, llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle } from "../src/background/translators/llm"
import { BatchParseError } from "../src/background/translators/common"
import { MAX_PREFIX_TEXT_CHARS, type Segment } from "../src/background/translators/llm-prompt"
import { ENGLISH } from "../src/shared/i18n"
import { createMailContext } from "../src/shared/mail-context"
import type { TranslateRequest, TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings, DEFAULT_DEEPL, type ResolvedProvider, type Settings } from "../src/shared/settings"
import { allowed, asFetch, chatCompletion, createService, jsonResponse, memoryStorage, translateOne, until } from "./helpers"

function setup(over: (s: Settings) => void = () => {}, extra: { llm?: Partial<LlmImpl>; fetchFn?: unknown; cache?: PersistentCache } = {}) {
  const settings = createDefaultSettings()
  over(settings)
  return createService(settings, { llm: extra.llm, fetchFn: asFetch(extra.fetchFn), ...(extra.cache ? { cache: extra.cache } : {}) })
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
    await until(() => expect(storage.data.get(CACHE_STORAGE_KEY)).toEqual([["k1", "v1"]]))
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
  it("R1: a page that asks for a paragraph whose request was dropped gets a request of its own", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const qs = new URLSearchParams(String(init.body)).getAll("q")
      if (qs.includes("Blocker")) await gate
      return jsonResponse(qs.map((q) => [`ZH(${q})`, "en"]))
    })
    const { service } = setup((s) => (s.batch.concurrency = 1), { fetchFn })
    const ask = (text: string, signal: AbortSignal) => {
      let result: TranslateResponse | undefined
      return service.translateForPage({ text, sourceLang: "auto", targetLang: "zh-CN", tiers: ["machine"] }, (_tier, r) => (result = r), { signal }).then(() => result!)
    }
    const blocker = ask("Blocker", new AbortController().signal)
    await until(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    const [a, b] = [new AbortController(), new AbortController()]
    const first = ask("P", a.signal)
    await new Promise((r) => setTimeout(r, 20))
    a.abort()
    const second = ask("P", b.signal)
    release()
    await blocker
    expect(await second).toEqual({ ok: true, text: "ZH(P)" })
    expect((await first).ok).toBe(false)
    expect(fetchFn.mock.calls.filter(([, init]) => new URLSearchParams(String(init.body)).getAll("q").includes("P"))).toHaveLength(1)
  })

  it("B7: names an endpoint that is no URL, without a request and without retries", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ code: 200, data: "Hallo" }))
    const sleep = vi.fn(async () => {})
    const settings = createDefaultSettings()
    settings.providers.deeplx = { enabled: true, apiKey: "", baseURL: "localhost:1188/translate", model: "" }
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn), sleep, i18n: () => ENGLISH })
    await expect(translateOne(service, { text: "Hello", targetLang: "de", providerId: "deeplx" })).rejects.toThrow(ENGLISH.t("errEndpointInvalid", ["DeepLX"]))
    expect(fetchFn).not.toHaveBeenCalled()
    expect(sleep).not.toHaveBeenCalled()
  })

  it("B5: drops the paragraphs of a page that went away, before and while they wait, unless another page waits too", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      await gate
      return jsonResponse(new URLSearchParams(String(init.body)).getAll("q").map((q) => [`ZH(${q})`, "en"]))
    })
    const { service } = setup((s) => (s.batch.concurrency = 1), { fetchFn })
    const ask = (text: string, signal: AbortSignal) => {
      let result: TranslateResponse | undefined
      return service.translateForPage({ text, sourceLang: "auto", targetLang: "zh-CN", tiers: ["machine"] }, (_tier, r) => (result = r), { signal }).then(() => result!)
    }
    const [gone, kept, other] = [new AbortController(), new AbortController(), new AbortController()]
    // In one batch window: the paragraph of the page that goes away is left out of the batch.
    const dropped = ask("Gone", gone.signal)
    const first = ask("One", kept.signal)
    gone.abort()
    await until(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    expect(new URLSearchParams(String(fetchFn.mock.calls[0][1].body)).getAll("q")).toEqual(["One"])
    // Waiting for the only slot: dropped when its page goes, kept while another page waits for the same paragraph.
    const waiting = ask("Two", gone.signal)
    const shared = [ask("Three", other.signal), ask("Three", kept.signal)]
    await new Promise((r) => setTimeout(r, 20))
    other.abort()
    release()
    expect((await first).ok).toBe(true)
    expect(await Promise.all(shared)).toEqual([
      { ok: true, text: "ZH(Three)" },
      { ok: true, text: "ZH(Three)" },
    ])
    expect([(await dropped).ok, (await waiting).ok]).toEqual([false, false])
    expect(fetchFn.mock.calls.map(([, init]) => new URLSearchParams(String(init.body)).getAll("q"))).toEqual([["One"], ["Three"]])
  })

  it("B9: sends nothing to a service whose endpoint moved to a host the user did not allow", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ code: 200, data: "Hallo" }))
    const settings = createDefaultSettings()
    settings.providers.deeplx = { enabled: true, apiKey: "", baseURL: "http://localhost:1188/translate", model: "" }
    settings.onlineConsent = allowed(settings, "deeplx")
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) }, { consent: false })
    expect(await translateOne(service, { text: "Hello", targetLang: "de", providerId: "deeplx" })).toBe("Hallo")
    settings.providers.deeplx.baseURL = "https://deeplx.example.com/translate"
    await expect(translateOne(service, { text: "Good morning", targetLang: "de", providerId: "deeplx" })).rejects.toThrow(ENGLISH.t("errConsentRequired", ["DeepLX"]))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("R6: a request that waits goes to the host it was made for only while that host is still allowed", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fetchFn = vi.fn(async (_url: string) => (await gate, jsonResponse({ code: 200, data: "Hallo" })))
    const settings = createDefaultSettings()
    settings.batch.concurrency = 1
    settings.batch.maxItemsPerBatch = 1
    settings.providers.deeplx = { enabled: true, apiKey: "", baseURL: "http://localhost:1188/translate", model: "" }
    settings.onlineConsent = allowed(settings, "deeplx")
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) }, { consent: false })
    const first = translateOne(service, { text: "One", targetLang: "de", providerId: "deeplx" })
    await until(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    const second = translateOne(service, { text: "Two", targetLang: "de", providerId: "deeplx" }).catch((error: Error) => error.message)
    await new Promise((r) => setTimeout(r, 20))
    // The endpoint moves to a host the user allows; the request that waits was made for the old one.
    settings.providers.deeplx.baseURL = "https://deeplx.example.com/translate"
    settings.onlineConsent = allowed(settings, "deeplx")
    release()
    expect(await first).toBe("Hallo")
    expect(await second).toBe(ENGLISH.t("errConsentRequired", ["DeepLX"]))
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(["http://localhost:1188/translate"])
  })

  it("B1: sends nothing more once the user took the consent back, also what waits in the queue", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      await gate
      return jsonResponse(new URLSearchParams(String(init.body)).getAll("q").map((q) => [`ZH(${q})`, "en"]))
    })
    const { service, settings } = setup((s) => ((s.batch.concurrency = 1), (s.batch.maxItemsPerBatch = 1)), { fetchFn })
    const first = translateOne(service, { text: "One", providerId: "google-free" })
    await until(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    const second = translateOne(service, { text: "Two", providerId: "google-free" }).catch((error: Error) => error.message)
    // The second batch waits for the only slot.
    await new Promise((r) => setTimeout(r, 20))
    settings.onlineConsent = []
    release()
    expect(await first).toBe("ZH(One)")
    expect(await second).toBe(ENGLISH.t("errConsentRequired", ["Google Translate (free)"]))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("merges paragraphs from one window into one request and caches them", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const qs = new URLSearchParams(String(init.body)).getAll("q")
      return jsonResponse(qs.map((q) => [`ZH(${q})`, "en"]))
    })
    const { service } = setup(() => {}, { fetchFn })
    const out = await Promise.all(["One", "Two", "Three"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "google-free" })))
    expect(out).toEqual(["ZH(One)", "ZH(Two)", "ZH(Three)"])
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // Second time: all from cache, no request.
    expect(await translateOne(service, { text: "Two", targetLang: "zh-CN", providerId: "google-free" })).toBe("ZH(Two)")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("deduplicates identical paragraphs in flight", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const qs = new URLSearchParams(String(init.body)).getAll("q")
      return jsonResponse(qs.map((q) => [`ZH(${q})`, "en"]))
    })
    const { service } = setup(() => {}, { fetchFn })
    await Promise.all([translateOne(service, { text: "Same", targetLang: "zh-CN", providerId: "google-free" }), translateOne(service, { text: "Same", targetLang: "zh-CN", providerId: "google-free" })])
    const body = new URLSearchParams(String(fetchFn.mock.calls[0][1].body))
    expect(body.getAll("q")).toEqual(["Same"])
  })

  it("splits into several requests when maxItemsPerBatch is small", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const qs = new URLSearchParams(String(init.body)).getAll("q")
      return jsonResponse(qs.map((q) => [q, "en"]))
    })
    const { service } = setup((s) => (s.batch.maxItemsPerBatch = 2), { fetchFn })
    await Promise.all(["a1", "a2", "a3", "a4", "a5"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "google-free" })))
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })
})

describe("TranslationService with an LLM", () => {
  const useOpenAI = (s: Settings) => {
    s.tiers.ai = "openai"
    s.providers.openai.apiKey = "sk-test"
  }

  it("loads the AI SDK module on first use and sends one request per batch", async () => {
    const fetchFn = vi.fn(async () => chatCompletion(JSON.stringify(["你好", "再见"])))
    const { service } = setup(useOpenAI, { fetchFn: asFetch(fetchFn) })
    const out = await Promise.all(["Hello", "Goodbye"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(out).toEqual(["你好", "再见"])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("sends one LLM call per batch", async () => {
    const llm: Partial<LlmImpl> = {
      batch: vi.fn(async (segs: Segment[]) => segs.map((g) => `ZH(${g.text})`)),
      single: vi.fn(async (g: Segment) => `ZH(${g.text})`),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup(useOpenAI, { llm })
    const out = await Promise.all(["a", "b", "c", "d"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(out).toEqual(["ZH(a)", "ZH(b)", "ZH(c)", "ZH(d)"])
    expect(llm.batch).toHaveBeenCalledTimes(1)
    expect(llm.single).not.toHaveBeenCalled()
  })

  it("falls back to one call per paragraph when the batch answer cannot be parsed", async () => {
    const llm: Partial<LlmImpl> = {
      batch: vi.fn(async () => {
        throw new BatchParseError("count mismatch")
      }),
      single: vi.fn(async (g: Segment) => `ZH(${g.text})`),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup(useOpenAI, { llm })
    const out = await Promise.all(["a", "b", "c"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(out).toEqual(["ZH(a)", "ZH(b)", "ZH(c)"])
    expect(llm.batch).toHaveBeenCalledTimes(1)
    expect(llm.single).toHaveBeenCalledTimes(3)
  })

  it("does not fall back on authentication errors", async () => {
    const llm: Partial<LlmImpl> = {
      batch: vi.fn(async () => {
        throw Object.assign(new Error("Incorrect API key"), { statusCode: 401, isRetryable: false })
      }),
      single: vi.fn(async (g: Segment) => g.text),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup(useOpenAI, { llm })
    const results = await Promise.allSettled(["a", "b"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(results.every((r) => r.status === "rejected" && /Incorrect API key/.test(String(r.reason)))).toBe(true)
    expect(llm.single).not.toHaveBeenCalled()
  })

  it("translates one paragraph per call when LLM batching is disabled", async () => {
    const llm: Partial<LlmImpl> = {
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
    await Promise.all(["a", "b", "c"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "openai" })))
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
    const out = await Promise.all(["Good morning", "Good night", "Thanks"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "openai" })))
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
    const out = await Promise.all(["Good morning", "Good night"].map((t) => translateOne(service, { text: t, targetLang: "zh-CN", providerId: "openai" })))
    expect(out).toEqual(["早上好", "晚安"])
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })
})

describe("TranslationService: tiers, caps and precise mode details", () => {
  const googleEcho = () =>
    vi.fn(async (_url: string, init: RequestInit) => jsonResponse(new URLSearchParams(String(init.body)).getAll("q").map((q) => [`G(${q})`, "en"])))
  const page = (tiers: Tier[]): TranslateRequest => ({ text: "Hello", sourceLang: "auto", targetLang: "zh-CN", tiers })

  it("reports an unknown service per tier and asks nothing when no tier is requested", async () => {
    const { service } = setup((s) => (s.tiers.ai = "no-such-service"), { fetchFn: googleEcho() })
    const reports: [Tier, TranslateResponse][] = []
    await service.translateForPage(page(["machine", "ai"]), (tier, result) => reports.push([tier, result]))
    expect(reports).toEqual([
      ["ai", { ok: false, error: ENGLISH.t("errUnknownProvider", ["no-such-service"]) }],
      ["machine", { ok: true, text: "G(Hello)" }],
    ])
    reports.length = 0
    await service.translateForPage(page(["dictionary"]), (tier, result) => reports.push([tier, result]))
    expect(reports).toEqual([])
  })

  it.each([
    // [service, paragraphs, characters each, user cap on items, requests]
    ["google-free", 150, 10, 500, 2],
    ["google-free", 10, 1200, 500, 3],
    ["microsoft-free", 101, 10, 500, 2],
    ["google-free", 6, 10, 4, 2],
  ])("caps %s: %i paragraphs of %i characters, user cap %i items → %i requests", async (id, n, chars, maxItems, requests) => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("microsoft")) return jsonResponse((JSON.parse(String(init.body)) as string[]).map((text) => ({ translations: [{ text }] })))
      return jsonResponse(new URLSearchParams(String(init.body)).getAll("q").map((q) => [q, "en"]))
    })
    const { service } = setup((s) => {
      s.batch.maxItemsPerBatch = maxItems
      s.batch.maxCharsPerBatch = 100_000
    }, { fetchFn })
    const texts = Array.from({ length: n }, (_, i) => String(i).padStart(chars, "x"))
    expect(await Promise.all(texts.map((text) => translateOne(service, { text, targetLang: "zh-CN", providerId: id })))).toEqual(texts)
    expect(fetchFn).toHaveBeenCalledTimes(requests)
  })

  it("sends DeepLX one request per paragraph", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => jsonResponse({ code: 200, data: `D(${JSON.parse(String(init.body)).text})` }))
    const { service } = setup((s) => (s.providers.deeplx.baseURL = "https://deeplx.example/translate"), { fetchFn })
    const out = await Promise.all(["a", "b", "c"].map((text) => translateOne(service, { text, targetLang: "zh-CN", providerId: "deeplx" })))
    expect(out).toEqual(["D(a)", "D(b)", "D(c)"])
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("falls back to one call per paragraph when the batch answer has the wrong length", async () => {
    const llm: Partial<LlmImpl> = {
      batch: vi.fn(async (segs: Segment[]) => segs.slice(1).map((g) => g.text)),
      single: vi.fn(async (g: Segment) => `ZH(${g.text})`),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup((s) => {
      s.tiers.ai = "openai"
      s.providers.openai.apiKey = "sk"
    }, { llm })
    expect(await Promise.all(["a", "b"].map((text) => translateOne(service, { text, targetLang: "zh-CN", providerId: "openai" })))).toEqual(["ZH(a)", "ZH(b)"])
    expect(llm.single).toHaveBeenCalledTimes(2)
  })

  describe("precise mode", () => {
    const precise = (s: Settings) => {
      s.tiers.ai = "openai"
      s.providers.openai.apiKey = "sk"
      s.precise.enabled = true
      s.batch.maxCharsPerBatch = 30
    }
    const ANALYSIS = { summary: "A note.", glossary: [], tone: "" }
    const fakeLlm = (analysis: typeof ANALYSIS | null) => {
      const prefixes: (string | undefined)[] = []
      const answer = (g: Segment, opts: LlmCallOptions) => {
        prefixes.push(opts.contextPrefix)
        return `AI(${g.text})`
      }
      const llm = {
        batch: vi.fn(async (segs: Segment[], opts: LlmCallOptions) => segs.map((g) => answer(g, opts))),
        single: vi.fn(async (g: Segment, opts: LlmCallOptions) => answer(g, opts)),
        analyze: vi.fn(async () => analysis),
      }
      return { llm, prefixes }
    }
    const translateMail = async (service: TranslationService, paragraphs: string[], targets = paragraphs.map((_, i) => i)) => {
      const context = createMailContext(paragraphs, targets)
      service.setContext(context)
      return Promise.all(targets.map((i) => translateOne(service, { text: paragraphs[i], targetLang: "zh-CN", providerId: "openai", context: { id: context.id, index: i } })))
    }
    const PARAGRAPHS = ["First paragraph of the mail.", "Second paragraph of the mail.", "Third one."]

    it("reuses a stored analysis instead of asking again", async () => {
      const storage = memoryStorage()
      const first = fakeLlm(ANALYSIS)
      await translateMail(setup(precise, { llm: first.llm, cache: new PersistentCache(storage, 100, 0) }).service, PARAGRAPHS)
      expect(first.llm.analyze).toHaveBeenCalledTimes(1)
      // A new background script over the same storage, with the analysis kept and the translations gone.
      await until(() => expect(storage.data.get(CACHE_STORAGE_KEY)).toHaveLength(PARAGRAPHS.length + 1))
      const entries = storage.data.get(CACHE_STORAGE_KEY) as [string, string][]
      storage.data.set(CACHE_STORAGE_KEY, entries.filter(([key]) => key.includes(":analysis|")))
      const second = fakeLlm(ANALYSIS)
      await translateMail(setup(precise, { llm: second.llm, cache: new PersistentCache(storage, 100, 0) }).service, PARAGRAPHS)
      expect(second.llm.analyze).not.toHaveBeenCalled()
      expect(second.prefixes.length).toBeGreaterThan(0)
      expect(second.prefixes.every((p) => p?.includes("Summary: A note."))).toBe(true)
    })

    it("does not store an unusable analysis, and leaves a long message out of the prefix", async () => {
      const paragraphs = ["x".repeat(MAX_PREFIX_TEXT_CHARS), "Short one, but not that short.", "Another short one."]
      const { llm, prefixes } = fakeLlm(null)
      const { service, cache } = setup(precise, { llm })
      await translateMail(service, paragraphs, [1, 2])
      expect(llm.analyze).toHaveBeenCalledTimes(1)
      expect(await cache.size()).toBe(2)
      expect(new Set(prefixes)).toEqual(new Set([""]))
    })

    it("counts targets outside the message as empty", async () => {
      const { llm } = fakeLlm(null)
      const { service } = setup((s) => {
        precise(s)
        s.batch.maxItemsPerBatch = 2
      }, { llm })
      const context = createMailContext(["Hello"], [0, 5])
      service.setContext(context)
      expect(await translateOne(service, { text: "Hello", targetLang: "zh-CN", providerId: "openai", context: { id: context.id, index: 0 } })).toBe("AI(Hello)")
      expect(llm.analyze).not.toHaveBeenCalled()
    })

    it("analyses a retranslated message again, once for all its requests, and keeps the analysis of another message", async () => {
      const storage = memoryStorage()
      const OTHER = ["Another mail, first part here.", "Another mail, second part."]
      const first = fakeLlm(ANALYSIS)
      let round = 0
      first.llm.analyze.mockImplementation(async () => ({ summary: `Round ${++round}.`, glossary: [], tone: "" }))
      const { service } = setup(precise, { llm: first.llm, cache: new PersistentCache(storage, 100, 0) })
      await translateMail(service, PARAGRAPHS)
      await translateMail(service, OTHER)
      expect(first.llm.analyze).toHaveBeenCalledTimes(2)

      // Retranslation of the first message: registered as fresh, every paragraph past the cache.
      const context = createMailContext(PARAGRAPHS, [0, 1, 2])
      service.setContext(context, true)
      first.prefixes.length = 0
      const again = PARAGRAPHS.map((text, index) => translateOne(service, { text, targetLang: "zh-CN", providerId: "openai", context: { id: context.id, index }, bypassCache: true }))
      expect(await Promise.all(again)).toEqual(PARAGRAPHS.map((text) => `AI(${text})`))
      expect(first.llm.analyze).toHaveBeenCalledTimes(3)
      expect(first.prefixes).toHaveLength(PARAGRAPHS.length)
      expect(first.prefixes.every((prefix) => prefix?.includes("Summary: Round 3."))).toBe(true)

      // A new background script over the same storage, translations gone: the stored analyses are the new one and the other message's.
      await until(() => expect(storage.data.get(CACHE_STORAGE_KEY)).toHaveLength(PARAGRAPHS.length + OTHER.length + 2))
      const entries = storage.data.get(CACHE_STORAGE_KEY) as [string, string][]
      storage.data.set(CACHE_STORAGE_KEY, entries.filter(([key]) => key.includes(":analysis|")))
      const second = fakeLlm(ANALYSIS)
      const later = setup(precise, { llm: second.llm, cache: new PersistentCache(storage, 100, 0) }).service
      await translateMail(later, PARAGRAPHS)
      expect(second.prefixes.every((prefix) => prefix?.includes("Summary: Round 3."))).toBe(true)
      second.prefixes.length = 0
      await translateMail(later, OTHER)
      expect(second.prefixes.every((prefix) => prefix?.includes("Summary: Round 2."))).toBe(true)
      expect(second.llm.analyze).not.toHaveBeenCalled()
    })

    it("M2: keeps the analysis of a retranslation in the cache when the older analysis answers later", async () => {
      const { llm, prefixes } = fakeLlm(ANALYSIS)
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      let round = 0
      llm.analyze.mockImplementation(async () => {
        const n = ++round
        if (n === 1) await gate
        return { summary: `Round ${n}.`, glossary: [], tone: "" }
      })
      const { service, cache } = setup(precise, { llm })
      const set = vi.spyOn(cache, "set")
      const first = translateMail(service, PARAGRAPHS)
      await until(() => expect(llm.analyze).toHaveBeenCalledTimes(1))
      const context = createMailContext(PARAGRAPHS, [0, 1, 2])
      service.setContext(context, true)
      await Promise.all(PARAGRAPHS.map((text, index) => translateOne(service, { text, targetLang: "zh-CN", providerId: "openai", context: { id: context.id, index }, bypassCache: true })))
      release()
      await first
      expect(prefixes.some((prefix) => prefix?.includes("Summary: Round 1."))).toBe(true)
      const stored = set.mock.calls.filter(([key]) => key.includes(":analysis|")).map(([, value]) => JSON.parse(value).summary)
      expect(stored).toEqual(["Round 2."])
    })

    it("sends the message context in the system message, without Anthropic's cache mark to other services", async () => {
      const bodies: { messages: { role: string; content: unknown }[] }[] = []
      const isAnalysis = (system: unknown) => String(system).startsWith("You prepare the translation")
      const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        bodies.push(body)
        return chatCompletion(isAnalysis(body.messages[0].content) ? JSON.stringify(ANALYSIS) : "译文")
      })
      const { service } = setup(precise, { fetchFn, llm: { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail } })
      await translateMail(service, PARAGRAPHS)
      const translations = bodies.filter((b) => !isAnalysis(b.messages[0].content))
      expect(translations.length).toBeGreaterThan(1)
      for (const b of translations) {
        expect(b.messages.filter((m) => m.role === "system")).toHaveLength(1)
        expect(b.messages[0].content).toContain("Summary: A note.")
        expect(JSON.stringify(b)).not.toContain("cache_control")
      }
    })
  })
})

describe("retranslation (bypassCache)", () => {
  /** Google stand-in whose answers name the request they came in: R1(…), R2(…). */
  const rounds = (gate?: Promise<void>) => {
    let n = 0
    return vi.fn(async (_url: string, init: RequestInit) => {
      const round = ++n
      if (round === 1 && gate) await gate
      return jsonResponse(new URLSearchParams(String(init.body)).getAll("q").map((q) => [`R${round}(${q})`, "en"]))
    })
  }
  const google = (text: string, bypassCache?: boolean) => ({ text, targetLang: "zh-CN", providerId: "google-free", ...(bypassCache ? { bypassCache } : {}) })

  it("reads no cache, translates anew and replaces the cached result; other paragraphs keep theirs", async () => {
    const fetchFn = rounds()
    const { service, cache } = setup(() => {}, { fetchFn })
    expect(await translateOne(service, google("One"))).toBe("R1(One)")
    expect(await translateOne(service, google("Two"))).toBe("R2(Two)")
    const get = vi.spyOn(cache, "get")
    expect(await translateOne(service, google("One", true))).toBe("R3(One)")
    expect(get).not.toHaveBeenCalled()
    get.mockRestore()
    expect(await translateOne(service, google("One"))).toBe("R3(One)")
    expect(await translateOne(service, google("Two"))).toBe("R2(Two)")
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("does not wait for a running request of the same paragraph", async () => {
    let release!: () => void
    const fetchFn = rounds(new Promise<void>((resolve) => (release = resolve)))
    const { service } = setup(() => {}, { fetchFn })
    const running = translateOne(service, google("Same"))
    await until(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    expect(await translateOne(service, google("Same", true))).toBe("R2(Same)")
    release()
    expect(await running).toBe("R1(Same)")
  })

  it("M2: keeps the retranslation in the cache when the older request answers later", async () => {
    let release!: () => void
    const fetchFn = rounds(new Promise<void>((resolve) => (release = resolve)))
    const { service } = setup(() => {}, { fetchFn })
    const running = translateOne(service, google("Same"))
    await until(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    expect(await translateOne(service, google("Same", true))).toBe("R2(Same)")
    release()
    expect(await running).toBe("R1(Same)")
    expect(await translateOne(service, google("Same"))).toBe("R2(Same)")
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it("M2: lets a request during a retranslation share its result", async () => {
    let release!: () => void
    const fetchFn = rounds(new Promise<void>((resolve) => (release = resolve)))
    const { service } = setup(() => {}, { fetchFn })
    const fresh = translateOne(service, google("Same", true))
    await until(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    const plain = translateOne(service, google("Same"))
    release()
    expect(await Promise.all([fresh, plain])).toEqual(["R1(Same)", "R1(Same)"])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("asks every tier again when the highest tier's result is cached", async () => {
    let n = 0
    const llm: Partial<LlmImpl> = {
      batch: vi.fn(async (segs: Segment[]) => segs.map((g) => `AI${++n}(${g.text})`)),
      single: vi.fn(async (g: Segment) => `AI${++n}(${g.text})`),
      analyze: vi.fn(async () => null),
    }
    const { service } = setup((s) => {
      s.tiers.machine = "google-free"
      s.tiers.ai = "openai"
      s.providers.openai.apiKey = "sk"
    }, { fetchFn: rounds(), llm })
    const ask = async (bypassCache?: boolean) => {
      const reports: [Tier, TranslateResponse][] = []
      const req: TranslateRequest = { text: "Hello", sourceLang: "auto", targetLang: "zh-CN", tiers: ["machine", "ai"], ...(bypassCache ? { bypassCache } : {}) }
      await service.translateForPage(req, (tier, result) => reports.push([tier, result]))
      return Object.fromEntries(reports)
    }
    expect(await ask()).toEqual({ machine: { ok: true, text: "R1(Hello)" }, ai: { ok: true, text: "AI1(Hello)" } })
    expect(await ask()).toEqual({ ai: { ok: true, text: "AI1(Hello)" } })
    expect(await ask(true)).toEqual({ machine: { ok: true, text: "R2(Hello)" }, ai: { ok: true, text: "AI2(Hello)" } })
    expect(await ask()).toEqual({ ai: { ok: true, text: "AI2(Hello)" } })
  })
})

describe("errorContext", () => {
  const provider = (id: string, over: Partial<ResolvedProvider> = {}): ResolvedProvider => ({
    id,
    apiKey: "",
    baseURL: "https://x.example",
    model: "m",
    temperature: null,
    thinking: false,
    mode: "free",
    region: "",
    appId: "",
    edition: "standard",
    deepl: DEFAULT_DEEPL,
    ...over,
  })

  it.each([
    ["an unknown service", provider("nope"), { baseURL: "https://x.example" }],
    ["an AI service", provider("deepseek"), { service: "DeepSeek", kind: "llm", baseURL: "https://x.example", model: "m", keyMode: false }],
    ["Microsoft, free", provider("microsoft-free"), { service: "Microsoft Translator", kind: "microsoft", baseURL: undefined, model: undefined, keyMode: false }],
    ["Microsoft, key", provider("microsoft-free", { mode: "key" }), { service: "Microsoft Translator", kind: "microsoft", baseURL: "https://x.example", keyMode: true }],
  ])("describes %s", (_name, p, expected) => {
    expect(errorContext(p)).toMatchObject(expected)
  })
})

describe("host permissions", () => {
  it("send nothing to an endpoint the extension may not connect to, and say which host and what to do", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => jsonResponse({ code: 200, data: `D(${JSON.parse(String(init.body)).text})` }))
    const allowed = new Set<string>()
    const hasOrigin = vi.fn(async (origin: string) => allowed.has(origin))
    const settings = createDefaultSettings()
    settings.providers.deeplx.baseURL = "https://deeplx.example/translate"
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn), hasOrigin })
    const error = ENGLISH.t("errHostPermission", ["deeplx.example"])
    await expect(translateOne(service, { text: "a", providerId: "deeplx" })).rejects.toThrow(error)
    await expect(service.testProvider("deeplx", settings.providers.deeplx, "zh-CN")).rejects.toThrow(error)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(hasOrigin).toHaveBeenCalledWith("https://deeplx.example/*")
    allowed.add("https://deeplx.example/*")
    expect(await translateOne(service, { text: "a", providerId: "deeplx" })).toBe("D(a)")
    // A failed check counts as no permission; the offline services need none.
    hasOrigin.mockRejectedValueOnce(new Error("gone"))
    await expect(translateOne(service, { text: "b", providerId: "deeplx" })).rejects.toThrow(error)
    hasOrigin.mockClear()
    await translateOne(service, { text: "c", providerId: "dictionary" }).catch(() => {})
    expect(hasOrigin).not.toHaveBeenCalled()
  })
})
