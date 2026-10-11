/**
 * Microsoft Translator, the free endpoints used by the Edge browser.
 *
 * Two routes, both accept an array of texts in one request:
 *
 * 1. Token route: GET edge.microsoft.com/translate/auth returns a short-lived
 *    JWT, then POST api-edge.cognitive.microsofttranslator.com/translate
 *    (Translator v3 API) with `[{ Text }]`.
 * 2. Direct route: POST edge.microsoft.com/translate/translatetext with a bare
 *    JSON string array. No token. Microsoft retired the auth endpoint in
 *    2026-07 (it answers 404), and this is the route Edge uses since then.
 *
 * The token route is tried first; once it fails, it is skipped for an hour.
 *
 * With "use my key" mode the official Azure Translator v3 translate method is
 * called instead (subscription key header, same body and response format).
 */

import { LocalizedError } from "../../shared/errors"
import { type BatchLimits, groupIntoBatches } from "../queue/batch-queue"
import { type FetchOptions, fetchOk, type RequestSpec } from "../queue/request-queue"

export const MS_AUTH_URL = "https://edge.microsoft.com/translate/auth"
export const MS_API_URL = "https://api-edge.cognitive.microsofttranslator.com/translate"
export const MS_EDGE_TRANSLATE_URL = "https://edge.microsoft.com/translate/translatetext"

/** Body of the Translator v3 translate method, used by the token route and by Azure. */
const v3Body = (texts: string[]) => JSON.stringify(texts.map((Text) => ({ Text })))

export function buildMicrosoftApiRequest(texts: string[], targetLang: string, token: string): RequestSpec {
  const params = new URLSearchParams({ "api-version": "3.0", to: targetLang, textType: "plain" })
  return {
    url: `${MS_API_URL}?${params.toString()}`,
    init: { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: v3Body(texts) },
  }
}

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
}

/** Request limits of the translate method (service-limits): 1000 array elements and 50,000 characters per request. */
export const AZURE_LIMITS: BatchLimits = { maxItems: 1000, maxChars: 50_000 }

export function buildAzureRequest(texts: string[], targetLang: string, azure: AzureConfig): RequestSpec {
  const url = new URL(azure.endpoint)
  url.searchParams.set("api-version", "3.0")
  url.searchParams.set("to", targetLang)
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=UTF-8",
    "Ocp-Apim-Subscription-Key": azure.apiKey,
  }
  if (azure.region) headers["Ocp-Apim-Subscription-Region"] = azure.region
  return { url: url.toString(), init: { method: "POST", headers, body: v3Body(texts) } }
}

export function buildMicrosoftEdgeRequest(texts: string[], targetLang: string): RequestSpec {
  const params = new URLSearchParams({ from: "", to: targetLang, isEnterpriseClient: "false" })
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

/** Both routes answer `[{ translations: [{ text, to }] }, ...]`. */
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

/** Expiry (ms since epoch) from a JWT, or a conservative default. */
export function tokenExpiry(token: string, now = Date.now()): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    if (typeof payload.exp === "number") return payload.exp * 1000 - 60_000
  } catch {
    // not a JWT
  }
  return now + 8 * 60_000
}

interface TokenState {
  token: string | null
  expiresAt: number
  authDisabledUntil: number
}

const state: TokenState = { token: null, expiresAt: 0, authDisabledUntil: 0 }

export function resetMicrosoftState(): void {
  state.token = null
  state.expiresAt = 0
  state.authDisabledUntil = 0
}

async function getToken(fetchFn: typeof fetch | undefined): Promise<string> {
  if (state.token && Date.now() < state.expiresAt) return state.token
  const resp = await fetchOk(fetchFn, { url: MS_AUTH_URL, init: { method: "GET", headers: {} } }, "Microsoft auth")
  const token = (await resp.text()).trim()
  if (!token) throw new LocalizedError("errEmptyToken", ["Microsoft"])
  state.token = token
  state.expiresAt = tokenExpiry(token)
  return token
}

/** Send one translate request and read its `expected` translations. */
async function translate(spec: RequestSpec, expected: number, opts: FetchOptions, decode = false): Promise<string[]> {
  const resp = await fetchOk(opts.fetchFn, spec, "Microsoft")
  return parseMicrosoftResponse(await resp.json(), expected, decode)
}

export async function microsoftTranslateViaToken(texts: string[], targetLang: string, opts: FetchOptions = {}): Promise<string[]> {
  const token = await getToken(opts.fetchFn)
  return translate(buildMicrosoftApiRequest(texts, targetLang, token), texts.length, opts)
}

export function microsoftTranslateViaEdge(texts: string[], targetLang: string, opts: FetchOptions = {}): Promise<string[]> {
  return translate(buildMicrosoftEdgeRequest(texts, targetLang), texts.length, opts, true)
}

/** One request per group within the Azure limits, in order. */
export async function azureTranslateBatch(texts: string[], targetLang: string, azure: AzureConfig, opts: FetchOptions = {}): Promise<string[]> {
  if (!azure.apiKey) throw new LocalizedError("errApiKeyRequired", ["Microsoft Translator"])
  const out: string[] = []
  for (const group of groupIntoBatches(texts, (text) => text.length, AZURE_LIMITS)) {
    out.push(...(await translate(buildAzureRequest(group, targetLang, azure), group.length, opts)))
  }
  return out
}

export async function microsoftTranslateBatch(texts: string[], targetLang: string, opts: MicrosoftOptions = {}): Promise<string[]> {
  if (texts.length === 0) return []
  if (opts.azure) return azureTranslateBatch(texts, targetLang, opts.azure, opts)
  if (Date.now() >= state.authDisabledUntil) {
    try {
      return await microsoftTranslateViaToken(texts, targetLang, opts)
    } catch {
      state.authDisabledUntil = Date.now() + 60 * 60_000
      state.token = null
    }
  }
  return microsoftTranslateViaEdge(texts, targetLang, opts)
}
