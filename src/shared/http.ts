/** fetch() with classified errors (network, timeout, HTTP status), shared by the translators and the downloads. */

import { type ErrorText, LocalizedError, NetworkError, renderErrorText, TimeoutError } from "./errors"
import { ENGLISH } from "./i18n"

/**
 * A signal that aborts after `ms` with a DOMException named TimeoutError,
 * as AbortSignal.timeout() does, but timed by the global setTimeout, which
 * tests with fake timers control. `clear()` stops the timer once the work
 * has ended, so no timer outlives its request.
 */
export function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

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

/** Retry-After header value: delay in seconds or an HTTP date (RFC 9110, section 10.2.3), in ms. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

/** Whether `url` is an http or https address with a host; "localhost:1188/x" is not, its scheme being "localhost:". */
function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname !== ""
  } catch {
    return false
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
  /** A request without an answer after this long fails with TimeoutError; none when absent. */
  timeoutMs?: number
}

/**
 * fetch() that reports a failed connection as NetworkError (with the URL),
 * no complete answer within `timeoutMs` as TimeoutError, and a non-2xx
 * answer as HttpError (with status, Retry-After, URL and body). With
 * `timeoutMs`, the body, of an error as well, is read within it before the response is returned.
 */
export async function fetchOk({ fetchFn, timeoutMs }: FetchOptions, { url, init }: RequestSpec, label: string): Promise<Response> {
  // An address that is no http(s) URL never connects: it says so, instead of failing as a network error that is retried.
  if (!isHttpUrl(url)) throw new LocalizedError("errEndpointInvalid", [label])
  const timeout = timeoutMs ? timeoutSignal(timeoutMs) : undefined
  const signal = timeout?.signal
  let resp: Response
  try {
    resp = await (fetchFn ?? fetch)(url, signal ? { ...init, signal } : init)
    if (signal) {
      // The timeout covers the body as well, of an error too: read it here, where an expired signal becomes a TimeoutError.
      const body = await resp.arrayBuffer()
      // An empty body stays null: a 204 answer may not carry one.
      resp = new Response(body.byteLength ? body : null, resp)
    }
  } catch (error) {
    throw signal?.aborted ? new TimeoutError(label, timeoutMs!) : new NetworkError(url, error)
  } finally {
    timeout?.clear()
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
