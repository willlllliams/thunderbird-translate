/** Race mode and precise mode in the background translation service. */
import { describe, expect, it, vi } from "vitest"
import { cacheKey, type KeyValueStorage, PersistentCache } from "../src/background/cache"
import { type LlmImpl, TranslationService } from "../src/background/service"
import { type LlmCallOptions, llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle } from "../src/background/translators/llm"
import type { MailAnalysis, Segment } from "../src/background/translators/llm-prompt"
import { createMailContext } from "../src/shared/mail-context"
import type { TranslateRequest } from "../src/shared/messages"
import { createDefaultSettings, type Settings } from "../src/shared/settings"

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, unknown>()
  return { get: async (k) => data.get(k), set: async (k, v) => void data.set(k, structuredClone(v)), remove: async (k) => void data.delete(k) }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

/** Google endpoint that answers G(<text>), optionally after a gate opens. */
function googleFetch(gate?: Promise<void>) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    await gate
    const qs = new URLSearchParams(String(init.body)).getAll("q")
    return json(qs.map((q) => [`G(${q})`, "en"]))
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

function setup(over: (s: Settings) => void, extra: { llm?: LlmImpl; fetchFn?: unknown; cache?: PersistentCache } = {}) {
  const settings = createDefaultSettings()
  settings.batch.batchDelayMs = 5
  settings.activeProviderId = "openai"
  settings.providers.openai.apiKey = "sk-test"
  over(settings)
  const cache = extra.cache ?? new PersistentCache(memoryStorage(), 100, 10)
  const service = new TranslationService({
    getSettings: () => settings,
    cache,
    sleep: async () => {},
    llm: extra.llm,
    fetchFn: extra.fetchFn as typeof fetch | undefined,
  })
  return { settings, service, cache }
}

const ask = (text: string, extra: Partial<TranslateRequest> = {}): TranslateRequest => ({ text, targetLang: "zh-CN", providerId: "openai", ...extra })
const raceOn = (s: Settings) => (s.race.enabled = true)

describe("race mode", () => {
  it("shows the fast result first, then the AI result", async () => {
    const ai = deferred()
    const { llm } = fakeLlm(ai.promise)
    const { service } = setup(raceOn, { llm, fetchFn: googleFetch() })
    const provisional: string[] = []
    const result = service.translateForPage(ask("Hello"), (t) => provisional.push(t))
    await vi.waitFor(() => expect(provisional).toEqual(["G(Hello)"]))
    ai.resolve()
    expect(await result).toEqual({ ok: true, text: "AI(Hello)" })
  })

  it("drops the fast result when the AI result comes first", async () => {
    const google = deferred()
    const fetchFn = googleFetch(google.promise)
    const { service } = setup(raceOn, { llm: fakeLlm().llm, fetchFn })
    const provisional: string[] = []
    expect(await service.translateForPage(ask("Hello"), (t) => provisional.push(t))).toEqual({ ok: true, text: "AI(Hello)" })
    google.resolve()
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 10))
    expect(provisional).toEqual([])
  })

  it("keeps the fast result when the AI request fails, with the reason", async () => {
    const google = deferred()
    const llm: LlmImpl = {
      ...fakeLlm().llm,
      single: vi.fn(async () => {
        throw Object.assign(new Error("Incorrect API key"), { statusCode: 401, isRetryable: false })
      }),
    }
    const { service } = setup(raceOn, { llm, fetchFn: googleFetch(google.promise) })
    const provisional: string[] = []
    const result = service.translateForPage(ask("Hello"), (t) => provisional.push(t))
    // The AI request has failed before the fast service answers: the fast result becomes the fallback.
    setTimeout(() => google.resolve(), 20)
    const r = await result
    expect(r).toMatchObject({ ok: false, fallback: "G(Hello)" })
    expect(!r.ok && r.error).toMatch(/Incorrect API key/)
    expect(provisional).toEqual([])
  })

  it("does not ask the fast service when the AI result is cached", async () => {
    const fetchFn = googleFetch()
    const { service } = setup(raceOn, { llm: fakeLlm().llm, fetchFn })
    await service.translateForPage(ask("Hello"), () => {})
    const calls = fetchFn.mock.calls.length
    const provisional: string[] = []
    expect(await service.translateForPage(ask("Hello"), (t) => provisional.push(t))).toEqual({ ok: true, text: "AI(Hello)" })
    expect(fetchFn.mock.calls.length).toBe(calls)
    expect(provisional).toEqual([])
  })

  it("applies only to AI services and only when turned on", async () => {
    const fetchFn = googleFetch()
    const { service, settings } = setup(() => {}, { llm: fakeLlm().llm, fetchFn })
    await service.translateForPage(ask("One"), () => {})
    expect(fetchFn).not.toHaveBeenCalled()
    settings.race.enabled = true
    settings.activeProviderId = "google-free"
    expect(await service.translateForPage(ask("Two", { providerId: "google-free" }), () => {})).toEqual({ ok: true, text: "G(Two)" })
    expect(fetchFn).toHaveBeenCalledTimes(1)
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
    const out = await Promise.all(targets.map((i) => service.translate(ask(paragraphs[i], { context: { id: context.id, index: i } }))))
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
      ...[0, 1].map((i) => service.translate(ask(a.paragraphs[i], { context: { id: a.id, index: i } }))),
      ...[0, 1].map((i) => service.translate(ask(b.paragraphs[i], { context: { id: b.id, index: i } }))),
    ])
    // "Hello" appears in both messages and is translated once per message.
    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.segments.map((s) => s.text))).toEqual([
      ["Hello", "Thanks, Anna"],
      ["Hello", "Thanks, Bob"],
    ])
    // Without precise mode the cache key has no context.
    await service.translate(ask("Hello"))
    expect(calls).toHaveLength(3)
  })

  it("sends the same system prefix for every request of one message, cached for Anthropic", async () => {
    const bodies: { system: { type: string; text: string; cache_control?: unknown }[]; messages: unknown[] }[] = []
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      const analysis = body.system[0].text.startsWith("You prepare the translation")
      const text = analysis ? JSON.stringify(ANALYSIS) : "译文"
      return json({ id: "m", type: "message", role: "assistant", model: "m", content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })
    })
    const { service } = setup(
      (s) => {
        preciseOn(s)
        s.activeProviderId = "anthropic"
        s.providers.anthropic.apiKey = "sk-ant"
        s.batch.maxCharsPerBatch = 40
      },
      { fetchFn, llm: { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail } },
    )
    const context = createMailContext(PARAGRAPHS, TARGETS)
    service.setContext(context)
    await Promise.all(TARGETS.map((i) => service.translate(ask(PARAGRAPHS[i], { providerId: "anthropic", context: { id: context.id, index: i } }))))
    const translations = bodies.filter((b) => !b.system[0].text.startsWith("You prepare the translation"))
    expect(bodies).toHaveLength(TARGETS.length + 1)
    expect(new Set(translations.map((b) => JSON.stringify(b.system))).size).toBe(1)
    expect(translations[0].system).toHaveLength(1)
    expect(translations[0].system[0].text).toContain("Acme Cloud → Acme 云")
    expect(translations[0].system[0].cache_control).toEqual({ type: "ephemeral" })
  })
})
