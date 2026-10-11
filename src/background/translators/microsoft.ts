/**
 * Microsoft Translator.
 *
 * Free mode: POST edge.microsoft.com/translate/translatetext with a bare JSON
 * string array, the route the Edge browser uses. Microsoft retired the token
 * endpoint of the older route in 2026-07.
 *
 * Key mode: the official Azure Translator v3 translate method (subscription
 * key header, `[{ Text }]` body, same response format).
 *
 * Both take the source language as `from` and detect it when `from` is absent.
 */

import { LocalizedError } from "../../shared/errors"
import { type BatchLimits, groupIntoBatches } from "../queue/batch-queue"
import { type FetchOptions, fetchOk, type RequestSpec } from "../queue/request-queue"

export const MS_EDGE_TRANSLATE_URL = "https://edge.microsoft.com/translate/translatetext"


/** Azure Translator, key mode. An empty region is valid for a global resource. */
export interface AzureConfig {
  apiKey: string
  region: string
  /** Full URL of the translate method, without query. */
  endpoint: string
}

export interface MicrosoftOptions extends FetchOptions {
  /** Present in key mode. */
  azure?: AzureConfig
  /** Source language code; absent = detect. */
  from?: string
}

/** Request limits of the translate method (service-limits): 1000 array elements and 50,000 characters per request. */
export const AZURE_LIMITS: BatchLimits = { maxItems: 1000, maxChars: 50_000 }

export function buildAzureRequest(texts: string[], targetLang: string, azure: AzureConfig, from?: string): RequestSpec {
  const url = new URL(azure.endpoint)
  url.searchParams.set("api-version", "3.0")
  if (from) url.searchParams.set("from", from)
  url.searchParams.set("to", targetLang)
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=UTF-8",
    "Ocp-Apim-Subscription-Key": azure.apiKey,
  }
  if (azure.region) headers["Ocp-Apim-Subscription-Region"] = azure.region
  return { url: url.toString(), init: { method: "POST", headers, body: JSON.stringify(texts.map((Text) => ({ Text }))) } }
}

export function buildMicrosoftEdgeRequest(texts: string[], targetLang: string, from?: string): RequestSpec {
  const params = new URLSearchParams({ ...(from ? { from } : {}), to: targetLang, isEnterpriseClient: "false" })
  return {
    url: `${MS_EDGE_TRANSLATE_URL}?${params.toString()}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The direct route runs an HTML tag aligner, so a bare "<" would be
      // read as markup. Escape on the way in, decode on the way out.
      body: JSON.stringify(texts.map(escapeHtml)),
    },
  }
}

/** Both modes answer `[{ translations: [{ text, to }] }, ...]`. */
export function parseMicrosoftResponse(json: unknown, expected: number, decode = false): string[] {
  if (!Array.isArray(json)) throw new LocalizedError("errUnexpectedResponse", ["Microsoft"])
  if (json.length !== expected) throw new LocalizedError("errResultCount", ["Microsoft", String(expected), String(json.length)])
  return json.map((item, i) => {
    const text = (item as { translations?: { text?: unknown }[] })?.translations?.[0]?.text
    if (typeof text !== "string") throw new LocalizedError("errMissingTranslation", ["Microsoft", String(i + 1)])
    return decode ? decodeHtml(text) : text
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function decodeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
}

/** Send one translate request and read its `expected` translations. */
async function translate(spec: RequestSpec, expected: number, opts: FetchOptions, decode = false): Promise<string[]> {
  const resp = await fetchOk(opts.fetchFn, spec, "Microsoft")
  return parseMicrosoftResponse(await resp.json(), expected, decode)
}

/** One request per group within the Azure limits, in order. */
export async function azureTranslateBatch(texts: string[], targetLang: string, azure: AzureConfig, opts: MicrosoftOptions): Promise<string[]> {
  if (!azure.apiKey) throw new LocalizedError("errApiKeyRequired", ["Microsoft Translator"])
  const out: string[] = []
  for (const group of groupIntoBatches(texts, (text) => text.length, AZURE_LIMITS)) {
    out.push(...(await translate(buildAzureRequest(group, targetLang, azure, opts.from), group.length, opts)))
  }
  return out
}

export async function microsoftTranslateBatch(texts: string[], targetLang: string, opts: MicrosoftOptions = {}): Promise<string[]> {
  if (texts.length === 0) return []
  if (opts.azure) return azureTranslateBatch(texts, targetLang, opts.azure, opts)
  return translate(buildMicrosoftEdgeRequest(texts, targetLang, opts.from), texts.length, opts, true)
}
