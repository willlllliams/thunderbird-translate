/**
 * Baidu Translate, general text translation (fanyi-api.baidu.com), with the
 * user's app ID and secret key.
 *
 * Request:  POST <endpoint>, form fields q, from, to, appid, salt, sign;
 *           sign = MD5(appid + q + salt + key) in lower-case hex, q not URL-encoded
 * Response: {"from": "en", "to": "zh", "trans_result": [{"src": "...", "dst": "..."}, ...]}, one entry per line of q;
 *           a failure: {"error_code": "54001", "error_msg": "Invalid Sign"}, also with HTTP 200
 *
 * The paragraphs of a batch go as the lines of one q. A line break inside a
 * paragraph travels as U+2042 (⁂) and comes back as a line break; when the
 * answer does not have one line per paragraph with its marks, the batch is
 * asked again one paragraph per request. The standard edition takes one
 * request per second and 1000 characters per request; the other editions
 * take more (service.ts). The four languages of BAIDU_PREMIUM_ONLY need the
 * premium edition. The answer has one "from" for the whole of q, so with
 * source language "auto" service.ts puts the paragraphs of each language it
 * detects in batches of their own.
 */

import { LocalizedError } from "../../shared/errors"
import { type FetchOptions, fetchOk, type RequestSpec } from "../../shared/http"
import { md5 } from "../../shared/md5"
import type { BaiduEdition, ResolvedProvider } from "../../shared/settings"
import type { BatchLimits } from "../queue/batch-queue"
import { type CodeMeaning, codeError } from "./codes"
import { BatchParseError } from "./llm-prompt"

type BaiduProvider = Pick<ResolvedProvider, "apiKey" | "appId" | "baseURL" | "edition">

const SERVICE = "Baidu"

/** Baidu's codes of the languages of the extension. */
export const BAIDU_LANGS: Record<string, string> = {
  "zh-CN": "zh",
  "zh-TW": "cht",
  en: "en",
  ja: "jp",
  ko: "kor",
  fr: "fra",
  de: "de",
  es: "spa",
  pt: "pt",
  it: "it",
  ru: "ru",
  uk: "ukr",
  pl: "pl",
  nl: "nl",
  tr: "tr",
  vi: "vie",
  th: "th",
  id: "id",
  ar: "ara",
  hi: "hi",
}

/** Languages outside Baidu's 28 common ones: only the premium edition translates them, the others answer 58001. */
export const BAIDU_PREMIUM_ONLY: readonly string[] = ["uk", "tr", "id", "hi"]

const CODES: Partial<Record<string, CodeMeaning>> = {
  "52001": "retry",
  "52002": "retry",
  "52003": "key",
  "54001": "key",
  "90107": "key",
  "54003": "rate",
  "54005": "rate",
  "54004": "quota",
  "58001": "pair",
  "58003": "ip",
}

/**
 * Per edition (fanyi-api.baidu.com pricing): characters per request, less one
 * line break per paragraph, and the time between the starts of two requests
 * for 1, 10 and 100 requests per second.
 */
export const BAIDU_LIMITS: Record<BaiduEdition, BatchLimits & { intervalMs: number }> = {
  standard: { maxItems: 50, maxChars: 1000 - 50, intervalMs: 1100 },
  advanced: { maxItems: 50, maxChars: 6000 - 50, intervalMs: 110 },
  premium: { maxItems: 50, maxChars: 6000 - 50, intervalMs: 0 },
}

/** Stands for a line break inside a paragraph, since a line break of q separates the paragraphs. */
export const BAIDU_NEWLINE = "⁂"

export function buildBaiduRequest(q: string, from: string, to: string, provider: BaiduProvider, salt: string): RequestSpec {
  const sign = md5(provider.appId + q + salt + provider.apiKey)
  const body = new URLSearchParams({ q, from, to, appid: provider.appId, salt, sign })
  return { url: provider.baseURL, init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() } }
}

/** The translated lines; a failure named by error_code becomes the error of its meaning. */
export function parseBaiduResponse(json: unknown): string[] {
  const j = json as { error_code?: unknown; error_msg?: unknown; trans_result?: { dst?: unknown }[] } | null
  if (j?.error_code !== undefined && String(j.error_code) !== "52000") {
    const code = String(j.error_code)
    throw codeError(SERVICE, code, CODES[code], typeof j.error_msg === "string" ? j.error_msg : "")
  }
  if (!Array.isArray(j?.trans_result)) throw new LocalizedError("errUnexpectedResponse", [SERVICE])
  return j.trans_result.map((item, i) => {
    if (typeof item?.dst !== "string") throw new LocalizedError("errMissingTranslation", [SERVICE, String(i + 1)])
    return item.dst
  })
}

export interface BaiduOptions extends FetchOptions {
  /** Salt of the signature; random when absent. */
  salt?: string
}

/** The lines of q translated; `target` and `source` are language codes of the extension. */
async function translateLines(q: string, target: string, source: string, provider: BaiduProvider, opts: BaiduOptions): Promise<string[]> {
  if (!provider.appId) throw new LocalizedError("errAppIdRequired", [SERVICE])
  if (!provider.apiKey) throw new LocalizedError("errApiKeyRequired", [SERVICE])
  const to = BAIDU_LANGS[target]
  const from = source === "auto" ? "auto" : BAIDU_LANGS[source]
  const premiumOnly = provider.edition !== "premium" && [source, target].some((code) => BAIDU_PREMIUM_ONLY.includes(code))
  if (!to || !from || premiumOnly) throw new LocalizedError("errUnsupportedPair", [SERVICE])
  const spec = buildBaiduRequest(q, from, to, provider, opts.salt ?? crypto.randomUUID().replaceAll("-", ""))
  return parseBaiduResponse(await (await fetchOk(opts, spec, SERVICE)).json())
}

/** Every paragraph in one request; BatchParseError when the answer does not line up. */
export async function baiduTranslateBatch(texts: string[], target: string, source: string, provider: BaiduProvider, opts: BaiduOptions = {}): Promise<string[]> {
  const marks = (text: string) => text.split(BAIDU_NEWLINE).length
  const sent = texts.map((text) => text.replace(/\r?\n/g, BAIDU_NEWLINE))
  const lines = await translateLines(sent.join("\n"), target, source, provider, opts)
  if (lines.length !== texts.length || lines.some((line, i) => marks(line) !== marks(sent[i]))) {
    throw new BatchParseError(`${SERVICE}: ${lines.length} lines for ${texts.length} paragraphs`)
  }
  return lines.map((line) => line.replaceAll(BAIDU_NEWLINE, "\n"))
}

/** One paragraph; its lines are translated as lines. */
export async function baiduTranslateSingle(text: string, target: string, source: string, provider: BaiduProvider, opts: BaiduOptions = {}): Promise<string> {
  return (await translateLines(text, target, source, provider, opts)).join("\n")
}
