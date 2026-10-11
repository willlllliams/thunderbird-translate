/**
 * Google Translate through the public `client=gtx` endpoints.
 *
 * Batch path: POST translate_a/t with one `q` parameter per paragraph. One
 * HTTP request carries the whole batch and the response is an array with one
 * entry per `q`, so no separator parsing is needed.
 *
 * Fallback path: translate_a/single, one paragraph per request; used when the
 * batch response has an unexpected shape.
 */

import { ensureOk } from "../queue/request-queue"

export const GOOGLE_DEFAULT_BASE = "https://translate.googleapis.com"

export interface RequestSpec {
  url: string
  init: RequestInit & { method: string; headers: Record<string, string>; body?: string }
}

export function buildGoogleBatchRequest(texts: string[], targetLang: string, sourceLang = "auto", baseURL = GOOGLE_DEFAULT_BASE): RequestSpec {
  const params = new URLSearchParams({ client: "gtx", sl: sourceLang, tl: targetLang, format: "text" })
  const body = texts.map((t) => `q=${encodeURIComponent(t)}`).join("&")
  return {
    url: `${baseURL.replace(/\/+$/, "")}/translate_a/t?${params.toString()}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    },
  }
}

/**
 * Response shapes observed for translate_a/t:
 * - sl=auto:            [["译文", "en"], ["译文2", "en"]]
 * - explicit sl:        ["译文", "译文2"]
 * - some single-q cases: "译文"
 */
export function parseGoogleBatchResponse(json: unknown, expected: number): string[] {
  const list = typeof json === "string" ? [json] : json
  if (!Array.isArray(list)) throw new Error("Google: unexpected response format")
  const out = list.map((entry, i) => {
    if (typeof entry === "string") return entry
    if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0]
    throw new Error(`Google: unexpected entry at index ${i}`)
  })
  if (out.length !== expected) {
    throw new Error(`Google: expected ${expected} results, got ${out.length}`)
  }
  return out
}

export function buildGoogleSingleRequest(text: string, targetLang: string, sourceLang = "auto", baseURL = GOOGLE_DEFAULT_BASE): RequestSpec {
  const params = new URLSearchParams({ client: "gtx", sl: sourceLang, tl: targetLang, dt: "t", dj: "0" })
  return {
    url: `${baseURL.replace(/\/+$/, "")}/translate_a/single?${params.toString()}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `q=${encodeURIComponent(text)}`,
    },
  }
}

/** translate_a/single: [[["句1","src1",...],["句2","src2",...]], null, "en", ...] */
export function parseGoogleSingleResponse(json: unknown): string {
  if (!Array.isArray(json) || !Array.isArray(json[0])) throw new Error("Google: unexpected response format")
  return (json[0] as unknown[])
    .filter(Array.isArray)
    .map((chunk) => (typeof chunk[0] === "string" ? chunk[0] : ""))
    .join("")
}

export interface FetchOptions {
  fetchFn?: typeof fetch
  signal?: AbortSignal
  baseURL?: string
}

export async function googleTranslateBatch(texts: string[], targetLang: string, opts: FetchOptions = {}): Promise<string[]> {
  if (texts.length === 0) return []
  const f = opts.fetchFn ?? fetch
  const { url, init } = buildGoogleBatchRequest(texts, targetLang, "auto", opts.baseURL)
  const resp = await ensureOk(await f(url, { ...init, signal: opts.signal }), "Google")
  const json = await resp.json()
  try {
    return parseGoogleBatchResponse(json, texts.length)
  } catch {
    // Shape drift: translate paragraph by paragraph instead.
    return Promise.all(texts.map((t) => googleTranslateSingle(t, targetLang, opts)))
  }
}

export async function googleTranslateSingle(text: string, targetLang: string, opts: FetchOptions = {}): Promise<string> {
  const f = opts.fetchFn ?? fetch
  const { url, init } = buildGoogleSingleRequest(text, targetLang, "auto", opts.baseURL)
  const resp = await ensureOk(await f(url, { ...init, signal: opts.signal }), "Google")
  return parseGoogleSingleResponse(await resp.json())
}
