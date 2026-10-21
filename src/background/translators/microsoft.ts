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
import type { BatchLimits } from "../queue/batch-queue"
import { MS_EDGE_TRANSLATE_URL } from "../../shared/hosts"
import { type FetchOptions, type RequestSpec } from "../../shared/http"
import { findLanguage } from "../../shared/languages"
import type { ResolvedProvider } from "../../shared/settings"
import { fetchJson, type Languages, readTranslations, requireCredentials } from "./common"

/** Azure Translator, key mode. An empty region is valid for a global resource. */
export interface AzureConfig {
  apiKey: string
  region: string
  /** Full URL of the translate method, without query. */
  endpoint: string
}

/**
 * Request limits of the translate method (service-limits): 1000 array elements and 50,000 characters per request.
 * The batches of the translation service keep within them (service.ts), so a batch is one request.
 */
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
  const texts = readTranslations("Microsoft", json, expected, (item) => (item as { translations?: { text?: unknown }[] })?.translations?.[0]?.text)
  return decode ? texts.map(decodeHtml) : texts
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

type MicrosoftProvider = Pick<ResolvedProvider, "mode" | "apiKey" | "region" | "baseURL">

/** Every paragraph in one request: the Edge route, or Azure Translator in key mode; the source is detected for "auto". */
export async function microsoftTranslateBatch(texts: string[], { source, target }: Languages, provider: MicrosoftProvider, opts: FetchOptions = {}): Promise<string[]> {
  if (texts.length === 0) return []
  const to = findLanguage(target)?.microsoft
  if (!to) throw new LocalizedError("errUnsupportedPair", ["Microsoft"])
  const from = source === "auto" ? undefined : findLanguage(source)?.microsoft
  if (provider.mode !== "key") return parseMicrosoftResponse(await fetchJson(opts, buildMicrosoftEdgeRequest(texts, to, from), "Microsoft"), texts.length, true)
  requireCredentials("Microsoft Translator", provider)
  const azure = { apiKey: provider.apiKey, region: provider.region, endpoint: provider.baseURL }
  return parseMicrosoftResponse(await fetchJson(opts, buildAzureRequest(texts, to, azure, from), "Microsoft"), texts.length)
}
