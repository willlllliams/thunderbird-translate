/**
 * Google Translate through the public `client=gtx` endpoints.
 *
 * Batch path: POST translate_a/t with one `q` parameter per paragraph. One
 * HTTP request carries the whole batch and the response is an array with one
 * entry per `q`, so no separator parsing is needed.
 *
 * Fallback path: translate_a/single, one paragraph per request; the caller
 * uses it when the batch response has an unexpected shape (BatchParseError).
 */

import { LocalizedError } from "../../shared/errors"
import { type FetchOptions, type RequestSpec } from "../../shared/http"
import { findLanguage } from "../../shared/languages"
import type { ResolvedProvider } from "../../shared/settings"
import { BatchParseError, fetchJson, type Languages, readTranslations } from "./common"

const DEFAULT_BASE = "https://translate.googleapis.com"

interface GoogleOptions {
  baseURL?: string
  /** Source language code; absent = "auto". */
  source?: string
}

/** Google's codes of a request: "auto" for automatic detection. */
function googleCodes({ source, target }: Languages): { sl: string; tl: string } {
  const tl = findLanguage(target)?.google
  if (!tl) throw new LocalizedError("errUnsupportedPair", ["Google"])
  return { sl: source === "auto" ? "auto" : (findLanguage(source)?.google ?? "auto"), tl }
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
  return readTranslations("Google", typeof json === "string" ? [json] : json, expected, (entry) => (Array.isArray(entry) ? entry[0] : entry))
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

type GoogleProvider = Pick<ResolvedProvider, "baseURL">

/** One request for all texts. Throws BatchParseError when the answer has an unexpected shape. */
export async function googleTranslateBatch(texts: string[], languages: Languages, provider: GoogleProvider, opts: FetchOptions = {}): Promise<string[]> {
  if (texts.length === 0) return []
  const { sl, tl } = googleCodes(languages)
  const json = await fetchJson(opts, buildGoogleBatchRequest(texts, tl, { baseURL: provider.baseURL, source: sl }), "Google")
  try {
    return parseGoogleBatchResponse(json, texts.length)
  } catch (error) {
    throw new BatchParseError(error instanceof Error ? error.message : String(error))
  }
}

export async function googleTranslateSingle(text: string, languages: Languages, provider: GoogleProvider, opts: FetchOptions = {}): Promise<string> {
  const { sl, tl } = googleCodes(languages)
  return parseGoogleSingleResponse(await fetchJson(opts, buildGoogleSingleRequest(text, tl, { baseURL: provider.baseURL, source: sl }), "Google"))
}
