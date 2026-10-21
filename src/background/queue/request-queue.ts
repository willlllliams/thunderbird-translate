/** Concurrency-limited task runner with retry and exponential backoff. */

import { TimeoutError } from "../../shared/errors"
import { parseRetryAfter } from "../../shared/http"

/** Errors that should not be retried no matter what (bad key, bad request...). */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { name?: string; status?: number; statusCode?: number; isRetryable?: boolean }
  if (typeof e.isRetryable === "boolean") return e.isRetryable
  const status = e.status ?? e.statusCode
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500
  // Network failures arrive as NetworkError (fetchOk()) or APICallError (AI SDK), timeouts as TimeoutError, each saying
  // whether it is retryable; anything else (a TypeError of an address that is no URL, a bug) fails the same way again.
  return false
}

export function backoffDelay(attempt: number, baseMs = 500, maxMs = 8000, random: () => number = Math.random): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt)
  // Full jitter in [exp/2, exp].
  return Math.round(exp / 2 + (random() * exp) / 2)
}

/** The longest wait a server may ask for before an attempt again; asked for longer (a daily quota spent), the request fails at once. */
const MAX_RETRY_AFTER_MS = 30_000

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
  /**
   * Retries after a timeout, within maxRetries; 1 when absent. AI services
   * get 0: a model that was too slow once is too slow again, and every
   * attempt is charged.
   */
  timeoutRetries?: number
  /** The starts of two attempts lie at least this far apart (ms): the rate limit of a service such as Baidu's standard edition, 1 request per second. None when absent. */
  minIntervalMs?: () => number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export class RequestQueue {
  private running = 0
  private waiting: (() => void)[] = []
  private readonly sleep: (ms: number) => Promise<void>
  /** Start of the latest attempt, and the turn of the attempts that wait for minIntervalMs. */
  private lastStart = -Infinity
  private turn = Promise.resolve()

  constructor(private readonly options: RequestQueueOptions) {
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  /** Waits until minIntervalMs has passed since the start of the previous attempt; the attempts start in the order they asked. */
  private spaced(): Promise<void> {
    const interval = this.options.minIntervalMs?.() ?? 0
    if (interval <= 0) return Promise.resolve()
    const now = this.options.now ?? Date.now
    this.turn = this.turn.then(async () => {
      const wait = this.lastStart + interval - now()
      if (wait > 0) await this.sleep(wait)
      this.lastStart = now()
    })
    return this.turn
  }

  get activeCount(): number {
    return this.running
  }

  /** Run `task`, again after a retryable failure. A timeout that ends the attempts names the time of all timed-out attempts. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    const maxRetries = this.options.maxRetries()
    let timeoutRetries = this.options.timeoutRetries ?? 1
    let waited = 0
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.withSlot(task)
      } catch (error) {
        if (error instanceof TimeoutError) {
          waited += error.ms
          if (attempt >= maxRetries || timeoutRetries-- <= 0) throw waited === error.ms ? error : new TimeoutError(error.service, waited)
        } else if (attempt >= maxRetries || !isRetryableError(error)) {
          throw error
        }
        const retryAfter = retryAfterOf(error)
        if (retryAfter !== undefined && retryAfter > MAX_RETRY_AFTER_MS) throw error
        const delay = retryAfter && retryAfter > 0 ? retryAfter : backoffDelay(attempt, this.options.baseDelayMs)
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
      await this.spaced()
      return await task()
    } finally {
      this.release()
    }
  }
}
