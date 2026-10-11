/**
 * Translation pipeline in the background script:
 *
 *   translate(request) → cache → in-flight dedupe → BatchQueue (50 ms window)
 *     → executor per provider kind → RequestQueue (concurrency + retry)
 *
 * Race mode runs this pipeline twice per paragraph, once for the AI service
 * and once for a fast service, and reports the fast result while the AI
 * result is pending. Precise mode adds the message as context to AI requests:
 * neighbouring paragraphs always, plus an analysis of the whole message
 * (summary, glossary, tone) when the message does not fit into one request.
 */

import { describeError, type ErrorContext, LocalizedError } from "../shared/errors"
import { hashText } from "../shared/hash"
import { ENGLISH, type I18n } from "../shared/i18n"
import { getLanguage } from "../shared/languages"
import type { MailContext } from "../shared/mail-context"
import type { TranslateRequest, TranslateResponse } from "../shared/messages"
import { getPreset, isAiProvider } from "../shared/providers"
import { type ProviderConfig, type ResolvedProvider, resolveProvider, resolveProviderConfig, type Settings } from "../shared/settings"
import { cacheKey, LruCache, type PersistentCache } from "./cache"
import { type BatchLimits, BatchQueue } from "./queue/batch-queue"
import { RequestQueue } from "./queue/request-queue"
import { deeplxTranslate } from "./translators/deeplx"
import { googleTranslateBatch } from "./translators/google"
import { BatchParseError, llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle, type LlmCallOptions } from "./translators/llm"
import { buildContextBlock, type MailAnalysis, MAX_PREFIX_TEXT_CHARS, parseAnalysis, type Segment } from "./translators/llm-prompt"
import { AZURE_LIMITS, microsoftTranslateBatch } from "./translators/microsoft"

export type ItemResult = { ok: true; text: string } | { ok: false; error: string }

interface Job {
  text: string
  targetLang: string
  provider: ResolvedProvider
  batchKey: string
  /** Cache key of the result. */
  key: string
  /** Precise mode: the message and the paragraph's position in it. */
  mail?: { context: MailContext; index: number }
}

/** Hard caps for the free endpoints, applied on top of the user's batch settings. Microsoft with a key has its own caps. */
const FREE_LIMITS: Record<string, BatchLimits> = {
  google: { maxItems: 100, maxChars: 5000 },
  microsoft: { maxItems: 100, maxChars: 5000 },
  deeplx: { maxItems: 50, maxChars: 5000 },
}

/** Messages kept for precise mode; a message is registered again when it is translated again. */
const MAX_CONTEXTS = 20

export interface LlmImpl {
  batch: (segments: Segment[], opts: LlmCallOptions) => Promise<string[]>
  single: (segment: Segment, opts: LlmCallOptions) => Promise<string>
  analyze: (text: string, opts: LlmCallOptions) => Promise<MailAnalysis | null>
}

export interface ServiceDeps {
  getSettings: () => Settings
  cache: PersistentCache
  fetchFn?: typeof fetch
  /** Injection point for tests. */
  llm?: LlmImpl
  sleep?: (ms: number) => Promise<void>
  /** Language of error messages; English when absent. */
  i18n?: () => I18n
}

/** What describeError() needs to know about the provider of a failed request. */
export function errorContext(provider: ResolvedProvider): ErrorContext {
  const preset = getPreset(provider.id)
  if (!preset) return { baseURL: provider.baseURL }
  return {
    service: preset.name,
    kind: preset.kind,
    baseURL: preset.kind === "microsoft" && provider.mode === "free" ? undefined : provider.baseURL,
    defaultBaseURL: preset.defaultBaseURL,
    model: preset.kind === "llm" ? provider.model : undefined,
    keyMode: provider.mode === "key",
  }
}

/** Key mode of Microsoft Translator: what the Azure request needs. */
function azureConfig({ mode, apiKey, region, baseURL }: ResolvedProvider) {
  return mode === "key" ? { apiKey, region, endpoint: baseURL } : undefined
}

export class TranslationService {
  private readonly requestQueue: RequestQueue
  private readonly batchQueue: BatchQueue<Job, ItemResult>
  private readonly inflight = new Map<string, Promise<string>>()
  private readonly contexts = new LruCache<MailContext>(MAX_CONTEXTS)
  /** Analyses by cache key, finished or running, so the batches of one message share one request. */
  private readonly analyses = new LruCache<Promise<MailAnalysis | null>>(MAX_CONTEXTS)
  private readonly llm: LlmImpl
  /** Statistics, useful for tests and for the options page. */
  readonly stats = { requests: 0, batches: 0, fallbacks: 0 }

  constructor(private readonly deps: ServiceDeps) {
    this.llm = deps.llm ?? { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail }
    this.requestQueue = new RequestQueue({
      concurrency: () => deps.getSettings().batch.concurrency,
      maxRetries: () => deps.getSettings().batch.maxRetries,
      sleep: deps.sleep,
    })
    this.batchQueue = new BatchQueue<Job, ItemResult>({
      delayMs: () => deps.getSettings().batch.batchDelayMs,
      getKey: (job) => job.batchKey,
      getSize: (job) => job.text.length,
      limits: (key) => this.limitsFor(key),
      execute: (_key, jobs) => this.executeBatch(jobs),
    })
  }

  private limitsFor(batchKey: string): BatchLimits {
    const s = this.deps.getSettings().batch
    const parts = batchKey.split("|")
    const preset = getPreset(parts[0])
    const user = { maxItems: s.maxItemsPerBatch, maxChars: s.maxCharsPerBatch }
    if (!preset) return user
    if (preset.kind === "llm") {
      return s.llmBatchEnabled ? user : { maxItems: 1, maxChars: Number.MAX_SAFE_INTEGER }
    }
    // The last part of a batch key is the Microsoft mode.
    const cap = preset.kind === "microsoft" && parts.at(-1) === "key" ? AZURE_LIMITS : FREE_LIMITS[preset.kind]
    return { maxItems: Math.min(cap.maxItems, user.maxItems), maxChars: Math.min(cap.maxChars, user.maxChars) }
  }

  private errorMessage(error: unknown, provider?: ResolvedProvider): string {
    return describeError(error, this.deps.i18n?.() ?? ENGLISH, provider ? errorContext(provider) : {})
  }

  /** Precise mode: register a message before its paragraphs are requested. */
  setContext(context: MailContext): void {
    this.contexts.set(context.id, context)
  }

  private job(req: TranslateRequest): Job {
    const settings = this.deps.getSettings()
    const provider = resolveProvider(settings, req.providerId)
    const ai = isAiProvider(getPreset(req.providerId))
    const context = ai && settings.precise.enabled && req.context ? this.contexts.get(req.context.id) : undefined
    // A precise translation depends on its message: the message hash keeps cache entries and batches apart.
    const promptSig = ai ? hashText(settings.systemPrompt) + (context ? `:precise:${context.id}` : "") : ""
    return {
      text: req.text,
      targetLang: req.targetLang,
      provider,
      key: cacheKey(req.providerId, provider.model, req.targetLang, req.text, promptSig),
      batchKey: [req.providerId, provider.model, provider.baseURL, req.targetLang, promptSig, provider.mode].join("|"),
      ...(context && req.context ? { mail: { context, index: req.context.index } } : {}),
    }
  }

  async translate(req: TranslateRequest): Promise<string> {
    const job = this.job(req)
    return (await this.deps.cache.get(job.key)) ?? this.enqueue(job)
  }

  private enqueue(job: Job): Promise<string> {
    const running = this.inflight.get(job.key)
    if (running) return running
    const promise = this.batchQueue
      .enqueue(job)
      .then(async (result) => {
        if (!result.ok) throw new Error(result.error)
        await this.deps.cache.set(job.key, result.text)
        return result.text
      })
      .finally(() => this.inflight.delete(job.key))
    this.inflight.set(job.key, promise)
    return promise
  }

  /**
   * Translation of a paragraph on screen. In race mode with an AI service the
   * fast service runs alongside: its result goes to onProvisional while the AI
   * result is pending, and comes back as fallback when the AI request fails.
   * A cached AI result answers at once, without asking the fast service.
   */
  async translateForPage(req: TranslateRequest, onProvisional: (text: string) => void): Promise<TranslateResponse> {
    let settled = false
    let fast: Promise<string | undefined> = Promise.resolve(undefined)
    try {
      const job = this.job(req)
      const cached = await this.deps.cache.get(job.key)
      if (cached !== undefined) return { ok: true, text: cached }
      const fastId = this.raceFastProvider(req.providerId)
      if (fastId) {
        fast = this.translate({ text: req.text, targetLang: req.targetLang, providerId: fastId }).then(
          (text) => {
            if (!settled) onProvisional(text)
            return text
          },
          () => undefined,
        )
      }
      const text = await this.enqueue(job)
      settled = true
      return { ok: true, text }
    } catch (error) {
      settled = true
      const fallback = await fast
      return { ok: false, error: this.errorMessage(error), ...(fallback ? { fallback } : {}) }
    }
  }

  private raceFastProvider(providerId: string): string | undefined {
    const { race } = this.deps.getSettings()
    if (!race.enabled || race.fastProviderId === providerId || !isAiProvider(getPreset(providerId))) return undefined
    return race.fastProviderId
  }

  /** Translate with an unsaved configuration, bypassing cache and batching. */
  async testProvider(providerId: string, config: Omit<ProviderConfig, "enabled">, targetLang: string): Promise<string> {
    const provider = resolveProviderConfig(providerId, config)
    const sample = "Hello! This is a connection test from Thunderbird Translate."
    const results = await this.executeBatch([{ text: sample, targetLang, provider, batchKey: "test", key: "" }])
    const r = results[0]
    if (!r.ok) throw new Error(r.error)
    return r.text
  }

  private llmOptions(job: Job): LlmCallOptions {
    return {
      provider: job.provider,
      systemPrompt: this.deps.getSettings().systemPrompt,
      targetLanguageName: getLanguage(job.targetLang).english,
      fetchFn: this.deps.fetchFn,
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
    const limits = this.limitsFor(job.batchKey)
    const chars = context.targets.reduce((n, i) => n + (context.paragraphs[i]?.length ?? 0), 0)
    if (chars <= limits.maxChars && context.targets.length <= limits.maxItems) return ""
    const analysis = await this.analysis(job)
    return buildContextBlock(analysis, context.text.length <= MAX_PREFIX_TEXT_CHARS ? context.text : "")
  }

  private analysis(job: Job): Promise<MailAnalysis | null> {
    const key = cacheKey(job.provider.id, job.provider.model, job.targetLang, job.mail!.context.text, "analysis")
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
      const analysis = await this.run(() => this.llm.analyze(job.mail!.context.text, this.llmOptions(job)))
      if (analysis) await this.deps.cache.set(key, JSON.stringify(analysis))
      return analysis
    } catch {
      // Translation goes on without the analysis; the requests still carry the neighbouring paragraphs.
      return null
    }
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    return this.requestQueue.run(() => {
      this.stats.requests++
      return task()
    })
  }

  async executeBatch(jobs: Job[]): Promise<ItemResult[]> {
    const first = jobs[0]
    const preset = getPreset(first.provider.id)
    if (!preset) return jobs.map(() => ({ ok: false, error: this.errorMessage(new LocalizedError("errUnknownProvider", [first.provider.id])) }))
    const lang = getLanguage(first.targetLang)
    const texts = jobs.map((j) => j.text)
    const fetchFn = this.deps.fetchFn
    this.stats.batches++

    const all = async (fn: () => Promise<string[]>): Promise<ItemResult[]> => {
      try {
        const out = await fn()
        return out.map((text) => ({ ok: true, text }))
      } catch (error) {
        return jobs.map(() => ({ ok: false, error: this.errorMessage(error, first.provider) }))
      }
    }
    const each = (fn: (job: Job) => Promise<string>): Promise<ItemResult[]> =>
      Promise.all(
        jobs.map((job) =>
          this.run(() => fn(job)).then(
            (text): ItemResult => ({ ok: true, text }),
            (error): ItemResult => ({ ok: false, error: this.errorMessage(error, job.provider) }),
          ),
        ),
      )

    switch (preset.kind) {
      case "google":
        return all(() => this.run(() => googleTranslateBatch(texts, lang.google, { fetchFn, baseURL: first.provider.baseURL })))
      case "microsoft":
        return all(() => this.run(() => microsoftTranslateBatch(texts, lang.microsoft, { fetchFn, azure: azureConfig(first.provider) })))
      case "deeplx":
        return each((job) => deeplxTranslate(job.text, lang.deepl, job.provider.baseURL, job.provider.apiKey, { fetchFn }))
      case "llm": {
        const opts = this.llmOptions(first)
        if (first.mail) opts.contextPrefix = await this.contextPrefix(first)
        if (jobs.length > 1) {
          try {
            const out = await this.run(() => this.llm.batch(this.segments(jobs), opts))
            if (out.length === jobs.length) return out.map((text) => ({ ok: true, text }))
          } catch (error) {
            if (!(error instanceof BatchParseError)) {
              return jobs.map(() => ({ ok: false, error: this.errorMessage(error, first.provider) }))
            }
          }
          // The merged answer did not line up: one request per paragraph.
          this.stats.fallbacks++
        }
        return each((job) => this.llm.single(this.segments([job])[0], opts))
      }
    }
  }
}
