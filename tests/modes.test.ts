/** The three tiers, the prompts, the source language and precise mode in the background translation service. */
import { describe, expect, it, vi } from "vitest"
import { cacheKey } from "../src/background/cache"
import type { LlmImpl, TranslationService } from "../src/background/service"
import { type LlmCallOptions, llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle } from "../src/background/translators/llm"
import type { MailAnalysis, Segment } from "../src/background/translators/llm-prompt"
import { createMailContext } from "../src/shared/mail-context"
import type { TranslateRequest, TranslateResponse } from "../src/shared/messages"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings, type Settings } from "../src/shared/settings"
import { anthropicMessage, asFetch, createService, jsonResponse, type OneRequest, translateOne } from "./helpers"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

/** Google endpoint that answers G(<text>), optionally after a gate opens. */
function googleFetch(gate?: Promise<void>) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    await gate
    const qs = new URLSearchParams(String(init.body)).getAll("q")
    return jsonResponse(qs.map((q) => [`G(${q})`, "en"]))
  })
}

/** LLM that answers AI(<text>) after an optional gate, recording the options of every call. */
function fakeLlm(gate?: Promise<void>, analysis: MailAnalysis | null = null) {
  const calls: { segments: Segment[]; opts: LlmCallOptions }[] = []
  const llm = {
    batch: vi.fn(async (segments: Segment[], opts: LlmCallOptions) => {
      await gate
      calls.push({ segments, opts })
      return segments.map((s) => `AI(${s.text})`)
    }),
    single: vi.fn(async (segment: Segment, opts: LlmCallOptions) => {
      await gate
      calls.push({ segments: [segment], opts })
      return `AI(${segment.text})`
    }),
    analyze: vi.fn(async (_text: string, _opts: LlmCallOptions): Promise<MailAnalysis | null> => analysis),
  } satisfies LlmImpl
  return { llm, calls }
}

/** Dictionary stand-in that answers D(<text>). */
function fakeDictionary(gate?: Promise<void>) {
  return {
    translate: vi.fn(async (texts: string[], _source: string, _target: string) => {
      await gate
      return texts.map((t): PromiseSettledResult<string> => ({ status: "fulfilled", value: `D(${t})` }))
    }),
    signature: vi.fn(async () => "packs"),
  }
}

type Extra = { llm?: LlmImpl; fetchFn?: unknown; dictionary?: ReturnType<typeof fakeDictionary> }

/** OpenAI as AI tier, Google as machine tier, no dictionary. */
function setup(over: (s: Settings) => void, extra: Extra = {}) {
  const settings = createDefaultSettings()
  settings.tiers.ai = "openai"
  settings.providers.openai.apiKey = "sk-test"
  over(settings)
  return createService(settings, { ...extra, fetchFn: asFetch(extra.fetchFn) })
}

const ask = (text: string, extra: Partial<OneRequest> = {}): OneRequest => ({ text, targetLang: "zh-CN", providerId: "openai", ...extra })
const page = (text: string, tiers: Tier[] = ["dictionary", "machine", "ai"], extra: Partial<TranslateRequest> = {}): TranslateRequest => ({
  text,
  sourceLang: "auto",
  targetLang: "zh-CN",
  tiers,
  ...extra,
})

/** translateForPage, recording what each tier reported, in order. */
async function run(service: TranslationService, req: TranslateRequest) {
  const reports: [Tier, TranslateResponse][] = []
  await service.translateForPage(req, (tier, result) => reports.push([tier, result]))
  return reports
}

describe("tiers", () => {
  it("asks every tier in use at once and reports each result as it comes", async () => {
    const ai = deferred()
    const { service } = setup((s) => (s.tiers.dictionary = "dictionary"), { llm: fakeLlm(ai.promise).llm, fetchFn: googleFetch(), dictionary: fakeDictionary() })
    const reports: [Tier, TranslateResponse][] = []
    const done = service.translateForPage(page("Hello"), (tier, result) => reports.push([tier, result]))
    await vi.waitFor(() => expect(reports.map(([tier]) => tier).sort()).toEqual(["dictionary", "machine"]))
    ai.resolve()
    await done
    expect(reports.at(-1)).toEqual(["ai", { ok: true, text: "AI(Hello)" }])
    expect(Object.fromEntries(reports)).toEqual({
      dictionary: { ok: true, text: "D(Hello)" },
      machine: { ok: true, text: "G(Hello)" },
      ai: { ok: true, text: "AI(Hello)" },
    })
  })

  it("reports a lower tier that answers after the highest one too; the page decides what to show", async () => {
    const google = deferred()
    const { service } = setup(() => {}, { llm: fakeLlm().llm, fetchFn: googleFetch(google.promise) })
    const reports: [Tier, TranslateResponse][] = []
    const done = service.translateForPage(page("Hello"), (tier, result) => reports.push([tier, result]))
    await vi.waitFor(() => expect(reports).toEqual([["ai", { ok: true, text: "AI(Hello)" }]]))
    google.resolve()
    await done
    expect(reports.map(([tier]) => tier)).toEqual(["ai", "machine"])
  })

  it("reports the failure of the highest tier next to the result of a lower one", async () => {
    const llm: LlmImpl = {
      ...fakeLlm().llm,
      single: vi.fn(async () => {
        throw Object.assign(new Error("Incorrect API key"), { statusCode: 401, isRetryable: false })
      }),
    }
    const { service } = setup(() => {}, { llm, fetchFn: googleFetch() })
    const reports = Object.fromEntries(await run(service, page("Hello")))
    expect(reports.machine).toEqual({ ok: true, text: "G(Hello)" })
    expect(reports.ai).toMatchObject({ ok: false, error: expect.stringMatching(/Incorrect API key/) })
  })

  it("does not ask the lower tiers when the highest tier's result is cached", async () => {
    const fetchFn = googleFetch()
    const dictionary = fakeDictionary()
    const { service } = setup((s) => (s.tiers.dictionary = "dictionary"), { llm: fakeLlm().llm, fetchFn, dictionary })
    await run(service, page("Hello"))
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(await run(service, page("Hello"))).toEqual([["ai", { ok: true, text: "AI(Hello)" }]])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(dictionary.translate).toHaveBeenCalledTimes(1)
  })

  it("leaves out tiers that are not used, and tiers that are not asked", async () => {
    const fetchFn = googleFetch()
    const { service, settings } = setup((s) => (s.tiers.machine = null), { llm: fakeLlm().llm, fetchFn })
    expect((await run(service, page("One"))).map(([tier]) => tier)).toEqual(["ai"])
    expect(fetchFn).not.toHaveBeenCalled()
    settings.tiers.machine = "google-free"
    expect(await run(service, page("Two", ["machine"]))).toEqual([["machine", { ok: true, text: "G(Two)" }]])
  })

  it("translates with the machine tier alone", async () => {
    const { service } = setup((s) => (s.tiers.ai = null), { fetchFn: googleFetch() })
    expect(await run(service, page("Hello"))).toEqual([["machine", { ok: true, text: "G(Hello)" }]])
  })
})

describe("prompts", () => {
  it("uses the prompt of the display mode, and the precise prompt in precise mode", async () => {
    const { llm, calls } = fakeLlm()
    const { service, settings } = setup(() => {}, { llm })
    await translateOne(service, ask("One"))
    expect(calls[0].opts.systemPrompt).toBe(DEFAULT_PROMPTS.bilingual)
    settings.mode = "translation-only"
    await translateOne(service, ask("Two"))
    expect(calls[1].opts.systemPrompt).toBe(DEFAULT_PROMPTS.translationOnly)
    settings.precise.enabled = true
    await translateOne(service, ask("Three"))
    expect(calls[2].opts.systemPrompt).toBe(DEFAULT_PROMPTS.precise)
  })

  it("keeps the cache of each prompt apart: a mode switch asks the AI tier again, switching back uses the cache", async () => {
    const { llm } = fakeLlm()
    const { service, settings } = setup(() => {}, { llm })
    await translateOne(service, ask("Hello"))
    settings.mode = "translation-only"
    await translateOne(service, ask("Hello"))
    expect(llm.single).toHaveBeenCalledTimes(2)
    settings.mode = "bilingual"
    await translateOne(service, ask("Hello"))
    expect(llm.single).toHaveBeenCalledTimes(2)
  })

  it("does not use a cached translation after the prompt was edited", async () => {
    const { llm, calls } = fakeLlm()
    const { service, settings } = setup(() => {}, { llm })
    await translateOne(service, ask("Hello"))
    settings.prompts.bilingual = "Translate into {{to}}, very formally."
    await translateOne(service, ask("Hello"))
    expect(llm.single).toHaveBeenCalledTimes(2)
    expect(calls[1].opts.systemPrompt).toBe("Translate into {{to}}, very formally.")
  })

  it("does not merge paragraphs of different prompts into one batch", async () => {
    const { llm, calls } = fakeLlm()
    const { service, settings } = setup(() => {}, { llm })
    const a = translateOne(service, ask("a"))
    settings.mode = "translation-only"
    const b = translateOne(service, ask("b"))
    settings.mode = "bilingual"
    await Promise.all([a, b, translateOne(service, ask("c"))])
    expect(calls.map((c) => c.segments.map((s) => s.text))).toEqual([["a", "c"], ["b"]])
  })

  it("gives the machine tier one cache entry for all display modes", async () => {
    const fetchFn = googleFetch()
    const { service, settings } = setup(() => {}, { fetchFn })
    await translateOne(service, ask("Hello", { providerId: "google-free" }))
    settings.mode = "translation-only"
    await translateOne(service, ask("Hello", { providerId: "google-free" }))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe("source language", () => {
  const google = (source?: string) => {
    const fetchFn = googleFetch()
    return { fetchFn, ...setup(() => {}, { fetchFn }), source }
  }

  it("goes to Google as sl, auto by default", async () => {
    const { service, fetchFn } = google()
    await translateOne(service, ask("Hello", { providerId: "google-free" }))
    await translateOne(service, ask("Hallo", { providerId: "google-free", sourceLang: "de" }))
    expect(fetchFn.mock.calls.map(([url]) => new URL(url).searchParams.get("sl"))).toEqual(["auto", "de"])
  })

  it("goes to Microsoft as from, left out for auto", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => jsonResponse((JSON.parse(String(init.body)) as string[]).map((t) => ({ translations: [{ text: `M(${t})` }] }))))
    const { service } = setup(() => {}, { fetchFn })
    await translateOne(service, ask("Hello", { providerId: "microsoft-free" }))
    await translateOne(service, ask("Hallo", { providerId: "microsoft-free", sourceLang: "zh-TW" }))
    const params = fetchFn.mock.calls.map(([url]) => new URL(url).searchParams)
    expect(params[0].has("from")).toBe(false)
    expect(params[1].get("from")).toBe("zh-Hant")
  })

  it("goes to DeepLX as source_lang, without variant", async () => {
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ code: 200, data: "X" }))
    const { service } = setup((s) => (s.providers.deeplx = { enabled: true, apiKey: "", baseURL: "https://d.example/translate", model: "" }), { fetchFn })
    await translateOne(service, ask("Hello", { providerId: "deeplx" }))
    await translateOne(service, ask("Hallo", { providerId: "deeplx", sourceLang: "zh-TW" }))
    expect(fetchFn.mock.calls.map(([, init]) => JSON.parse(String(init.body)).source_lang)).toEqual(["auto", "ZH"])
  })

  it("is named in the AI request, or left to the model to detect", async () => {
    const { llm, calls } = fakeLlm()
    const { service } = setup(() => {}, { llm })
    await translateOne(service, ask("Hello"))
    await translateOne(service, ask("Bonjour", { sourceLang: "fr" }))
    expect(calls[0].opts.sourceLanguageName).toBeUndefined()
    expect(calls[1].opts.sourceLanguageName).toBe("French")
  })

  it("goes to the dictionary as it is", async () => {
    const dictionary = fakeDictionary()
    const { service } = setup(() => {}, { dictionary })
    await translateOne(service, ask("Hello", { providerId: "dictionary" }))
    await translateOne(service, ask("Hallo", { providerId: "dictionary", sourceLang: "de" }))
    expect(dictionary.translate.mock.calls.map(([, source, target]) => [source, target])).toEqual([
      ["auto", "zh-CN"],
      ["de", "zh-CN"],
    ])
  })

  it("is part of the cache key: another source language does not use the old translation", async () => {
    const { service, fetchFn } = google()
    await translateOne(service, ask("Gift", { providerId: "google-free", sourceLang: "en" }))
    await translateOne(service, ask("Gift", { providerId: "google-free", sourceLang: "de" }))
    await translateOne(service, ask("Gift", { providerId: "google-free", sourceLang: "en" }))
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it("keeps paragraphs of different source languages in different batches", async () => {
    const { service, fetchFn } = google()
    await Promise.all([translateOne(service, ask("a", { providerId: "google-free" })), translateOne(service, ask("b", { providerId: "google-free", sourceLang: "de" }))])
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe("precise mode", () => {
  const preciseOn = (s: Settings) => (s.precise.enabled = true)
  const PARAGRAPHS = ["Hello Anna, thanks for the offer.", "这段已经是中文。", "Acme Cloud renews on Friday.", "Best regards, Tom"]
  const TARGETS = [0, 2, 3]
  const ANALYSIS: MailAnalysis = { summary: "Tom thanks Anna.", glossary: [{ source: "Acme Cloud", target: "Acme 云" }], tone: "Friendly, informal." }

  async function translateMail(service: TranslationService, paragraphs = PARAGRAPHS, targets = TARGETS) {
    const context = createMailContext(paragraphs, targets)
    service.setContext(context)
    const out = await Promise.all(targets.map((i) => translateOne(service, ask(paragraphs[i], { context: { id: context.id, index: i } }))))
    return { context, out }
  }

  it("sends one request when everything fits, with neighbours as reference and no analysis", async () => {
    const { llm, calls } = fakeLlm()
    const { service } = setup(preciseOn, { llm })
    const { out } = await translateMail(service)
    expect(out).toEqual(TARGETS.map((i) => `AI(${PARAGRAPHS[i]})`))
    expect(llm.analyze).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(calls[0].opts.contextPrefix).toBe("")
    expect(calls[0].segments).toEqual([
      { text: PARAGRAPHS[0], before: undefined, after: PARAGRAPHS[1] },
      { text: PARAGRAPHS[2], before: undefined, after: undefined },
      { text: PARAGRAPHS[3], before: undefined, after: undefined },
    ])
  })

  it("analyzes a long message once and puts the analysis into every request", async () => {
    const { llm, calls } = fakeLlm(undefined, ANALYSIS)
    const { service, cache, settings } = setup((s) => {
      preciseOn(s)
      s.batch.maxCharsPerBatch = 40
    }, { llm })
    await translateMail(service)
    expect(llm.analyze).toHaveBeenCalledTimes(1)
    expect(llm.analyze.mock.calls[0][0]).toBe(PARAGRAPHS.join("\n\n"))
    expect(calls.length).toBeGreaterThan(1)
    const prefixes = new Set(calls.map((c) => c.opts.contextPrefix))
    expect(prefixes.size).toBe(1)
    const prefix = calls[0].opts.contextPrefix!
    expect(prefix).toContain("Acme Cloud → Acme 云")
    expect(prefix).toContain("Tom thanks Anna.")
    expect(prefix).toContain(PARAGRAPHS.join("\n\n"))
    // The paragraph after the Chinese one sees it as reference.
    expect(calls.find((c) => c.segments[0].text === PARAGRAPHS[2])!.segments[0].before).toBe(PARAGRAPHS[1])
    // The analysis is cached like a translation.
    const key = cacheKey("openai", settings.providers.openai.model || "gpt-4.1-mini", "zh-CN", PARAGRAPHS.join("\n\n"), "analysis")
    expect(JSON.parse((await cache.get(key))!)).toEqual(ANALYSIS)
  })

  it("translates without the analysis when the analysis fails", async () => {
    const { llm, calls } = fakeLlm()
    llm.analyze.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 400, isRetryable: false }))
    const { service } = setup((s) => {
      preciseOn(s)
      s.batch.maxCharsPerBatch = 40
    }, { llm })
    const { out } = await translateMail(service)
    expect(out).toEqual(TARGETS.map((i) => `AI(${PARAGRAPHS[i]})`))
    const prefix = calls[0].opts.contextPrefix!
    expect(prefix).not.toContain("Summary")
    expect(prefix).toContain("Full text of the email")
  })

  it("keeps translations of different messages apart in the cache and in requests", async () => {
    const { llm, calls } = fakeLlm()
    const { service } = setup(preciseOn, { llm })
    const a = createMailContext(["Hello", "Thanks, Anna"], [0, 1])
    const b = createMailContext(["Hello", "Thanks, Bob"], [0, 1])
    service.setContext(a)
    service.setContext(b)
    await Promise.all([
      ...[0, 1].map((i) => translateOne(service, ask(a.paragraphs[i], { context: { id: a.id, index: i } }))),
      ...[0, 1].map((i) => translateOne(service, ask(b.paragraphs[i], { context: { id: b.id, index: i } }))),
    ])
    // "Hello" appears in both messages and is translated once per message.
    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.segments.map((s) => s.text))).toEqual([
      ["Hello", "Thanks, Anna"],
      ["Hello", "Thanks, Bob"],
    ])
    // Without precise mode the cache key has no context.
    await translateOne(service, ask("Hello"))
    expect(calls).toHaveLength(3)
  })

  it("sends the same system prefix for every request of one message, cached for Anthropic", async () => {
    const bodies: { system: { type: string; text: string; cache_control?: unknown }[]; messages: unknown[] }[] = []
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      const analysis = body.system[0].text.startsWith("You prepare the translation")
      const text = analysis ? JSON.stringify(ANALYSIS) : "译文"
      return anthropicMessage(text)
    })
    const { service } = setup(
      (s) => {
        preciseOn(s)
        s.tiers.ai = "anthropic"
        s.providers.anthropic.apiKey = "sk-ant"
        s.batch.maxCharsPerBatch = 40
      },
      { fetchFn, llm: { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail } },
    )
    const context = createMailContext(PARAGRAPHS, TARGETS)
    service.setContext(context)
    await Promise.all(TARGETS.map((i) => translateOne(service, ask(PARAGRAPHS[i], { providerId: "anthropic", context: { id: context.id, index: i } }))))
    const translations = bodies.filter((b) => !b.system[0].text.startsWith("You prepare the translation"))
    expect(bodies).toHaveLength(TARGETS.length + 1)
    expect(new Set(translations.map((b) => JSON.stringify(b.system))).size).toBe(1)
    expect(translations[0].system).toHaveLength(1)
    expect(translations[0].system[0].text).toContain("Acme Cloud → Acme 云")
    expect(translations[0].system[0].cache_control).toEqual({ type: "ephemeral" })
  })
})
