/**
 * Translation pipeline in the background script:
 *
 *   translateForPage(request) → per tier: cache → in-flight dedupe
 *     → pieces within the batch limit → BatchQueue (50 ms window)
 *     → executor per provider kind → RequestQueue of the provider (concurrency, retry)
 *
 * A paragraph on screen runs this pipeline once per enabled tier (dictionary,
 * machine translation, AI), all at the same time, and every tier reports its
 * own result. Each provider has its own request queue, so slow AI requests
 * never hold back the lower tiers. A cached result of the highest tier
 * answers at once, without asking the lower tiers. A paragraph longer than a
 * batch may carry is translated in pieces and cached as a whole. Precise
 * mode adds the message as context to AI requests: neighbouring paragraphs
 * always, plus an analysis of the whole message (summary, glossary, tone)
 * when the message does not fit into one request.
 */

import { getBergamot } from "../offline/bergamot"
import { describeError, type ErrorContext } from "../shared/errors"
import { hashText } from "../shared/hash"
import { ENGLISH, type I18n } from "../shared/i18n"
import type { LanguageDetector } from "../shared/lang-detect"
import { getLanguage } from "../shared/languages"
import type { MailContext } from "../shared/mail-context"
import type { TranslateRequest, TranslateResponse } from "../shared/messages"
import { promptText } from "../shared/prompts"
import { getPreset, isAiProvider, type Tier, TIERS } from "../shared/providers"
import { type ProviderConfig, promptKindFor, type ResolvedProvider, resolveProvider, resolveProviderConfig, type Settings } from "../shared/settings"
import { cacheKey, LruCache, type PersistentCache } from "./cache"
import { Dictionary } from "./dictionary"
import { type BatchLimits, BatchQueue, joinParts, splitText } from "./queue/batch-queue"
import { RequestQueue } from "./queue/request-queue"
import { bergamotTranslateBatch } from "./translators/bergamot"
import { deeplxTranslate } from "./translators/deeplx"
import { googleTranslateBatch, googleTranslateSingle } from "./translators/google"
import type { LlmCallOptions } from "./translators/llm"
import { BatchParseError, buildContextBlock, type MailAnalysis, MAX_PREFIX_TEXT_CHARS, parseAnalysis, type Segment } from "./translators/llm-prompt"
import { AZURE_LIMITS, microsoftTranslateBatch } from "./translators/microsoft"

type ItemResult = { ok: true; text: string } | { ok: false; error: string }

interface Job {
  text: string
  sourceLang: string
  targetLang: string
  provider: ResolvedProvider
  /** AI services: the system prompt template. */
  prompt?: string
  /** Hash of everything besides the text and the languages that shapes the result: endpoint, prompt, thinking, temperature, installed data. */
  variant: string
  batchKey: string
  /** Cache key of the result. */
  key: string
  /** Precise mode: the message and the paragraph's position in it. */
  mail?: { context: MailContext; index: number }
}

/** Hard caps for the free and local services, applied on top of the user's batch settings. Microsoft with a key has its own caps. */
const FREE_LIMITS: Record<string, BatchLimits> = {
  dictionary: { maxItems: 100, maxChars: 50000 },
  bergamot: { maxItems: 100, maxChars: 5000 },
  google: { maxItems: 100, maxChars: 5000 },
  microsoft: { maxItems: 100, maxChars: 5000 },
  deeplx: { maxItems: 50, maxChars: 5000 },
}

/** Messages kept for precise mode; a message is registered again when it is translated again. */
const MAX_CONTEXTS = 20

/** Local models (Ollama, LM Studio) and models that reason first answer slowly: their requests get this multiple of the request timeout. */
const SLOW_MODEL_TIMEOUT_FACTOR = 3

export interface LlmImpl {
  batch: (segments: Segment[], opts: LlmCallOptions) => Promise<string[]>
  single: (segment: Segment, opts: LlmCallOptions) => Promise<string>
  analyze: (text: string, opts: LlmCallOptions) => Promise<MailAnalysis | null>
}

/** The AI SDK, loaded with the first AI request: the background script starts without it (scripts/build.mjs makes it a chunk). */
const loadLlm = () => import("./translators/llm")
const LAZY_LLM: LlmImpl = {
  batch: async (segments, opts) => (await loadLlm()).llmTranslateBatch(segments, opts),
  single: async (segment, opts) => (await loadLlm()).llmTranslateSingle(segment, opts),
  analyze: async (text, opts) => (await loadLlm()).llmAnalyzeMail(text, opts),
}

export interface ServiceDeps {
  getSettings: () => Settings
  cache: PersistentCache
  fetchFn?: typeof fetch
  /** Injection points for tests. */
  llm?: LlmImpl
  dictionary?: Pick<Dictionary, "translate" | "signature">
  /** Detector of sourceDetector() for the offline models, with source language "auto". */
  detect?: LanguageDetector
  sleep?: (ms: number) => Promise<void>
  /** Language of error messages; English when absent. */
  i18n?: () => I18n
}

/** What describeError() needs to know about the provider of a failed request. */
export function errorContext(provider: ResolvedProvider): ErrorContext {
  const preset = getPreset(provider.id)
  const secrets = provider.apiKey ? [provider.apiKey] : []
  if (!preset) return { baseURL: provider.baseURL, secrets }
  return {
    service: preset.name,
    kind: preset.kind,
    baseURL: preset.kind === "microsoft" && provider.mode === "free" ? undefined : provider.baseURL,
    defaultBaseURL: preset.defaultBaseURL,
    model: preset.kind === "llm" ? provider.model : undefined,
    keyMode: provider.mode === "key",
    secrets,
  }
}

/** Key mode of Microsoft Translator: what the Azure request needs. */
function azureConfig({ mode, apiKey, region, baseURL }: ResolvedProvider) {
  return mode === "key" ? { apiKey, region, endpoint: baseURL } : undefined
}

export class TranslationService {
  /** One request queue per provider: its concurrency limit and retries apply to that provider only. */
  private readonly queues = new Map<string, RequestQueue>()
  private readonly batchQueue: BatchQueue<Job, ItemResult>
  private readonly inflight = new Map<string, Promise<string>>()
  private readonly contexts = new LruCache<MailContext>(MAX_CONTEXTS)
  /** Analyses by cache key, finished or running, so the batches of one message share one request. */
  private readonly analyses = new LruCache<Promise<MailAnalysis | null>>(MAX_CONTEXTS)
  private readonly llm: LlmImpl
  private readonly dictionary: Pick<Dictionary, "translate" | "signature">

  constructor(private readonly deps: ServiceDeps) {
    this.llm = deps.llm ?? LAZY_LLM
    this.dictionary = deps.dictionary ?? new Dictionary()
    this.batchQueue = new BatchQueue<Job, ItemResult>({
      delayMs: () => deps.getSettings().batch.batchDelayMs,
      getKey: (job) => job.batchKey,
      getSize: (job) => job.text.length,
      limits: (job) => this.limitsFor(job.provider),
      execute: (_key, jobs) => this.executeBatch(jobs),
    })
  }

  private queue(provider: ResolvedProvider): RequestQueue {
    let queue = this.queues.get(provider.id)
    if (!queue) {
      const batch = () => this.deps.getSettings().batch
      queue = new RequestQueue({
        concurrency: () => batch().concurrency,
        maxRetries: () => batch().maxRetries,
        // A model that timed out would time out again, and each attempt is charged.
        timeoutRetries: getPreset(provider.id)?.kind === "llm" ? 0 : 1,
        sleep: this.deps.sleep,
      })
      this.queues.set(provider.id, queue)
    }
    return queue
  }

  /** Request timeout for a provider: the setting, multiplied for local models and models that reason first. */
  private timeoutMs(provider: ResolvedProvider): number {
    const ms = this.deps.getSettings().batch.timeoutSeconds * 1000
    const slow = provider.thinking || getPreset(provider.id)?.nameKey === "providerLocal"
    return slow ? ms * SLOW_MODEL_TIMEOUT_FACTOR : ms
  }

  private limitsFor(provider: ResolvedProvider): BatchLimits {
    const s = this.deps.getSettings().batch
    const preset = getPreset(provider.id)
    const user = { maxItems: s.maxItemsPerBatch, maxChars: s.maxCharsPerBatch }
    if (!preset) return user
    if (preset.kind === "llm") return s.llmBatchEnabled ? user : { ...user, maxItems: 1 }
    // Only Microsoft Translator has a key mode.
    const cap = provider.mode === "key" ? AZURE_LIMITS : FREE_LIMITS[preset.kind]
    return { maxItems: Math.min(cap.maxItems, user.maxItems), maxChars: Math.min(cap.maxChars, user.maxChars) }
  }

  private errorMessage(error: unknown, provider?: ResolvedProvider): string {
    return describeError(error, this.deps.i18n?.() ?? ENGLISH, provider ? errorContext(provider) : {})
  }

  /** Precise mode: register a message before its paragraphs are requested. */
  setContext(context: MailContext): void {
    this.contexts.set(context.id, context)
  }

  /** Signature of the installed data a service translates with: dictionary packs or offline models. */
  private dataSignature(kind: "dictionary" | "bergamot"): Promise<string> {
    return (kind === "dictionary" ? this.dictionary.signature() : getBergamot().signature()).catch(() => "")
  }

  /** The work of one tier for one paragraph. `data`: dataSignature() of the service. */
  private job(req: TranslateRequest, providerId: string, settings: Settings, data: string): Job {
    const provider = resolveProvider(settings, providerId)
    const preset = getPreset(providerId)
    const kind = isAiProvider(preset) ? promptKindFor(settings) : undefined
    const prompt = kind ? promptText(settings.prompts, kind) : undefined
    const context = kind === "precise" && req.context ? this.contexts.get(req.context.id) : undefined
    // Everything besides the text that shapes the result keeps cache entries and batches apart.
    const ai = kind ? [kind, prompt, provider.thinking, provider.temperature] : []
    const variant = hashText([provider.baseURL, provider.mode, ...ai, data].join("\n"))
    const sig = context ? `${variant}:${context.id}` : variant
    return {
      text: req.text,
      sourceLang: req.sourceLang,
      targetLang: req.targetLang,
      provider,
      prompt,
      variant,
      key: cacheKey(providerId, provider.model, `${req.sourceLang}>${req.targetLang}`, req.text, sig),
      batchKey: [providerId, provider.model, req.sourceLang, req.targetLang, sig].join("|"),
      ...(context && req.context ? { mail: { context, index: req.context.index } } : {}),
    }
  }

  /** The cached result, or the result of the running request for the same paragraph, or a new one. */
  private async run(job: Job): Promise<string> {
    const cached = await this.deps.cache.get(job.key)
    if (cached !== undefined) return cached
    let running = this.inflight.get(job.key)
    if (!running) {
      running = this.translateParts(job).finally(() => this.inflight.delete(job.key))
      this.inflight.set(job.key, running)
    }
    return running
  }

  /** The paragraph in pieces within the batch limit, translated and put together again, then cached as a whole. */
  private async translateParts(job: Job): Promise<string> {
    const parts = splitText(job.text, this.limitsFor(job.provider).maxChars)
    // A part without text holds the whitespace at the start of the paragraph; joinParts() puts it back.
    const results = await Promise.all(parts.map(({ text }): ItemResult | Promise<ItemResult> => (text ? this.batchQueue.enqueue({ ...job, text }) : { ok: true, text: "" })))
    const texts = results.map((result) => {
      if (!result.ok) throw new Error(result.error)
      return result.text
    })
    const text = joinParts(parts, texts, job.targetLang)
    await this.deps.cache.set(job.key, text)
    return text
  }

  private async settle(job: Job): Promise<TranslateResponse> {
    try {
      return { ok: true, text: await this.run(job) }
    } catch (error) {
      return { ok: false, error: this.errorMessage(error) }
    }
  }

  /**
   * Translation of a paragraph on screen: every requested tier that has a
   * service runs at once and reports its result through onTier as soon as it
   * is there. When the highest of these tiers has its result in the cache,
   * only that result is reported.
   */
  async translateForPage(req: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void): Promise<void> {
    const settings = this.deps.getSettings()
    const tiers = TIERS.filter((tier) => settings.tiers[tier] && req.tiers.includes(tier))
    const data: Partial<Record<Tier, string>> = {}
    for (const tier of tiers) {
      const kind = getPreset(settings.tiers[tier]!)?.kind
      if (kind === "dictionary" || kind === "bergamot") data[tier] = await this.dataSignature(kind)
    }
    const jobs: [Tier, Job][] = []
    for (const tier of tiers) {
      try {
        jobs.push([tier, this.job(req, settings.tiers[tier]!, settings, data[tier] ?? "")])
      } catch (error) {
        onTier(tier, { ok: false, error: this.errorMessage(error) })
      }
    }
    const top = jobs.at(-1)
    if (!top) return
    const cached = await this.deps.cache.get(top[1].key)
    if (cached !== undefined) return onTier(top[0], { ok: true, text: cached })
    await Promise.all(jobs.map(async ([tier, job]) => onTier(tier, await this.settle(job))))
  }

  /** Translate with an unsaved configuration, bypassing cache and batching. */
  async testProvider(providerId: string, config: Omit<ProviderConfig, "enabled">, targetLang: string): Promise<string> {
    const provider = resolveProviderConfig(providerId, config)
    const sample = "Hello! This is a connection test from Thunderbird Translate."
    const prompt = promptText(this.deps.getSettings().prompts, "bilingual")
    const results = await this.executeBatch([{ text: sample, sourceLang: "auto", targetLang, provider, prompt, variant: "", batchKey: "test", key: "" }])
    const r = results[0]
    if (!r.ok) throw new Error(r.error)
    return r.text
  }

  private llmOptions(job: Job): LlmCallOptions {
    return {
      provider: job.provider,
      systemPrompt: job.prompt ?? "",
      targetLanguageName: getLanguage(job.targetLang).english,
      ...(job.sourceLang !== "auto" ? { sourceLanguageName: getLanguage(job.sourceLang).english } : {}),
      fetchFn: this.deps.fetchFn,
      timeoutMs: this.timeoutMs(job.provider),
    }
  }

  /** Paragraphs of one request; in precise mode with the neighbours that are not part of the same request. */
  private segments(jobs: Job[]): Segment[] {
    const inRequest = new Set(jobs.map((job) => job.mail?.index))
    const shown = new Set<number>()
    return jobs.map((job) => {
      if (!job.mail) return { text: job.text }
      const { context, index } = job.mail
      const neighbour = (i: number) => {
        if (inRequest.has(i) || shown.has(i) || context.paragraphs[i] === undefined) return undefined
        shown.add(i)
        return context.paragraphs[i]
      }
      return { text: job.text, before: neighbour(index - 1), after: neighbour(index + 1) }
    })
  }

  /**
   * Precise mode: the context shared by every request of one message. When
   * all paragraphs to translate fit into one request, that request carries the
   * whole message and no analysis is needed.
   */
  private async contextPrefix(job: Job): Promise<string> {
    const { context } = job.mail!
    const limits = this.limitsFor(job.provider)
    const chars = context.targets.reduce((n, i) => n + (context.paragraphs[i]?.length ?? 0), 0)
    if (chars <= limits.maxChars && context.targets.length <= limits.maxItems) return ""
    const analysis = await this.analysis(job)
    return buildContextBlock(analysis, context.text.length <= MAX_PREFIX_TEXT_CHARS ? context.text : "")
  }

  /** The analysis of the message, shared by the requests of one configuration (endpoint, thinking, temperature, languages). */
  private analysis(job: Job): Promise<MailAnalysis | null> {
    const key = cacheKey(job.provider.id, job.provider.model, `${job.sourceLang}>${job.targetLang}`, job.mail!.context.text, `${job.variant}:analysis`)
    let analysis = this.analyses.get(key)
    if (!analysis) {
      analysis = this.loadAnalysis(key, job)
      this.analyses.set(key, analysis)
    }
    return analysis
  }

  private async loadAnalysis(key: string, job: Job): Promise<MailAnalysis | null> {
    const cached = await this.deps.cache.get(key)
    if (cached !== undefined) return parseAnalysis(cached)
    try {
      const analysis = await this.queue(job.provider).run(() => this.llm.analyze(job.mail!.context.text, this.llmOptions(job)))
      if (analysis) await this.deps.cache.set(key, JSON.stringify(analysis))
      return analysis
    } catch {
      // Translation goes on without the analysis; the requests still carry the neighbouring paragraphs.
      // The next batch asks again: a failed request is not an answer. An unusable answer (null above) is kept.
      this.analyses.delete(key)
      return null
    }
  }

  private async executeBatch(jobs: Job[]): Promise<ItemResult[]> {
    const first = jobs[0]
    // Jobs carry a resolved provider, and resolving fails for unknown presets.
    const preset = getPreset(first.provider.id)!
    const queue = this.queue(first.provider)
    const lang = getLanguage(first.targetLang)
    const source = first.sourceLang === "auto" ? undefined : getLanguage(first.sourceLang)
    const texts = jobs.map((j) => j.text)
    const fetchOpts = { fetchFn: this.deps.fetchFn, timeoutMs: this.timeoutMs(first.provider) }

    const ok = (text: string): ItemResult => ({ ok: true, text })
    const fail = (error: unknown): ItemResult => ({ ok: false, error: this.errorMessage(error, first.provider) })
    const failAll = (error: unknown) => jobs.map(() => fail(error))
    /** One request for the whole batch, answering for every paragraph on its own. */
    const settled = (fn: () => Promise<PromiseSettledResult<string>[]>): Promise<ItemResult[]> =>
      queue.run(fn).then((out) => out.map((r) => (r.status === "fulfilled" ? ok(r.value) : fail(r.reason))), failAll)
    /** One request for the whole batch. */
    const all = (fn: () => Promise<string[]>): Promise<ItemResult[]> => queue.run(fn).then((out) => out.map(ok), failAll)
    /** One request per paragraph; a failure affects its paragraph only. */
    const each = (fn: (job: Job) => Promise<string>): Promise<ItemResult[]> => Promise.all(jobs.map((job) => queue.run(() => fn(job)).then(ok, fail)))
    /** One request for the whole batch; one per paragraph when its answer does not line up. */
    const batchOrEach = async (batch: () => Promise<string[]>, single: (job: Job) => Promise<string>): Promise<ItemResult[]> => {
      try {
        const out = await queue.run(batch)
        if (out.length === jobs.length) return out.map(ok)
      } catch (error) {
        if (!(error instanceof BatchParseError)) return failAll(error)
      }
      return each(single)
    }

    switch (preset.kind) {
      case "dictionary":
        return settled(() => this.dictionary.translate(texts, first.sourceLang, first.targetLang))
      case "bergamot":
        return settled(() => bergamotTranslateBatch(texts, first.sourceLang, first.targetLang, this.deps.detect))
      case "google": {
        const opts = { ...fetchOpts, baseURL: first.provider.baseURL, source: source?.google }
        return batchOrEach(
          () => googleTranslateBatch(texts, lang.google, opts),
          (job) => googleTranslateSingle(job.text, lang.google, opts),
        )
      }
      case "microsoft":
        return all(() => microsoftTranslateBatch(texts, lang.microsoft, { ...fetchOpts, azure: azureConfig(first.provider), from: source?.microsoft }))
      case "deeplx": {
        // DeepL source codes have no variants: "ZH", not "ZH-HANT".
        const deeplSource = source?.deepl.split("-")[0]
        return each((job) => deeplxTranslate(job.text, lang.deepl, job.provider.baseURL, job.provider.apiKey, { ...fetchOpts, source: deeplSource }))
      }
      case "llm": {
        const opts = this.llmOptions(first)
        if (first.mail) opts.contextPrefix = await this.contextPrefix(first)
        const single = (job: Job) => this.llm.single(this.segments([job])[0], opts)
        return jobs.length > 1 ? batchOrEach(() => this.llm.batch(this.segments(jobs), opts), single) : each(single)
      }
    }
  }
}
