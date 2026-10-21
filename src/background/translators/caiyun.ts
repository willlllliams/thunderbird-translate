/**
 * Caiyun Xiaoyi, LingoCloud API (api.interpreter.caiyunai.com), with the
 * user's token.
 *
 * Request:  POST <endpoint>, header `X-Authorization: token <token>`,
 *           {"source": [...], "trans_type": "en2zh", "request_id": "...", "detect": false}
 * Response: {"target": [...]}, in the order of `source`
 *
 * Caiyun translates between Chinese (Simplified or Traditional) and English,
 * Japanese and Korean in both directions, and from German, Spanish, French,
 * Italian, Portuguese, Russian, Turkish and Vietnamese into Chinese only.
 * Any other pair fails before a request, with errUnsupportedPair. The
 * documentation names no error codes: an answer without `target` fails.
 */

import { LocalizedError } from "../../shared/errors"
import { type FetchOptions, type RequestSpec } from "../../shared/http"
import { findLanguage } from "../../shared/languages"
import type { ResolvedProvider } from "../../shared/settings"
import { fetchJson, type Languages, readTranslations, requireCredentials } from "./common"

type CaiyunProvider = Pick<ResolvedProvider, "apiKey" | "baseURL">

const SERVICE = "Caiyun"

const CHINESE = new Set(["zh", "zh-Hant"])
/** The languages Chinese translates into. */
const FROM_CHINESE = new Set(["en", "ja", "ko"])

/** The trans_type of a pair of language codes of the extension ("auto2zh", "en2zh-Hant"); null when Caiyun does not translate it. */
export function caiyunDirection(source: string, target: string): string | null {
  const to = findLanguage(target)?.caiyun
  const from = source === "auto" ? "auto" : findLanguage(source)?.caiyun
  if (!to || !from || from === to) return null
  if (CHINESE.has(to) || ((from === "auto" || CHINESE.has(from)) && FROM_CHINESE.has(to))) return `${from}2${to}`
  return null
}

export function buildCaiyunRequest(texts: string[], direction: string, provider: CaiyunProvider, requestId: string): RequestSpec {
  requireCredentials(SERVICE, provider)
  const body = { source: texts, trans_type: direction, request_id: requestId, detect: direction.startsWith("auto2") }
  return {
    url: provider.baseURL,
    init: { method: "POST", headers: { "Content-Type": "application/json", "X-Authorization": `token ${provider.apiKey}` }, body: JSON.stringify(body) },
  }
}

export function parseCaiyunResponse(json: unknown, expected: number): string[] {
  return readTranslations(SERVICE, (json as { target?: unknown } | null)?.target, expected)
}

/** Every paragraph in one request. */
export async function caiyunTranslateBatch(texts: string[], { source, target }: Languages, provider: CaiyunProvider, opts: FetchOptions = {}): Promise<string[]> {
  const direction = caiyunDirection(source, target)
  if (!direction) throw new LocalizedError("errUnsupportedPair", [SERVICE])
  const spec = buildCaiyunRequest(texts, direction, provider, crypto.randomUUID())
  return parseCaiyunResponse(await fetchJson(opts, spec, SERVICE), texts.length)
}
