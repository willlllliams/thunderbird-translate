/**
 * Concurrency-limited task runner with retry and exponential backoff.
 */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = "HttpError"
  }
}

/** Errors that should not be retried no matter what (bad key, bad request...). */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { name?: string; status?: number; statusCode?: number; isRetryable?: boolean }
  if (e.name === "AbortError") return false
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
        const retryAfter = (error as HttpError).retryAfterMs
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

/** Throw HttpError for non-2xx responses, including Retry-After when present. */
export async function ensureOk(resp: Response, label: string): Promise<Response> {
  if (resp.ok) return resp
  const body = await resp.text().catch(() => "")
  const retryAfterHeader = resp.headers?.get?.("retry-after")
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN
  throw new HttpError(
    `${label} request failed: HTTP ${resp.status}${body ? ` - ${body.slice(0, 300)}` : ""}`,
    resp.status,
    Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : undefined,
  )
}
