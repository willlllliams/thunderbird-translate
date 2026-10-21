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
 * take more (service.ts). The four languages outside Baidu's 28 common ones
 * (LanguageInfo.baiduPremiumOnly) need the premium edition. The answer has one "from" for the whole of q, so with
 * source language "auto" service.ts puts the paragraphs of each language it
 * detects in batches of their own.
 */

import { LocalizedError } from "../../shared/errors"
import { type FetchOptions, type RequestSpec } from "../../shared/http"
import { findLanguage } from "../../shared/languages"
import { md5 } from "../../shared/md5"
import type { BaiduEdition, ResolvedProvider } from "../../shared/settings"
import type { BatchLimits } from "../queue/batch-queue"
import { BatchParseError, type CodeMeaning, codeError, fetchJson, type Languages, requireCredentials } from "./common"

type BaiduProvider = Pick<ResolvedProvider, "apiKey" | "appId" | "baseURL" | "edition">

const SERVICE = "Baidu"

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
const BAIDU_NEWLINE = "⁂"

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

/** The lines of q translated. */
async function translateLines(q: string, { source, target }: Languages, provider: BaiduProvider, opts: BaiduOptions): Promise<string[]> {
  requireCredentials(SERVICE, provider, true)
  const to = findLanguage(target)
  const from = source === "auto" ? { baidu: "auto" } : findLanguage(source)
  const premiumOnly = provider.edition !== "premium" && [to, from].some((language) => language !== undefined && "baiduPremiumOnly" in language)
  if (!to?.baidu || !from?.baidu || premiumOnly) throw new LocalizedError("errUnsupportedPair", [SERVICE])
  const spec = buildBaiduRequest(q, from.baidu, to.baidu, provider, opts.salt ?? crypto.randomUUID().replaceAll("-", ""))
  return parseBaiduResponse(await fetchJson(opts, spec, SERVICE))
}

/** Every paragraph in one request; BatchParseError when the answer does not line up. */
export async function baiduTranslateBatch(texts: string[], languages: Languages, provider: BaiduProvider, opts: BaiduOptions = {}): Promise<string[]> {
  const marks = (text: string) => text.split(BAIDU_NEWLINE).length
  const sent = texts.map((text) => text.replace(/\r?\n/g, BAIDU_NEWLINE))
  const lines = await translateLines(sent.join("\n"), languages, provider, opts)
  if (lines.length !== texts.length || lines.some((line, i) => marks(line) !== marks(sent[i]))) {
    throw new BatchParseError(`${SERVICE}: ${lines.length} lines for ${texts.length} paragraphs`)
  }
  return lines.map((line) => line.replaceAll(BAIDU_NEWLINE, "\n"))
}

/** One paragraph; its lines are translated as lines. */
export async function baiduTranslateSingle(text: string, languages: Languages, provider: BaiduProvider, opts: BaiduOptions = {}): Promise<string> {
  return (await translateLines(text, languages, provider, opts)).join("\n")
}
