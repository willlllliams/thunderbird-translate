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
import { type FetchOptions, fetchOk, type RequestSpec } from "../../shared/http"
import type { ResolvedProvider } from "../../shared/settings"

type CaiyunProvider = Pick<ResolvedProvider, "apiKey" | "baseURL">

const SERVICE = "Caiyun"

/** Caiyun's codes of the languages of the extension it translates. */
const CAIYUN_LANGS: Partial<Record<string, string>> = { "zh-CN": "zh", "zh-TW": "zh-Hant", en: "en", ja: "ja", ko: "ko", fr: "fr", de: "de", es: "es", pt: "pt", it: "it", ru: "ru", tr: "tr", vi: "vi" }
const CHINESE = new Set(["zh", "zh-Hant"])
/** The languages Chinese translates into. */
const FROM_CHINESE = new Set(["en", "ja", "ko"])

/** The trans_type of a pair of language codes of the extension ("auto2zh", "en2zh-Hant"); null when Caiyun does not translate it. */
export function caiyunDirection(source: string, target: string): string | null {
  const to = CAIYUN_LANGS[target]
  const from = source === "auto" ? "auto" : CAIYUN_LANGS[source]
  if (!to || !from || from === to) return null
  if (CHINESE.has(to) || ((from === "auto" || CHINESE.has(from)) && FROM_CHINESE.has(to))) return `${from}2${to}`
  return null
}

export function buildCaiyunRequest(texts: string[], direction: string, provider: CaiyunProvider, requestId: string): RequestSpec {
  if (!provider.apiKey) throw new LocalizedError("errApiKeyRequired", [SERVICE])
  const body = { source: texts, trans_type: direction, request_id: requestId, detect: direction.startsWith("auto2") }
  return {
    url: provider.baseURL,
    init: { method: "POST", headers: { "Content-Type": "application/json", "X-Authorization": `token ${provider.apiKey}` }, body: JSON.stringify(body) },
  }
}

export function parseCaiyunResponse(json: unknown, expected: number): string[] {
  const target = (json as { target?: unknown } | null)?.target
  if (!Array.isArray(target)) throw new LocalizedError("errUnexpectedResponse", [SERVICE])
  if (target.length !== expected) throw new LocalizedError("errResultCount", [SERVICE, String(expected), String(target.length)])
  return target.map((text, i) => {
    if (typeof text !== "string") throw new LocalizedError("errMissingTranslation", [SERVICE, String(i + 1)])
    return text
  })
}

/** Every paragraph in one request; `target` and `source` are language codes of the extension. */
export async function caiyunTranslateBatch(texts: string[], target: string, source: string, provider: CaiyunProvider, opts: FetchOptions = {}): Promise<string[]> {
  const direction = caiyunDirection(source, target)
  if (!direction) throw new LocalizedError("errUnsupportedPair", [SERVICE])
  const spec = buildCaiyunRequest(texts, direction, provider, crypto.randomUUID())
  return parseCaiyunResponse(await (await fetchOk(opts, spec, SERVICE)).json(), texts.length)
}
