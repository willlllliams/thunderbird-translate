/**
 * The translation pipeline on its production path, translateForPage(): tiers
 * running side by side, timeouts, failures of single paragraphs, mixed
 * languages in one batch and paragraphs longer than a batch.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

const offline = vi.hoisted(() => ({
  translate: vi.fn(async (texts: string[], src: string, tgt: string) => texts.map((t) => `[${src}>${tgt}]${t}`)),
  models: "de>en@1",
  signature: vi.fn(async (): Promise<string> => offline.models),
}))
vi.mock("../src/offline/bergamot", async (importOriginal) => ({ ...(await importOriginal<object>()), getBergamot: () => offline }))

import type { LlmImpl, TranslationService } from "../src/background/service"
import { type LlmCallOptions, llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle } from "../src/background/translators/llm"
import type { Segment } from "../src/background/translators/llm-prompt"
import { LocalizedError, MissingDataError, TimeoutError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { createMailContext } from "../src/shared/mail-context"
import type { TranslateRequest, TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings, type Settings } from "../src/shared/settings"
import { asFetch, chatCompletion, createService, fakeDictionary, jsonResponse, translateOne, useFakeTimers } from "./helpers"

/** The texts of the q parameters of a Google request. */
const queries = (init?: RequestInit) => new URLSearchParams(String(init?.body)).getAll("q")

/** Google endpoint answering G(<text>) for every q of the batch. */
const echo = async (_url: string | URL | Request, init?: RequestInit) => jsonResponse(queries(init).map((q) => [`G(${q})`, "en"]))
const googleEcho = () => vi.fn(echo)

/** The texts sent to Google, piece by piece. */
const sent = (fetchFn: ReturnType<typeof googleEcho>) => fetchFn.mock.calls.flatMap(([, init]) => queries(init))

/** The AI SDK on the fetch of the service, instead of a stand-in. */
const sdkLlm: LlmImpl = { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail }

/** A fetch that never answers; it fails only when its signal is aborted. */
const hanging = () =>
  vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
  )

const page = (text: string, tiers: Tier[], extra: Partial<TranslateRequest> = {}): TranslateRequest => ({ text, sourceLang: "auto", targetLang: "zh-CN", tiers, ...extra })

/** translateForPage for several paragraphs at once; `reports` fills as the tiers answer. */
function translateAll(service: TranslationService, texts: string[], tiers: Tier[]) {
  const reports: { text: string; tier: Tier; result: TranslateResponse }[] = []
  const done = Promise.all(texts.map((text) => service.translateForPage(page(text, tiers), (tier, result) => reports.push({ text, tier, result }))))
  return { reports, done, of: (tier: Tier) => reports.filter((r) => r.tier === tier) }
}

function setup(over: (s: Settings) => void, deps: Parameters<typeof createService>[1] = {}) {
  const settings = createDefaultSettings()
  over(settings)
  return createService(settings, deps)
}

const withOpenAI = (s: Settings) => {
  s.tiers.ai = "openai"
  s.providers.openai.apiKey = "sk-test"
}

describe("tiers side by side", () => {
  it("delivers the machine and dictionary tiers while every AI request hangs: each service has its own request queue", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const llm: LlmImpl = {
      batch: vi.fn(async (segments: Segment[]) => segments.map((s) => `AI(${s.text})`)),
      single: vi.fn(async (segment: Segment) => {
        await gate
        return `AI(${segment.text})`
      }),
      analyze: vi.fn(async () => null),
    }
    const dictionary = fakeDictionary()
    const { service } = setup(
      (s) => {
        withOpenAI(s)
        s.tiers.dictionary = "dictionary"
        s.batch.llmBatchEnabled = false
        s.batch.concurrency = 4
      },
      { llm, dictionary, fetchFn: asFetch(googleEcho()) },
    )
    const texts = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}`)
    const { done, of } = translateAll(service, texts, ["dictionary", "machine", "ai"])
    await vi.waitFor(() => expect([of("dictionary").length, of("machine").length]).toEqual([20, 20]))
    expect(of("machine").every((r) => r.result.ok)).toBe(true)
    expect(of("ai")).toHaveLength(0)
    // The AI tier keeps its own limit of four requests at a time.
    expect(llm.single).toHaveBeenCalledTimes(4)
    release()
    await done
    expect(of("ai").map((r) => r.result)).toEqual(texts.map((t) => ({ ok: true, text: `AI(${t})` })))
  })

  it("fails only the dictionary paragraph that cannot be translated", async () => {
    const dictionary = {
      translate: vi.fn(async (texts: string[]) =>
        texts.map((t): PromiseSettledResult<string> => (t === "Bonjour" ? { status: "rejected", reason: new LocalizedError("errDictionaryMissing", ["fr → zh-Hans"]) } : { status: "fulfilled", value: `D(${t})` })),
      ),
      signature: vi.fn(async () => "packs"),
    }
    const { service } = setup((s) => (s.tiers.dictionary = "dictionary"), { dictionary })
    const { done, of } = translateAll(service, ["Hello", "Bonjour", "World"], ["dictionary"])
    await done
    expect(dictionary.translate).toHaveBeenCalledTimes(1)
    expect(Object.fromEntries(of("dictionary").map((r) => [r.text, r.result]))).toEqual({
      Hello: { ok: true, text: "D(Hello)" },
      Bonjour: { ok: false, error: ENGLISH.t("errDictionaryMissing", ["fr → zh-Hans"]) },
      World: { ok: true, text: "D(World)" },
    })
  })

  it("passes on what a paragraph lacks, also for a paragraph long enough to go in pieces; other failures carry nothing", async () => {
    const missing = { service: "dictionary" as const, pair: "fr>zh-Hans", models: ["en>zh-Hans"] }
    const dictionary = {
      translate: vi.fn(async (texts: string[]) =>
        texts.map((t): PromiseSettledResult<string> => ({
          status: "rejected",
          reason: t.startsWith("Bonjour") ? new MissingDataError("errDictionaryMissing", ["fr → zh-Hans"], missing, "hintDictionaryDownload") : new LocalizedError("errDictionaryUnsupported", ["it"]),
        })),
      ),
      signature: vi.fn(async () => "packs"),
    }
    const { service } = setup((s) => (s.tiers.dictionary = "dictionary"), { dictionary })
    const long = `Bonjour ${"et merci. ".repeat(6000)}`
    const { done, of } = translateAll(service, ["Bonjour", long, "Ciao"], ["dictionary"])
    await done
    const results = new Map(of("dictionary").map((r) => [r.text, r.result]))
    expect(results.get("Bonjour")).toMatchObject({ ok: false, missing })
    expect(results.get(long)).toMatchObject({ ok: false, missing })
    expect(results.get("Ciao")).toEqual({ ok: false, error: ENGLISH.t("errDictionaryUnsupported", ["it"]) })
  })

  it("translates a batch of mixed languages offline language by language, in the original order", async () => {
    offline.translate.mockClear()
    const { service } = setup((s) => (s.tiers.machine = "bergamot"))
    const texts = ["こんにちは、元気ですか", "Thank you for the report, see you on Friday", "ありがとうございます、また明日"]
    const { done, of } = translateAll(service, texts, ["machine"])
    await done
    expect(Object.fromEntries(of("machine").map((r) => [r.text, r.result]))).toEqual({
      [texts[0]]: { ok: true, text: `[ja>zh-CN]${texts[0]}` },
      [texts[1]]: { ok: true, text: `[en>zh-CN]${texts[1]}` },
      [texts[2]]: { ok: true, text: `[ja>zh-CN]${texts[2]}` },
    })
    expect(offline.translate.mock.calls.map(([batch, src]) => [batch, src])).toEqual([
      [[texts[0], texts[2]], "ja"],
      [[texts[1]], "en"],
    ])
  })
})

describe("installed offline models", () => {
  it("L3: are part of the cache key: another model version translates again", async () => {
    offline.translate.mockClear()
    const { service } = setup((s) => (s.tiers.machine = "bergamot"))
    const ask = () => translateOne(service, { text: "Guten Morgen", sourceLang: "de", targetLang: "en", providerId: "bergamot" })
    await ask()
    await ask()
    expect(offline.translate).toHaveBeenCalledTimes(1)
    offline.models = "de>en@2"
    await ask()
    expect(offline.translate).toHaveBeenCalledTimes(2)
  })
})

describe("request timeout", () => {
  afterEach(() => vi.useRealTimers())

  /** The result of `request` once `ms` of simulated time have passed; it must be settled by then. */
  async function after<T>(ms: number, request: Promise<T>): Promise<T> {
    let settled = false
    const result = request.finally(() => (settled = true))
    // Handled while the clock moves; the caller still awaits (and asserts on) `result`.
    result.catch(() => {})
    await vi.advanceTimersByTimeAsync(ms)
    expect(settled).toBe(true)
    return result
  }

  /** The batch window of createService(). */
  const WINDOW_MS = 5

  it("ends a request without an answer with a timeout error, retries it, and asks again next time", async () => {
    useFakeTimers()
    const fetchFn = hanging()
    const { service } = setup((s) => {
      s.batch.timeoutSeconds = 0.5
      s.batch.maxRetries = 1
    }, { fetchFn: asFetch(fetchFn) })
    const error = await after(WINDOW_MS + 2 * 500, translateOne(service, { text: "Hello", providerId: "google-free" }).catch((e: Error) => e.message))
    expect(error).toContain(ENGLISH.t("errTimeout", ["Google", "1"]))
    expect(error).toContain(ENGLISH.t("hintTimeout"))
    expect(fetchFn).toHaveBeenCalledTimes(2)
    // Nothing stays pending: the next request goes out again and can succeed.
    fetchFn.mockImplementationOnce(echo)
    expect(await after(WINDOW_MS, translateOne(service, { text: "Hello", providerId: "google-free" }))).toBe("G(Hello)")
  })

  it.each([0, 3])("H1: applies to AI requests through the AI SDK and sends a timed-out one only once (%i retries)", async (maxRetries) => {
    useFakeTimers()
    const fetchFn = hanging()
    const { service } = setup(
      (s) => {
        withOpenAI(s)
        s.batch.timeoutSeconds = 0.5
        s.batch.maxRetries = maxRetries
      },
      { fetchFn: asFetch(fetchFn), llm: sdkLlm },
    )
    const error = await after(WINDOW_MS + 500, translateOne(service, { text: "Hello", providerId: "openai" }).catch((e: Error) => e.message))
    expect(error).toContain(ENGLISH.t("errTimeout", ["OpenAI", "1"]))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("H1: retries a timed-out machine translation request once and names the whole wait in the error", async () => {
    useFakeTimers()
    const fetchFn = hanging()
    const { service } = setup((s) => {
      s.batch.timeoutSeconds = 1
      s.batch.maxRetries = 3
    }, { fetchFn: asFetch(fetchFn) })
    const error = await after(WINDOW_MS + 2 * 1000, translateOne(service, { text: "Hello", providerId: "google-free" }).catch((e: Error) => e.message))
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(error).toContain(ENGLISH.t("errTimeout", ["Google", "2"]))
  })

  it("H1: does not retry a timed-out connection test or message analysis", async () => {
    useFakeTimers()
    // Fails once every batch of the message has asked for the analysis.
    const timeout = () => new Promise<never>((_, reject) => setTimeout(() => reject(new TimeoutError("OpenAI", 60_000)), 30))
    const llm: LlmImpl = { batch: vi.fn(timeout), single: vi.fn(timeout), analyze: vi.fn(timeout) }
    const { service } = setup((s) => {
      withOpenAI(s)
      s.precise.enabled = true
      s.batch.maxCharsPerBatch = 30
      s.batch.maxRetries = 3
    }, { llm })
    await expect(after(30, service.testProvider("openai", { apiKey: "sk-test", baseURL: "", model: "" }, "zh-CN"))).rejects.toThrow(ENGLISH.t("errTimeout", ["OpenAI", "60"]))
    expect(llm.single).toHaveBeenCalledTimes(1)
    const paragraphs = ["First paragraph of the mail.", "Second paragraph of the mail."]
    const context = createMailContext(paragraphs, [0, 1])
    service.setContext(context)
    const translations = Promise.all(paragraphs.map((text, index) => translateOne(service, { text, providerId: "openai", context: { id: context.id, index } }).catch(() => "")))
    await vi.runAllTimersAsync()
    await translations
    expect(llm.analyze).toHaveBeenCalledTimes(1)
  })

  it("H1: gives local models and thinking models three times the request timeout", async () => {
    const timeouts: Record<string, number | undefined> = {}
    const llm: LlmImpl = {
      batch: vi.fn(),
      single: vi.fn(async (segment: Segment, opts: LlmCallOptions) => {
        timeouts[segment.text] = opts.timeoutMs
        return "AI"
      }),
      analyze: vi.fn(async () => null),
    }
    const { service, settings } = setup(withOpenAI, { llm })
    await translateOne(service, { text: "openai", providerId: "openai" })
    settings.providers.openai.thinking = true
    await translateOne(service, { text: "openai thinking", providerId: "openai" })
    await translateOne(service, { text: "ollama", providerId: "ollama" })
    await translateOne(service, { text: "lmstudio", providerId: "lmstudio" })
    expect(timeouts).toEqual({ openai: 60_000, "openai thinking": 180_000, ollama: 180_000, lmstudio: 180_000 })
  })
})

describe("merged AI answers", () => {
  it("asks paragraph by paragraph when a merged answer leaves a paragraph empty, and accepts an empty answer for text without letters", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const prompt = JSON.stringify(JSON.parse(String(init?.body)).messages)
      if (prompt.includes("segments")) return chatCompletion(prompt.includes("Good night") ? '["", "晚安"]' : '["", "早上好"]')
      return chatCompletion("你好")
    })
    const { service } = setup(withOpenAI, { fetchFn: asFetch(fetchFn), llm: sdkLlm })
    const out = await Promise.all(["Hello", "Good night"].map((text) => translateOne(service, { text, providerId: "openai" })))
    expect(out).toEqual(["你好", "你好"])
    expect(fetchFn).toHaveBeenCalledTimes(3)
    const kept = await Promise.all(["— —", "Good morning"].map((text) => translateOne(service, { text, providerId: "openai" })).map((p) => p.catch((e: Error) => e.message)))
    expect(kept[1]).toBe("早上好")
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })
})

describe("paragraphs longer than a batch", () => {
  it("are translated in sentence pieces within the limit, joined in order and cached as a whole", async () => {
    const fetchFn = googleEcho()
    const { service } = setup((s) => (s.batch.maxCharsPerBatch = 200), { fetchFn: asFetch(fetchFn) })
    const sentences = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} of a very long paragraph that goes on.`)
    const text = sentences.join(" ")
    const out = await translateOne(service, { text, providerId: "google-free", targetLang: "en" })
    const pieces = sent(fetchFn)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.every((p) => p.length <= 200)).toBe(true)
    expect(pieces.join(" ")).toBe(text)
    expect(out).toBe(pieces.map((p) => `G(${p})`).join(" "))
    const requests = fetchFn.mock.calls.length
    expect(await translateOne(service, { text, providerId: "google-free", targetLang: "en" })).toBe(out)
    expect(fetchFn).toHaveBeenCalledTimes(requests)
  })

  it("M1: send a long quoted block in a few pieces of many lines, not line by line", async () => {
    const fetchFn = googleEcho()
    const { service } = setup(() => {}, { fetchFn: asFetch(fetchFn) })
    const text = Array.from({ length: 60 }, (_, i) => `> Line ${i} of the quoted reply, kept exactly as it was written there.`).join("\n")
    expect(text.length).toBeGreaterThan(3000)
    const out = await translateOne(service, { text, providerId: "google-free", targetLang: "en" })
    const pieces = sent(fetchFn)
    expect(pieces).toHaveLength(2)
    expect(pieces.every((p) => p.length <= 3000 && p.includes("\n"))).toBe(true)
    expect(pieces.join("\n")).toBe(text)
    expect(out).toBe(pieces.map((p) => `G(${p})`).join("\n"))
  })

  it("L5: send no empty piece for a long paragraph that starts with a line break, and keep the line break", async () => {
    const fetchFn = googleEcho()
    const { service } = setup((s) => (s.batch.maxCharsPerBatch = 200), { fetchFn: asFetch(fetchFn) })
    const text = `\n${"A sentence that is long enough to need a piece of its own, more or less. ".repeat(4).trim()}`
    const out = await translateOne(service, { text, providerId: "google-free", targetLang: "en" })
    const pieces = sent(fetchFn)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.every((p) => p.trim().length > 0)).toBe(true)
    expect(out.startsWith("\nG(")).toBe(true)
  })

  it("are joined without spaces for Chinese, and keep their line breaks", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => jsonResponse(queries(init).map((q, i) => [`句${q.length}-${i}。`, "en"])))
    const { service } = setup((s) => (s.batch.maxCharsPerBatch = 200), { fetchFn: asFetch(fetchFn) })
    const line = "A sentence that is long enough to need a piece of its own, more or less. ".repeat(3).trim()
    const out = await translateOne(service, { text: `${line}\n${line}`, providerId: "google-free" })
    expect(out).not.toContain(" ")
    expect(out.split("\n")).toHaveLength(2)
  })
})
