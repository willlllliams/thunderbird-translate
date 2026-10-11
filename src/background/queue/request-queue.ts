/**
 * Concurrency-limited task runner with retry and exponential backoff, and
 * the fetch() wrapper whose errors it classifies.
 */

import { type ErrorText, NetworkError, renderErrorText } from "../../shared/errors"
import { ENGLISH } from "../../shared/i18n"

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
    /** Translatable form of the message, see shared/errors.ts. */
    readonly i18nText?: ErrorText,
    /** Request details for describeError(). */
    readonly url?: string,
    readonly responseBody?: string,
    readonly statusText?: string,
  ) {
    super(message)
    this.name = "HttpError"
  }
}

/** Errors that should not be retried no matter what (bad key, bad request...). */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { name?: string; status?: number; statusCode?: number; isRetryable?: boolean }
  if (typeof e.isRetryable === "boolean") return e.isRetryable
  const status = e.status ?? e.statusCode
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500
  // fetch() network failures surface as TypeError.
  return e.name === "TypeError"
}

export function backoffDelay(attempt: number, baseMs = 500, maxMs = 8000, random: () => number = Math.random): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt)
  // Full jitter in [exp/2, exp].
  return Math.round(exp / 2 + (random() * exp) / 2)
}

/** Retry-After header value: delay in seconds or an HTTP date (RFC 9110, section 10.2.3), in ms. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

/** Wait requested by the server: HttpError of fetchOk(), or the response headers of an AI SDK APICallError. */
function retryAfterOf(error: unknown): number | undefined {
  const e = error as { retryAfterMs?: number; responseHeaders?: Record<string, string> }
  if (e.retryAfterMs !== undefined) return e.retryAfterMs
  const headers = e.responseHeaders
  if (!headers) return undefined
  const ms = Number(headers["retry-after-ms"])
  return Number.isFinite(ms) && ms > 0 ? ms : parseRetryAfter(headers["retry-after"])
}

export interface RequestQueueOptions {
  concurrency: () => number
  maxRetries: () => number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export class RequestQueue {
  private running = 0
  private waiting: (() => void)[] = []
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly options: RequestQueueOptions) {
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  get activeCount(): number {
    return this.running
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    const maxRetries = this.options.maxRetries()
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.withSlot(task)
      } catch (error) {
        if (attempt >= maxRetries || !isRetryableError(error)) throw error
        const retryAfter = retryAfterOf(error)
        const delay = retryAfter && retryAfter > 0 ? Math.min(retryAfter, 30000) : backoffDelay(attempt, this.options.baseDelayMs)
        await this.sleep(delay)
      }
    }
  }

  private acquire(): Promise<void> {
    if (this.running < Math.max(1, this.options.concurrency())) {
      this.running++
      return Promise.resolve()
    }
    // The slot is handed over directly by release(), so `running` stays exact.
    return new Promise<void>((resolve) => this.waiting.push(resolve))
  }

  private release(): void {
    const next = this.waiting.shift()
    if (next) next()
    else this.running--
  }

  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }
}

/** An HTTP request of a translator, built by a pure function so tests can inspect it. */
export interface RequestSpec {
  url: string
  init: RequestInit & { method: string; headers: Record<string, string>; body?: string }
}

export interface FetchOptions {
  /** Injection point for tests; the global fetch otherwise. */
  fetchFn?: typeof fetch
}

/**
 * fetch() that reports a failed connection as NetworkError (with the URL)
 * and a non-2xx answer as HttpError (with status, Retry-After, URL and body).
 */
export async function fetchOk(fetchFn: typeof fetch | undefined, { url, init }: RequestSpec, label: string): Promise<Response> {
  let resp: Response
  try {
    resp = await (fetchFn ?? fetch)(url, init)
  } catch (error) {
    throw new NetworkError(url, error)
  }
  if (resp.ok) return resp
  const body = await resp.text().catch(() => "")
  const text: ErrorText = { key: "errHttp", args: [label, String(resp.status)], detail: body ? body.slice(0, 300) : undefined }
  throw new HttpError(
    renderErrorText(text, ENGLISH),
    resp.status,
    parseRetryAfter(resp.headers?.get?.("retry-after")),
    text,
    resp.url || url,
    body,
    resp.statusText,
  )
}
