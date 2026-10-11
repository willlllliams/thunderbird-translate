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

import { LocalizedError } from "../../shared/errors"
import { type FetchOptions, fetchOk, type RequestSpec } from "../queue/request-queue"

const DEFAULT_BASE = "https://translate.googleapis.com"

interface GoogleOptions extends FetchOptions {
  baseURL?: string
  /** Source language code; absent = "auto". */
  source?: string
}

function formPost(baseURL: string, path: string, params: Record<string, string>, body: string): RequestSpec {
  return {
    url: `${baseURL.replace(/\/+$/, "")}/${path}?${new URLSearchParams(params).toString()}`,
    init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body },
  }
}

export function buildGoogleBatchRequest(texts: string[], targetLang: string, { baseURL = DEFAULT_BASE, source = "auto" }: GoogleOptions = {}): RequestSpec {
  const body = texts.map((t) => `q=${encodeURIComponent(t)}`).join("&")
  return formPost(baseURL, "translate_a/t", { client: "gtx", sl: source, tl: targetLang, format: "text" }, body)
}

/**
 * Response shapes observed for translate_a/t:
 * - sl=auto:            [["译文", "en"], ["译文2", "en"]]
 * - explicit sl:        ["译文", "译文2"]
 * - some single-q cases: "译文"
 */
export function parseGoogleBatchResponse(json: unknown, expected: number): string[] {
  const list = typeof json === "string" ? [json] : json
  if (!Array.isArray(list)) throw new LocalizedError("errUnexpectedResponse", ["Google"])
  const out = list.map((entry, i) => {
    if (typeof entry === "string") return entry
    if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0]
    throw new LocalizedError("errMissingTranslation", ["Google", String(i + 1)])
  })
  if (out.length !== expected) {
    throw new LocalizedError("errResultCount", ["Google", String(expected), String(out.length)])
  }
  return out
}

function buildGoogleSingleRequest(text: string, targetLang: string, { baseURL = DEFAULT_BASE, source = "auto" }: GoogleOptions): RequestSpec {
  return formPost(baseURL, "translate_a/single", { client: "gtx", sl: source, tl: targetLang, dt: "t", dj: "0" }, `q=${encodeURIComponent(text)}`)
}

/** translate_a/single: [[["句1","src1",...],["句2","src2",...]], null, "en", ...] */
export function parseGoogleSingleResponse(json: unknown): string {
  if (!Array.isArray(json) || !Array.isArray(json[0])) throw new LocalizedError("errUnexpectedResponse", ["Google"])
  return (json[0] as unknown[])
    .filter(Array.isArray)
    .map((chunk) => (typeof chunk[0] === "string" ? chunk[0] : ""))
    .join("")
}

export async function googleTranslateBatch(texts: string[], targetLang: string, opts: GoogleOptions = {}): Promise<string[]> {
  if (texts.length === 0) return []
  const resp = await fetchOk(opts.fetchFn, buildGoogleBatchRequest(texts, targetLang, opts), "Google")
  const json = await resp.json()
  try {
    return parseGoogleBatchResponse(json, texts.length)
  } catch {
    // Shape drift: translate paragraph by paragraph instead.
    return Promise.all(texts.map((t) => googleTranslateSingle(t, targetLang, opts)))
  }
}

async function googleTranslateSingle(text: string, targetLang: string, opts: GoogleOptions): Promise<string> {
  const resp = await fetchOk(opts.fetchFn, buildGoogleSingleRequest(text, targetLang, opts), "Google")
  return parseGoogleSingleResponse(await resp.json())
}
