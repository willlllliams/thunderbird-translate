/**
 * Translation pipeline in the background script:
 *
 *   translate(text) → cache → in-flight dedupe → BatchQueue (50 ms window)
 *     → executor per provider kind → RequestQueue (concurrency + retry)
 */

import { describeError, LocalizedError } from "../shared/errors"
import { hashText } from "../shared/hash"
import { ENGLISH, type I18n } from "../shared/i18n"
import { getLanguage } from "../shared/languages"
import { getPreset } from "../shared/providers"
import { type ProviderConfig, type ResolvedProvider, resolveProvider, resolveProviderConfig, type Settings } from "../shared/settings"
import { cacheKey, type PersistentCache } from "./cache"
import { type BatchLimits, BatchQueue } from "./queue/batch-queue"
import { RequestQueue } from "./queue/request-queue"
import { deeplxTranslate } from "./translators/deeplx"
import { googleTranslateBatch } from "./translators/google"
import { BatchParseError, llmTranslateBatch, llmTranslateSingle, type LlmCallOptions } from "./translators/llm"
import { microsoftTranslateBatch } from "./translators/microsoft"

export type ItemResult = { ok: true; text: string } | { ok: false; error: string }

interface Job {
  text: string
  targetLang: string
  provider: ResolvedProvider
  batchKey: string
}

/** Hard caps for the free endpoints, applied on top of the user's batch settings. */
const FREE_LIMITS: Record<string, BatchLimits> = {
  google: { maxItems: 100, maxChars: 5000 },
  microsoft: { maxItems: 100, maxChars: 5000 },
  deeplx: { maxItems: 50, maxChars: 5000 },
}

export interface LlmImpl {
  batch: (texts: string[], opts: LlmCallOptions) => Promise<string[]>
  single: (text: string, opts: LlmCallOptions) => Promise<string>
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

export class TranslationService {
  private readonly requestQueue: RequestQueue
  private readonly batchQueue: BatchQueue<Job, ItemResult>
  private readonly inflight = new Map<string, Promise<string>>()
  private readonly llm: LlmImpl
  /** Statistics, useful for tests and for the options page. */
  readonly stats = { requests: 0, batches: 0, fallbacks: 0 }

  constructor(private readonly deps: ServiceDeps) {
    this.llm = deps.llm ?? { batch: llmTranslateBatch, single: llmTranslateSingle }
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
    const preset = getPreset(batchKey.split("|")[0])
    const user = { maxItems: s.maxItemsPerBatch, maxChars: s.maxCharsPerBatch }
    if (!preset) return user
    if (preset.kind === "llm") {
      return s.llmBatchEnabled ? user : { maxItems: 1, maxChars: Number.MAX_SAFE_INTEGER }
    }
    const cap = FREE_LIMITS[preset.kind]
    return { maxItems: Math.min(cap.maxItems, user.maxItems), maxChars: Math.min(cap.maxChars, user.maxChars) }
  }

  private errorMessage(error: unknown): string {
    return describeError(error, this.deps.i18n?.() ?? ENGLISH)
  }

  private promptSignature(providerId: string): string {
    return getPreset(providerId)?.kind === "llm" ? hashText(this.deps.getSettings().systemPrompt) : ""
  }

  async translate(text: string, targetLang: string, providerId: string): Promise<string> {
    const settings = this.deps.getSettings()
    const provider = resolveProvider(settings, providerId)
    const promptSig = this.promptSignature(providerId)
    const key = cacheKey(providerId, provider.model, targetLang, text, promptSig)

    const cached = await this.deps.cache.get(key)
    if (cached !== undefined) return cached

    const running = this.inflight.get(key)
    if (running) return running

    const batchKey = [providerId, provider.model, provider.baseURL, targetLang, promptSig].join("|")
    const promise = this.batchQueue
      .enqueue({ text, targetLang, provider, batchKey })
      .then(async (result) => {
        if (!result.ok) throw new Error(result.error)
        await this.deps.cache.set(key, result.text)
        return result.text
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, promise)
    return promise
  }

  /** Translate with an unsaved configuration, bypassing cache and batching. */
  async testProvider(providerId: string, config: ProviderConfig, targetLang: string): Promise<string> {
    const provider = resolveProviderConfig(providerId, config)
    const sample = "Hello! This is a connection test from Thunderbird Translate."
    const results = await this.executeBatch([{ text: sample, targetLang, provider, batchKey: "test" }])
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
        return jobs.map(() => ({ ok: false, error: this.errorMessage(error) }))
      }
    }
    const each = (fn: (job: Job) => Promise<string>): Promise<ItemResult[]> =>
      Promise.all(
        jobs.map((job) =>
          this.run(() => fn(job)).then(
            (text): ItemResult => ({ ok: true, text }),
            (error): ItemResult => ({ ok: false, error: this.errorMessage(error) }),
          ),
        ),
      )

    switch (preset.kind) {
      case "google":
        return all(() => this.run(() => googleTranslateBatch(texts, lang.google, { fetchFn, baseURL: first.provider.baseURL })))
      case "microsoft":
        return all(() => this.run(() => microsoftTranslateBatch(texts, lang.microsoft, { fetchFn })))
      case "deeplx":
        return each((job) => deeplxTranslate(job.text, lang.deepl, job.provider.baseURL, job.provider.apiKey, { fetchFn }))
      case "llm": {
        const opts = this.llmOptions(first)
        if (jobs.length > 1) {
          try {
            const out = await this.run(() => this.llm.batch(texts, opts))
            if (out.length === jobs.length) return out.map((text) => ({ ok: true, text }))
          } catch (error) {
            if (!(error instanceof BatchParseError)) {
              return jobs.map(() => ({ ok: false, error: this.errorMessage(error) }))
            }
          }
          // The merged answer did not line up: one request per paragraph.
          this.stats.fallbacks++
        }
        return each((job) => this.llm.single(job.text, opts))
      }
    }
  }
}
