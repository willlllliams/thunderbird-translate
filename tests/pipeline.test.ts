/**
 * The translation pipeline on its production path, translateForPage(): tiers
 * running side by side, timeouts, failures of single paragraphs, mixed
 * languages in one batch and paragraphs longer than a batch.
 */
import { describe, expect, it, vi } from "vitest"

const offline = vi.hoisted(() => ({
  translate: vi.fn(async (texts: string[], src: string, tgt: string) => texts.map((t) => `[${src}>${tgt}]${t}`)),
}))
vi.mock("../src/offline/bergamot", async (importOriginal) => ({ ...(await importOriginal<object>()), getBergamot: () => offline }))

import type { LlmImpl, TranslationService } from "../src/background/service"
import { llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle } from "../src/background/translators/llm"
import type { Segment } from "../src/background/translators/llm-prompt"
import { LocalizedError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import type { TranslateRequest, TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings, type Settings } from "../src/shared/settings"
import { asFetch, chatCompletion, createService, jsonResponse, translateOne } from "./helpers"

/** Google endpoint answering G(<text>) for every q of the batch. */
const googleEcho = () => vi.fn(async (_url: string, init: RequestInit) => jsonResponse(new URLSearchParams(String(init.body)).getAll("q").map((q) => [`G(${q})`, "en"])))

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
    const dictionary = {
      translate: vi.fn(async (texts: string[]) => texts.map((t): PromiseSettledResult<string> => ({ status: "fulfilled", value: `D(${t})` }))),
      signature: vi.fn(async () => "packs"),
    }
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

describe("request timeout", () => {
  it("ends a request without an answer with a timeout error, retries it, and asks again next time", async () => {
    const fetchFn = hanging()
    const { service } = setup((s) => {
      s.batch.timeoutSeconds = 0.5
      s.batch.maxRetries = 1
    }, { fetchFn: asFetch(fetchFn) })
    const error = await translateOne(service, { text: "Hello", providerId: "google-free" }).catch((e: Error) => e.message)
    expect(error).toContain(ENGLISH.t("errTimeout", ["Google", "1"]))
    expect(error).toContain(ENGLISH.t("hintTimeout"))
    expect(fetchFn).toHaveBeenCalledTimes(2)
    // Nothing stays pending: the next request goes out again and can succeed.
    fetchFn.mockImplementationOnce(async (_url, init) => jsonResponse(new URLSearchParams(String(init?.body)).getAll("q").map((q) => [`G(${q})`, "en"])))
    expect(await translateOne(service, { text: "Hello", providerId: "google-free" })).toBe("G(Hello)")
  })

  it("applies to AI requests through the AI SDK", async () => {
    const fetchFn = hanging()
    const { service } = setup(
      (s) => {
        withOpenAI(s)
        s.batch.timeoutSeconds = 0.5
        s.batch.maxRetries = 0
      },
      { fetchFn: asFetch(fetchFn), llm: { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail } },
    )
    const error = await translateOne(service, { text: "Hello", providerId: "openai" }).catch((e: Error) => e.message)
    expect(error).toContain(ENGLISH.t("errTimeout", ["OpenAI", "1"]))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe("merged AI answers", () => {
  it("asks paragraph by paragraph when a merged answer leaves a paragraph empty, and accepts an empty answer for text without letters", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const prompt = JSON.stringify(JSON.parse(String(init?.body)).messages)
      if (prompt.includes("segments")) return chatCompletion(prompt.includes("Good night") ? '["", "晚安"]' : '["", "早上好"]')
      return chatCompletion("你好")
    })
    const { service } = setup(withOpenAI, { fetchFn: asFetch(fetchFn), llm: { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail } })
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
    const pieces = fetchFn.mock.calls.flatMap(([, init]) => new URLSearchParams(String(init.body)).getAll("q"))
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.every((p) => p.length <= 200)).toBe(true)
    expect(pieces.join(" ")).toBe(text)
    expect(out).toBe(pieces.map((p) => `G(${p})`).join(" "))
    const requests = fetchFn.mock.calls.length
    expect(await translateOne(service, { text, providerId: "google-free", targetLang: "en" })).toBe(out)
    expect(fetchFn).toHaveBeenCalledTimes(requests)
  })

  it("are joined without spaces for Chinese, and keep their line breaks", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => jsonResponse(new URLSearchParams(String(init.body)).getAll("q").map((q, i) => [`句${q.length}-${i}。`, "en"])))
    const { service } = setup((s) => (s.batch.maxCharsPerBatch = 200), { fetchFn: asFetch(fetchFn) })
    const line = "A sentence that is long enough to need a piece of its own, more or less. ".repeat(3).trim()
    const out = await translateOne(service, { text: `${line}\n${line}`, providerId: "google-free" })
    expect(out).not.toContain(" ")
    expect(out.split("\n")).toHaveLength(2)
  })
})
