/**
 * DeepL API (developers.deepl.com), with the user's key.
 *
 * Request:  POST <endpoint>/v2/translate, header `Authorization: DeepL-Auth-Key <key>`,
 *           {"text": [...], "target_lang": "ZH-HANS", "source_lang"?: "EN", "formality"?: "prefer_more"}
 * Response: {"translations": [{"detected_source_language": "EN", "text": "..."}, ...]}, in the order of `text`
 * Usage:    GET <endpoint>/v2/usage → {"character_count": 180118, "character_limit": 1250000}
 *
 * A key of the free plan ends in ":fx" and has its own host, api-free.deepl.com
 * (resolveProviderConfig() picks it). DeepL answers a refused key with 403 and
 * a used-up quota with 456. Its documentation says that it refuses calls from
 * browser-based applications: a web page cannot read the answer, because
 * DeepL sends no CORS headers. The background script of an extension with a
 * host permission for DeepL reads it; DeepL answers the same with and without
 * the Origin header Thunderbird sends (docs/providers.md).
 */

import { LocalizedError } from "../../shared/errors"
import { type FetchOptions, type RequestSpec } from "../../shared/http"
import { findLanguage } from "../../shared/languages"
import type { DeeplOptions, ResolvedProvider } from "../../shared/settings"
import { fetchJson, httpCodeError, type Languages, readTranslations, requireCredentials } from "./common"

type DeeplProvider = Pick<ResolvedProvider, "apiKey" | "baseURL" | "deepl">

const SERVICE = "DeepL"

/** The DeepL code of a target language; English and Portuguese in the variant of the options; undefined for a code the extension does not offer. */
export function deeplTarget(code: string, options: DeeplOptions): string | undefined {
  if (code === "en") return options.english
  if (code === "pt") return options.portuguese
  return findLanguage(code)?.deeplTarget
}

/** The DeepL code of a source language, which has no variants ("ZH", not "ZH-HANT"); undefined for "auto". */
export function deeplSource(code: string): string | undefined {
  return code === "auto" ? undefined : findLanguage(code)?.deepl.split("-")[0]
}

function authorized(provider: DeeplProvider): Record<string, string> {
  requireCredentials(SERVICE, provider)
  return { Authorization: `DeepL-Auth-Key ${provider.apiKey}` }
}

export function buildDeeplRequest(texts: string[], target: string, provider: DeeplProvider, source?: string): RequestSpec {
  const { formality } = provider.deepl
  const body = {
    text: texts,
    target_lang: target,
    ...(source ? { source_lang: source } : {}),
    // The "prefer_" forms are ignored for target languages without formality, which reject "more" and "less".
    ...(formality !== "default" ? { formality: `prefer_${formality}` } : {}),
  }
  return {
    url: `${provider.baseURL}/v2/translate`,
    init: { method: "POST", headers: { ...authorized(provider), "Content-Type": "application/json" }, body: JSON.stringify(body) },
  }
}

export function parseDeeplResponse(json: unknown, expected: number): string[] {
  return readTranslations(SERVICE, (json as { translations?: unknown } | null)?.translations, expected, (item) => (item as { text?: unknown } | null)?.text)
}

/** fetchOk() with a refused key and a used-up quota told apart. */
async function request(spec: RequestSpec, opts: FetchOptions): Promise<unknown> {
  try {
    return await fetchJson(opts, spec, SERVICE)
  } catch (error) {
    throw httpCodeError(error, SERVICE, { 403: "key", 456: "quota" })
  }
}

/** One request for every paragraph. */
export async function deeplTranslateBatch(texts: string[], { source, target }: Languages, provider: DeeplProvider, opts: FetchOptions = {}): Promise<string[]> {
  const to = deeplTarget(target, provider.deepl)
  if (!to) throw new LocalizedError("errUnsupportedPair", [SERVICE])
  const spec = buildDeeplRequest(texts, to, provider, deeplSource(source))
  return parseDeeplResponse(await request(spec, opts), texts.length)
}

/** Characters used and the limit of the billing period; the connection test shows them, and they cost nothing. */
export async function deeplUsage(provider: DeeplProvider, opts: FetchOptions = {}): Promise<{ used: number; limit: number }> {
  const json = (await request({ url: `${provider.baseURL}/v2/usage`, init: { method: "GET", headers: authorized(provider) } }, opts)) as { character_count?: unknown; character_limit?: unknown } | null
  if (typeof json?.character_count !== "number" || typeof json.character_limit !== "number") throw new LocalizedError("errUnexpectedResponse", [SERVICE])
  return { used: json.character_count, limit: json.character_limit }
}
