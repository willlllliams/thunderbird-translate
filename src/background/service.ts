/**
 * Translation pipeline in the background script:
 *
 *   translate(request) → cache → in-flight dedupe → BatchQueue (50 ms window)
 *     → executor per provider kind → RequestQueue (concurrency + retry)
 *
 * A paragraph on screen runs this pipeline once per enabled tier (dictionary,
 * machine translation, AI), all at the same time, and every tier reports its
 * own result. A cached result of the highest tier answers at once, without
 * asking the lower tiers. Precise mode adds the message as context to AI
 * requests: neighbouring paragraphs always, plus an analysis of the whole
 * message (summary, glossary, tone) when the message does not fit into one
 * request.
 */

import { describeError, type ErrorContext } from "../shared/errors"
import { hashText } from "../shared/hash"
import { ENGLISH, type I18n } from "../shared/i18n"
import { getLanguage } from "../shared/languages"
import type { MailContext } from "../shared/mail-context"
import type { TranslateRequest, TranslateResponse } from "../shared/messages"
import { type PromptKind, promptText } from "../shared/prompts"
import { getPreset, isAiProvider, type Tier, TIERS } from "../shared/providers"
import { type ProviderConfig, promptKindFor, type ResolvedProvider, resolveProvider, resolveProviderConfig, type Settings } from "../shared/settings"
import { cacheKey, LruCache, type PersistentCache } from "./cache"
import { Dictionary } from "./dictionary"
import { type BatchLimits, BatchQueue } from "./queue/batch-queue"
import { RequestQueue } from "./queue/request-queue"
import { bergamotTranslateBatch } from "./translators/bergamot"
import { deeplxTranslate } from "./translators/deeplx"
import { googleTranslateBatch } from "./translators/google"
import type { LlmCallOptions } from "./translators/llm"
import { BatchParseError, buildContextBlock, type MailAnalysis, MAX_PREFIX_TEXT_CHARS, parseAnalysis, type Segment } from "./translators/llm-prompt"
import { AZURE_LIMITS, microsoftTranslateBatch } from "./translators/microsoft"

type ItemResult = { ok: true; text: string } | { ok: false; error: string }

/** One paragraph for one service. */
export interface ProviderRequest {
  text: string
  /** "auto" (default) or a language code. */
  sourceLang?: string
  targetLang: string
  providerId: string
  /** AI services: which prompt; by default the one the settings call for. */
  promptKind?: PromptKind
  /** Precise mode: the message registered with setContext() and the paragraph's position in it. */
  context?: { id: string; index: number }
}

interface Job {
  text: string
  sourceLang: string
  targetLang: string
  provider: ResolvedProvider
  /** AI services: the system prompt template. */
  prompt?: string
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
  dictionary?: Pick<Dictionary, "translate">
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
  private readonly dictionary: Pick<Dictionary, "translate">

  constructor(private readonly deps: ServiceDeps) {
    this.llm = deps.llm ?? LAZY_LLM
    this.dictionary = deps.dictionary ?? new Dictionary()
    this.requestQueue = new RequestQueue({
      concurrency: () => deps.getSettings().batch.concurrency,
      maxRetries: () => deps.getSettings().batch.maxRetries,
      sleep: deps.sleep,
    })
    this.batchQueue = new BatchQueue<Job, ItemResult>({
      delayMs: () => deps.getSettings().batch.batchDelayMs,
      getKey: (job) => job.batchKey,
      getSize: (job) => job.text.length,
      limits: (job) => this.limitsFor(job.provider),
      execute: (_key, jobs) => this.executeBatch(jobs),
    })
  }

  private limitsFor(provider: ResolvedProvider): BatchLimits {
    const s = this.deps.getSettings().batch
    const preset = getPreset(provider.id)
    const user = { maxItems: s.maxItemsPerBatch, maxChars: s.maxCharsPerBatch }
    if (!preset) return user
    if (preset.kind === "llm") {
      return s.llmBatchEnabled ? user : { maxItems: 1, maxChars: Number.MAX_SAFE_INTEGER }
    }
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

  private job(req: ProviderRequest): Job {
    const settings = this.deps.getSettings()
    const provider = resolveProvider(settings, req.providerId)
    const sourceLang = req.sourceLang ?? "auto"
    const kind = isAiProvider(getPreset(req.providerId)) ? (req.promptKind ?? promptKindFor(settings)) : undefined
    const prompt = kind ? promptText(settings.prompts, kind) : undefined
    const context = kind === "precise" && req.context ? this.contexts.get(req.context.id) : undefined
    // The prompt, and in precise mode the message, keep cache entries and batches apart.
    const promptSig = kind ? `${kind}:${hashText(prompt!)}${context ? `:${context.id}` : ""}` : ""
    return {
      text: req.text,
      sourceLang,
      targetLang: req.targetLang,
      provider,
      prompt,
      key: cacheKey(req.providerId, provider.model, `${sourceLang}>${req.targetLang}`, req.text, promptSig),
      batchKey: [req.providerId, provider.model, provider.baseURL, sourceLang, req.targetLang, promptSig, provider.mode].join("|"),
      ...(context && req.context ? { mail: { context, index: req.context.index } } : {}),
    }
  }

  async translate(req: ProviderRequest): Promise<string> {
    return this.run(this.job(req))
  }

  /** The cached result, or the job's place in a batch. */
  private async run(job: Job): Promise<string> {
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
    const jobs: [Tier, Job][] = []
    for (const tier of TIERS) {
      const providerId = settings.tiers[tier]
      if (!providerId || !req.tiers.includes(tier)) continue
      try {
        jobs.push([tier, this.job({ ...req, providerId })])
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
    const results = await this.executeBatch([{ text: sample, sourceLang: "auto", targetLang, provider, prompt, batchKey: "test", key: "" }])
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
      const analysis = await this.requestQueue.run(() => this.llm.analyze(job.mail!.context.text, this.llmOptions(job)))
      if (analysis) await this.deps.cache.set(key, JSON.stringify(analysis))
      return analysis
    } catch {
      // Translation goes on without the analysis; the requests still carry the neighbouring paragraphs.
      return null
    }
  }

  private async executeBatch(jobs: Job[]): Promise<ItemResult[]> {
    const first = jobs[0]
    // Jobs carry a resolved provider, and resolving fails for unknown presets.
    const preset = getPreset(first.provider.id)!
    const lang = getLanguage(first.targetLang)
    const source = first.sourceLang === "auto" ? undefined : getLanguage(first.sourceLang)
    const texts = jobs.map((j) => j.text)
    const fetchFn = this.deps.fetchFn

    const failAll = (error: unknown): ItemResult[] => jobs.map(() => ({ ok: false, error: this.errorMessage(error, first.provider) }))
    /** One request for the whole batch. */
    const all = (fn: () => Promise<string[]>): Promise<ItemResult[]> =>
      this.requestQueue.run(fn).then((out) => out.map((text): ItemResult => ({ ok: true, text })), failAll)
    /** One request per paragraph. */
    const each = (fn: (job: Job) => Promise<string>): Promise<ItemResult[]> =>
      Promise.all(
        jobs.map((job) =>
          this.requestQueue.run(() => fn(job)).then(
            (text): ItemResult => ({ ok: true, text }),
            (error): ItemResult => ({ ok: false, error: this.errorMessage(error, job.provider) }),
          ),
        ),
      )

    switch (preset.kind) {
      case "dictionary":
        return all(() => this.dictionary.translate(texts, first.sourceLang, first.targetLang))
      case "bergamot":
        return all(() => bergamotTranslateBatch(texts, first.sourceLang, first.targetLang))
      case "google":
        return all(() => googleTranslateBatch(texts, lang.google, { fetchFn, baseURL: first.provider.baseURL, source: source?.google }))
      case "microsoft":
        return all(() => microsoftTranslateBatch(texts, lang.microsoft, { fetchFn, azure: azureConfig(first.provider), from: source?.microsoft }))
      case "deeplx": {
        // DeepL source codes have no variants: "ZH", not "ZH-HANT".
        const deeplSource = source?.deepl.split("-")[0]
        return each((job) => deeplxTranslate(job.text, lang.deepl, job.provider.baseURL, job.provider.apiKey, { fetchFn, source: deeplSource }))
      }
      case "llm": {
        const opts = this.llmOptions(first)
        if (first.mail) opts.contextPrefix = await this.contextPrefix(first)
        if (jobs.length > 1) {
          try {
            const out = await this.requestQueue.run(() => this.llm.batch(this.segments(jobs), opts))
            if (out.length === jobs.length) return out.map((text) => ({ ok: true, text }))
          } catch (error) {
            if (!(error instanceof BatchParseError)) return failAll(error)
          }
          // The merged answer did not line up: one request per paragraph.
        }
        return each((job) => this.llm.single(this.segments([job])[0], opts))
      }
    }
  }
}
