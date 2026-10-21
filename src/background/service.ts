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
 * when the message does not fit into one request. A retranslation
 * (bypassCache) asks every tier again: neither the cache nor a running
 * request answers, the new results replace the cached ones, and in precise
 * mode the message is analysed again. Only the request that started last for
 * a paragraph or an analysis writes the cache, so an older answer arriving
 * late does not replace a retranslation. A dictionary or Bergamot result is
 * cached only when the installed packs or models are still those it started
 * with: a pack installed or removed meanwhile would otherwise leave a result
 * of the old data under the key of the new data.
 */

import { getBergamot } from "../offline/bergamot"
import { describeError, type ErrorContext, LocalizedError, type MissingData, missingData } from "../shared/errors"
import { patternHost, providerOrigin, requestUrl } from "../shared/hosts"
import { hashText } from "../shared/hash"
import { ENGLISH, type I18n } from "../shared/i18n"
import { detectSourceLanguage, type LanguageDetector } from "../shared/lang-detect"
import { appLang, findLanguage, getLanguage, languageTag } from "../shared/languages"
import type { MailContext } from "../shared/mail-context"
import type { TranslateRequest, TranslateResponse } from "../shared/messages"
import { promptText } from "../shared/prompts"
import { outputLimit } from "../shared/thinking"
import { getPreset, providerDisplayName, type Tier, TIERS } from "../shared/providers"
import { hasConsent, isOnlineService, type ProviderConfig, type ResolvedProvider, resolveProvider, resolveProviderConfig, resultInputs, type Settings } from "../shared/settings"
import type { SummaryResponse } from "../shared/summary"
import { cacheKey, LruCache, type PersistentCache } from "./cache"
import { Dictionary } from "../offline/dictionary"
import { type BatchLimits, BatchQueue, joinParts, splitText } from "./queue/batch-queue"
import { RequestQueue } from "./queue/request-queue"
import { buildSummaryPrompt, type MailHeader, parseSummary, summaryInputs } from "./summary"
import { BAIDU_LIMITS, baiduTranslateBatch, baiduTranslateSingle } from "./translators/baidu"
import { bergamotTranslateBatch } from "./translators/bergamot"
import { caiyunTranslateBatch } from "./translators/caiyun"
import { deeplTranslateBatch, deeplUsage } from "./translators/deepl"
import { deeplxTranslate } from "./translators/deeplx"
import { googleTranslateBatch, googleTranslateSingle } from "./translators/google"
import type { ImageAnswer, ImageInput, LlmCallOptions } from "./translators/llm"
import { BatchParseError } from "./translators/common"
import { buildContextBlock, type MailAnalysis, MAX_PREFIX_TEXT_CHARS, parseAnalysis, type Segment } from "./translators/llm-prompt"
import { AZURE_LIMITS, microsoftTranslateBatch } from "./translators/microsoft"
import { youdaoTranslateBatch } from "./translators/youdao"

/** Result of one paragraph; a failure for lack of a dictionary pack or offline model names what is missing. */
type ItemResult = { ok: true; text: string } | { ok: false; error: string; missing?: MissingData }

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
  /** Retranslation: neither the cache nor a running request answers; the result replaces the cached one. */
  fresh?: boolean
  /** Dictionary and Bergamot: the signature of the installed data when the job started, and how to read it again. */
  data?: OfflineData
  /** The built-in sample of an extension page or a connection test, not a message: it needs no consent. */
  sample?: boolean
  /** Aborted once no page waits for the result any more (the tab closed, another message is shown): the job is dropped before its request goes out. */
  signal?: AbortSignal
}

/** A request that runs for a cache key, and the pages that wait for it: when the last of them goes away, `controller` aborts it. */
interface Running {
  promise: Promise<string>
  waiting: number
  controller: AbortController
}

/** The error of a job no page waits for any more; it is not retried. */
const aborted = () => new DOMException("No page waits for the translation any more.", "AbortError")

/** The installed data an offline service translates with, as part of the cache key. */
interface OfflineData {
  signature: string
  current: () => Promise<string>
}

/** Hard caps of the machine translators, applied on top of the user's batch settings. Microsoft with a key and Baidu have caps of their own. */
const FREE_LIMITS: Record<string, BatchLimits> = {
  dictionary: { maxItems: 100, maxChars: 50000 },
  bergamot: { maxItems: 100, maxChars: 5000 },
  google: { maxItems: 100, maxChars: 5000 },
  microsoft: { maxItems: 100, maxChars: 5000 },
  deeplx: { maxItems: 50, maxChars: 5000 },
  // The request body may have 128 KiB; 30000 characters of up to 4 bytes in UTF-8 leave room for the JSON around them.
  deepl: { maxItems: 50, maxChars: 30000 },
  youdao: { maxItems: 50, maxChars: 5000 },
  // Its old documentation suggests 20 to 40 sentences per request and names no character limit.
  caiyun: { maxItems: 40, maxChars: 5000 },
}

/** Messages kept for precise mode; a message is registered again when it is translated again. */
const MAX_CONTEXTS = 20

/** Local models (Ollama, LM Studio) and models that reason first answer slowly: their requests get this multiple of the request timeout. */
const SLOW_MODEL_TIMEOUT_FACTOR = 3

export interface LlmImpl {
  batch: (segments: Segment[], opts: LlmCallOptions) => Promise<string[]>
  single: (segment: Segment, opts: LlmCallOptions) => Promise<string>
  analyze: (text: string, opts: LlmCallOptions) => Promise<MailAnalysis | null>
  summarize: (prompt: string, opts: LlmCallOptions) => Promise<string>
  readImage: (image: ImageInput, text: string, opts: LlmCallOptions) => Promise<ImageAnswer>
}

/** The AI SDK, loaded with the first AI request: the background script starts without it (scripts/build.mjs makes it a chunk). */
const loadLlm = () => import("./translators/llm")
export const LAZY_LLM: LlmImpl = {
  batch: async (segments, opts) => (await loadLlm()).llmTranslateBatch(segments, opts),
  single: async (segment, opts) => (await loadLlm()).llmTranslateSingle(segment, opts),
  analyze: async (text, opts) => (await loadLlm()).llmAnalyzeMail(text, opts),
  summarize: async (prompt, opts) => (await loadLlm()).llmSummarize(prompt, opts),
  readImage: async (image, text, opts) => (await loadLlm()).llmReadImage(image, text, opts),
}

export interface ServiceDeps {
  getSettings: () => Settings
  cache: PersistentCache
  fetchFn?: typeof fetch
  /** Injection points for tests; a call of the AI SDK left out of `llm` loads the AI SDK. */
  llm?: Partial<LlmImpl>
  dictionary?: Pick<Dictionary, "translate" | "signature">
  /** Detector of sourceDetector() for the offline models and the batches of Baidu, with source language "auto". */
  detect?: LanguageDetector
  sleep?: (ms: number) => Promise<void>
  /** Language of error messages; English when absent. */
  i18n?: () => I18n
  /** Whether the extension may connect to a host (a match pattern such as "https://example.com/*"); every host when absent. */
  hasOrigin?: (origin: string) => Promise<boolean>
}

/** Hash of everything besides the text and the languages that shapes a result: the parts of resultInputs() and the signature of the installed offline data. */
const variantOf = (parts: readonly unknown[], signature = "") => hashText([...parts, signature].join("\n"))

/** Cache key of the analysis of a message for precise translation. */
const analysisKey = (provider: ResolvedProvider, languages: string, text: string, variant: string) => cacheKey(provider.id, provider.model, languages, text, `${variant}:analysis`)

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

export class TranslationService {
  /** One request queue per provider: its concurrency limit and retries apply to that provider only. */
  private readonly queues = new Map<string, RequestQueue>()
  private readonly batchQueue: BatchQueue<Job, ItemResult>
  private readonly inflight = new Map<string, Running>()
  /** The request that started last for each cache key of a running request: only its result is cached. */
  private readonly writers = new Map<string, symbol>()
  private readonly contexts = new LruCache<MailContext>(MAX_CONTEXTS)
  /** Analyses by cache key, finished or running, so the batches of one message share one request. */
  private readonly analyses = new LruCache<Promise<MailAnalysis | null>>(MAX_CONTEXTS)
  /** Messages registered for a retranslation, by context id: their next analysis is made again. */
  private readonly freshContexts = new LruCache<true>(MAX_CONTEXTS)
  private readonly llm: LlmImpl
  private readonly dictionary: Pick<Dictionary, "translate" | "signature">

  constructor(private readonly deps: ServiceDeps) {
    this.llm = { ...LAZY_LLM, ...deps.llm }
    this.dictionary = deps.dictionary ?? new Dictionary()
    this.batchQueue = new BatchQueue<Job, ItemResult>({
      delayMs: () => deps.getSettings().batch.batchDelayMs,
      getKey: (job) => job.batchKey,
      getSize: (job) => job.text.length,
      limits: (job) => this.limitsFor(job.provider),
      dropped: (job) => job.signal?.aborted === true,
      dropError: aborted,
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
        timeoutRetries: getPreset(provider.id)?.kind === "llm" ? 0 : 1,
        // The requests per second of the edition of a Baidu account.
        minIntervalMs: () => (getPreset(provider.id)?.kind === "baidu" ? BAIDU_LIMITS[resolveProvider(this.deps.getSettings(), provider.id).edition].intervalMs : 0),
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
    const cap = provider.mode === "key" ? AZURE_LIMITS : preset.kind === "baidu" ? BAIDU_LIMITS[provider.edition] : FREE_LIMITS[preset.kind]
    return { maxItems: Math.min(cap.maxItems, user.maxItems), maxChars: Math.min(cap.maxChars, user.maxChars) }
  }

  private errorMessage(error: unknown, provider?: ResolvedProvider): string {
    return describeError(error, this.deps.i18n?.() ?? ENGLISH, provider ? errorContext(provider) : {})
  }

  /** Precise mode: register a message before its paragraphs are requested; for a retranslation (fresh) its analysis is made again. */
  setContext(context: MailContext, fresh = false): void {
    this.contexts.set(context.id, context)
    if (fresh) this.freshContexts.set(context.id, true)
  }

  /**
   * Throws errConsentRequired unless the user allows `providerId` to receive message text now. Checked when a
   * paragraph arrives and again when its request leaves the queue: the user may have taken the consent back meanwhile.
   */
  private assertConsent(providerId: string, sample = false): void {
    if (sample || !isOnlineService(providerId) || hasConsent(this.deps.getSettings(), "onlineConsent", providerId)) return
    throw new LocalizedError("errConsentRequired", [providerDisplayName(getPreset(providerId)!, this.deps.i18n?.() ?? ENGLISH)])
  }

  /** The work of one tier for one paragraph. `data`: the dictionary packs or offline models the service translates with. */
  private job(req: TranslateRequest, providerId: string, settings: Settings, data?: OfflineData, sample = false): Job {
    const { provider, kind, prompt, parts } = resultInputs(settings, providerId)
    const context = kind === "precise" && req.context ? this.contexts.get(req.context.id) : undefined
    // Everything besides the text that shapes the result keeps cache entries and batches apart.
    const variant = variantOf(parts, data?.signature)
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
      ...(req.bypassCache ? { fresh: true } : {}),
      ...(data ? { data } : {}),
      ...(sample ? { sample } : {}),
    }
  }

  /**
   * Baidu detects one language for a whole request, not one per line: with source language "auto", the paragraphs go
   * in batches of the language detected here, and "from" stays "auto". "?" groups the paragraphs no detector places.
   */
  private async baiduGroup(text: string): Promise<string> {
    const detected = await detectSourceLanguage(text, this.deps.detect).catch(() => null)
    const lang = detected ? appLang(languageTag(detected)) : ""
    return findLanguage(lang)?.baidu ? lang : "?"
  }

  /** Throws errEndpointInvalid for an endpoint that is no http(s) URL, errHostPermission when the extension may not connect to it. */
  private async checkOrigin(provider: ResolvedProvider): Promise<void> {
    const origin = providerOrigin(provider)
    if (!origin && requestUrl(provider)) throw new LocalizedError("errEndpointInvalid", [providerDisplayName(getPreset(provider.id)!, this.deps.i18n?.() ?? ENGLISH)])
    if (!origin || !this.deps.hasOrigin) return
    const allowed = await this.deps.hasOrigin(origin).catch(() => false)
    if (!allowed) throw new LocalizedError("errHostPermission", [patternHost(origin)])
  }

  /**
   * The cached result, or the result of the running request for the same paragraph, or a new one. A retranslation
   * always makes a new one, which later requests share. The request is dropped before it goes out once every page
   * that waits for it went away (`job.signal`).
   */
  private async run(job: Job): Promise<string> {
    const cached = job.fresh ? undefined : await this.deps.cache.get(job.key)
    if (cached !== undefined) return cached
    let running = job.fresh ? undefined : this.inflight.get(job.key)
    // A request whose pages all went away fails; a page that asks now gets a request of its own.
    if (running?.controller.signal.aborted) running = undefined
    if (!running) {
      const controller = new AbortController()
      const entry: Running = { promise: Promise.resolve(""), waiting: 0, controller }
      entry.promise = this.latest(job.key, () => this.translateParts({ ...job, signal: controller.signal }), (text) => this.store(job, text)).finally(() => {
        if (this.inflight.get(job.key) === entry) this.inflight.delete(job.key)
      })
      this.inflight.set(job.key, (running = entry))
    }
    const entry = running
    entry.waiting++
    const leave = () => {
      if (--entry.waiting === 0) entry.controller.abort()
    }
    if (job.signal?.aborted) leave()
    else job.signal?.addEventListener("abort", leave, { once: true })
    return entry.promise.finally(() => job.signal?.removeEventListener("abort", leave))
  }

  /** Run a request for a cache key and cache its result, unless a request for the same key started after it: an older answer that arrives late does not replace a retranslation. */
  private async latest<T>(key: string, request: () => Promise<T>, store: (value: T) => Promise<void> | undefined): Promise<T> {
    const self = Symbol(key)
    this.writers.set(key, self)
    try {
      const value = await request()
      if (this.writers.get(key) === self) await store(value)
      return value
    } finally {
      if (this.writers.get(key) === self) this.writers.delete(key)
    }
  }

  /** Cache a result, unless the installed data of an offline service changed while it was translated. */
  private async store(job: Job, text: string): Promise<void> {
    if (job.data && (await job.data.current().catch(() => "")) !== job.data.signature) return
    await this.deps.cache.set(job.key, text)
  }

  /** The paragraph in pieces within the batch limit, translated and put together again. */
  private async translateParts(job: Job): Promise<string> {
    const parts = splitText(job.text, this.limitsFor(job.provider).maxChars)
    // A part without text holds the whitespace at the start of the paragraph; joinParts() puts it back.
    const results = await Promise.all(parts.map(({ text }): ItemResult | Promise<ItemResult> => (text ? this.batchQueue.enqueue({ ...job, text }) : { ok: true, text: "" })))
    const texts = results.map((result) => {
      if (!result.ok) throw Object.assign(new Error(result.error), { missing: result.missing })
      return result.text
    })
    return joinParts(parts, texts, job.targetLang)
  }

  private async settle(job: Job): Promise<TranslateResponse> {
    try {
      return { ok: true, text: await this.run(job) }
    } catch (error) {
      return this.failure(error)
    }
  }

  /** A failed result; one caused by a missing pack or model says which. */
  private failure(error: unknown, provider?: ResolvedProvider): { ok: false; error: string; missing?: MissingData } {
    const missing = missingData(error)
    return { ok: false, error: this.errorMessage(error, provider), ...(missing ? { missing } : {}) }
  }

  /**
   * Translation of a paragraph on screen: every requested tier that has a
   * service runs at once and reports its result through onTier as soon as it
   * is there. When the highest of these tiers has its result in the cache,
   * only that result is reported. An online service the user has not
   * allowed to receive message text (Settings.onlineConsent) gets nothing,
   * and its tier fails with errConsentRequired; `sample`: the text is the
   * built-in sample of an extension page, not a message, and needs no consent.
   */
  async translateForPage(req: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void, { sample = false, signal }: { sample?: boolean; signal?: AbortSignal } = {}): Promise<void> {
    const settings = this.deps.getSettings()
    const tiers = TIERS.filter((tier) => settings.tiers[tier] && req.tiers.includes(tier))
    const data: Partial<Record<Tier, OfflineData>> = {}
    for (const tier of tiers) {
      const kind = getPreset(settings.tiers[tier]!)?.kind
      const current = kind === "dictionary" ? () => this.dictionary.signature() : kind === "bergamot" ? () => getBergamot().signature() : undefined
      if (current) data[tier] = { signature: await current().catch(() => ""), current }
    }
    const jobs: [Tier, Job][] = []
    for (const tier of tiers) {
      try {
        const id = settings.tiers[tier]!
        this.assertConsent(id, sample)
        const job = { ...this.job(req, id, settings, data[tier], sample), ...(signal ? { signal } : {}) }
        if (req.sourceLang === "auto" && getPreset(id)?.kind === "baidu") job.batchKey += `|auto:${await this.baiduGroup(req.text)}`
        await this.checkOrigin(job.provider)
        jobs.push([tier, job])
      } catch (error) {
        onTier(tier, { ok: false, error: this.errorMessage(error) })
      }
    }
    const top = jobs.at(-1)
    if (!top) return
    const cached = req.bypassCache ? undefined : await this.deps.cache.get(top[1].key)
    if (cached !== undefined) return onTier(top[0], { ok: true, text: cached })
    await Promise.all(jobs.map(async ([tier, job]) => onTier(tier, await this.settle(job))))
  }

  /** Translate with an unsaved configuration, bypassing cache and batching. */
  async testProvider(providerId: string, config: Omit<ProviderConfig, "enabled">, targetLang: string): Promise<string> {
    const provider = resolveProviderConfig(providerId, config)
    await this.checkOrigin(provider)
    // DeepL tells the characters used, at no cost.
    if (getPreset(providerId)?.kind === "deepl") {
      const { used, limit } = await this.queue(provider).run(() => deeplUsage(provider, { fetchFn: this.deps.fetchFn, timeoutMs: this.timeoutMs(provider) }))
      return (this.deps.i18n?.() ?? ENGLISH).t("testDeeplUsage", [used, limit])
    }
    const sample = "Hello! This is a connection test from Multi Translate for Thunderbird."
    const prompt = promptText(this.deps.getSettings().prompts, "bilingual")
    const results = await this.executeBatch([{ text: sample, sourceLang: "auto", targetLang, provider, prompt, variant: "", batchKey: "test", key: "", sample: true }])
    const r = results[0]
    if (!r.ok) throw new Error(r.error)
    return r.text
  }

  /**
   * The summary and to-dos of a message: `text` as the content script found
   * it, `header` its sender, date and subject. The AI service of the summary
   * (summaryProvider()) gets the message once the user allowed it to receive
   * message text, with the glossary of the analysis that precise translation
   * made of the message, if there is one. An answer the summary could be
   * read from is cached; `fresh` asks again.
   */
  async summarize(text: string, header: MailHeader | null, fresh = false): Promise<SummaryResponse> {
    const settings = this.deps.getSettings()
    const i18n = this.deps.i18n?.() ?? ENGLISH
    const inputs = summaryInputs(settings)
    if (!inputs) return { ok: false, error: i18n.t("errSummaryService") }
    const { id, provider, systemPrompt, targetLanguageName } = inputs
    const service = providerDisplayName(getPreset(id)!, i18n)
    try {
      this.assertConsent(id)
      await this.checkOrigin(provider)
      const { parts, maxOutputTokens } = settings.summary
      const prompt = buildSummaryPrompt(text, header, (await this.preciseAnalysis(text, settings))?.glossary)
      const variant = hashText(inputs.parts.join("\n"))
      const key = cacheKey(`summary:${id}`, provider.model, `auto>${settings.targetLang}`, prompt, variant)
      const cached = fresh ? undefined : await this.deps.cache.get(key)
      // The setting is the length of the summary: a model that reasons first gets room for that as well.
      const opts = { provider, systemPrompt, targetLanguageName, fetchFn: this.deps.fetchFn, timeoutMs: this.timeoutMs(provider), maxOutputTokens: outputLimit(id, provider.model, provider.thinking, maxOutputTokens) }
      const raw =
        cached ??
        (await this.queue(provider).run(() => {
          this.assertConsent(id)
          return this.llm.summarize(prompt, opts)
        }))
      const summary = parseSummary(raw, parts, text)
      if (summary && cached === undefined) await this.deps.cache.set(key, raw)
      return { ok: true, service, summary, raw }
    } catch (error) {
      return { ok: false, service, error: this.errorMessage(error, provider) }
    }
  }

  /** The glossary of the analysis precise translation made of the registered message `contextId`, for its images; empty without one: no analysis is made for them. */
  async glossaryOf(contextId: string): Promise<MailAnalysis["glossary"]> {
    const context = this.contexts.get(contextId)
    return (context && (await this.preciseAnalysis(context.text, this.deps.getSettings()))?.glossary) || []
  }

  /** The analysis that precise translation made of the message `text`: finished, running or cached; null without one. */
  private async preciseAnalysis(text: string, settings: Settings): Promise<MailAnalysis | null> {
    if (!settings.precise.enabled || !settings.tiers.ai) return null
    const { provider, parts } = resultInputs(settings, settings.tiers.ai)
    const key = analysisKey(provider, `${settings.sourceLang}>${settings.targetLang}`, text, variantOf(parts))
    const known = this.analyses.get(key)
    if (known) return known
    const cached = await this.deps.cache.get(key)
    return cached === undefined ? null : parseAnalysis(cached)
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
    // The first request of a retranslation takes the mark; the requests after it share the new analysis.
    const fresh = this.freshContexts.get(context.id) !== undefined
    this.freshContexts.delete(context.id)
    const limits = this.limitsFor(job.provider)
    const chars = context.targets.reduce((n, i) => n + (context.paragraphs[i]?.length ?? 0), 0)
    if (chars <= limits.maxChars && context.targets.length <= limits.maxItems) return ""
    const analysis = await this.analysis(job, fresh)
    return buildContextBlock(analysis, context.text.length <= MAX_PREFIX_TEXT_CHARS ? context.text : "")
  }

  /** The analysis of the message, shared by the requests of one configuration (endpoint, thinking, temperature, languages). */
  private analysis(job: Job, fresh: boolean): Promise<MailAnalysis | null> {
    const key = analysisKey(job.provider, `${job.sourceLang}>${job.targetLang}`, job.mail!.context.text, job.variant)
    let analysis = fresh ? undefined : this.analyses.get(key)
    if (!analysis) {
      analysis = this.loadAnalysis(key, job, fresh)
      this.analyses.set(key, analysis)
    }
    return analysis
  }

  private async loadAnalysis(key: string, job: Job, fresh: boolean): Promise<MailAnalysis | null> {
    const cached = fresh ? undefined : await this.deps.cache.get(key)
    if (cached !== undefined) return parseAnalysis(cached)
    try {
      return await this.latest(
        key,
        () =>
          this.queue(job.provider).run(() => {
            this.assertConsent(job.provider.id, job.sample)
            return this.llm.analyze(job.mail!.context.text, this.llmOptions(job))
          }),
        (analysis) => (analysis ? this.deps.cache.set(key, JSON.stringify(analysis)) : undefined),
      )
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
    const providerQueue = this.queue(first.provider)
    // The consent is checked again as each request leaves the queue, and a batch no page waits for is dropped.
    const queue = {
      run: <T>(task: () => Promise<T>) =>
        providerQueue.run(() => {
          if (jobs.every((job) => job.signal?.aborted)) throw aborted()
          this.assertConsent(first.provider.id, first.sample)
          return task()
        }),
    }
    const texts = jobs.map((j) => j.text)
    const fetchOpts = { fetchFn: this.deps.fetchFn, timeoutMs: this.timeoutMs(first.provider) }

    const ok = (text: string): ItemResult => ({ ok: true, text })
    const fail = (error: unknown): ItemResult => this.failure(error, first.provider)
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

    // Each translator takes the languages of the extension and the provider, and makes its own codes.
    const languages = { source: first.sourceLang, target: first.targetLang }
    const p = first.provider
    switch (preset.kind) {
      case "dictionary":
        return settled(() => this.dictionary.translate(texts, languages.source, languages.target))
      case "bergamot":
        return settled(() => bergamotTranslateBatch(texts, languages.source, languages.target, this.deps.detect))
      case "google":
        return batchOrEach(() => googleTranslateBatch(texts, languages, p, fetchOpts), (job) => googleTranslateSingle(job.text, languages, p, fetchOpts))
      case "microsoft":
        return all(() => microsoftTranslateBatch(texts, languages, p, fetchOpts))
      case "deeplx":
        return each((job) => deeplxTranslate(job.text, languages, p, fetchOpts))
      case "deepl":
        return all(() => deeplTranslateBatch(texts, languages, p, fetchOpts))
      case "baidu":
        return batchOrEach(() => baiduTranslateBatch(texts, languages, p, fetchOpts), (job) => baiduTranslateSingle(job.text, languages, p, fetchOpts))
      case "youdao":
        return settled(() => youdaoTranslateBatch(texts, languages, p, fetchOpts))
      case "caiyun":
        return all(() => caiyunTranslateBatch(texts, languages, p, fetchOpts))
      case "llm": {
        const opts = this.llmOptions(first)
        if (first.mail) opts.contextPrefix = await this.contextPrefix(first)
        const single = (job: Job) => this.llm.single(this.segments([job])[0], opts)
        return jobs.length > 1 ? batchOrEach(() => this.llm.batch(this.segments(jobs), opts), single) : each(single)
      }
    }
  }
}
