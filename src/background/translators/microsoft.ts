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
 */

import { ensureOk } from "../queue/request-queue"
import type { FetchOptions, RequestSpec } from "./google"

export const MS_AUTH_URL = "https://edge.microsoft.com/translate/auth"
export const MS_API_URL = "https://api-edge.cognitive.microsofttranslator.com/translate"
export const MS_EDGE_TRANSLATE_URL = "https://edge.microsoft.com/translate/translatetext"

export function buildMicrosoftApiRequest(texts: string[], targetLang: string, token: string): RequestSpec {
  const params = new URLSearchParams({ "api-version": "3.0", to: targetLang, textType: "plain" })
  return {
    url: `${MS_API_URL}?${params.toString()}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(texts.map((Text) => ({ Text }))),
    },
  }
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
  if (!Array.isArray(json)) throw new Error("Microsoft: unexpected response format")
  if (json.length !== expected) throw new Error(`Microsoft: expected ${expected} results, got ${json.length}`)
  return json.map((item, i) => {
    const text = (item as { translations?: { text?: unknown }[] })?.translations?.[0]?.text
    if (typeof text !== "string") throw new Error(`Microsoft: missing translation at index ${i}`)
    return decode ? decodeHtml(text) : text
  })
}

export function escapeHtml(s: string): string {
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

async function getToken(f: typeof fetch, signal?: AbortSignal): Promise<string> {
  if (state.token && Date.now() < state.expiresAt) return state.token
  const resp = await ensureOk(await f(MS_AUTH_URL, { method: "GET", signal }), "Microsoft auth")
  const token = (await resp.text()).trim()
  if (!token) throw new Error("Microsoft auth: empty token")
  state.token = token
  state.expiresAt = tokenExpiry(token)
  return token
}

export async function microsoftTranslateViaToken(texts: string[], targetLang: string, opts: FetchOptions = {}): Promise<string[]> {
  const f = opts.fetchFn ?? fetch
  const token = await getToken(f, opts.signal)
  const { url, init } = buildMicrosoftApiRequest(texts, targetLang, token)
  const resp = await f(url, { ...init, signal: opts.signal })
  if (resp.status === 401) state.token = null
  await ensureOk(resp, "Microsoft")
  return parseMicrosoftResponse(await resp.json(), texts.length)
}

export async function microsoftTranslateViaEdge(texts: string[], targetLang: string, opts: FetchOptions = {}): Promise<string[]> {
  const f = opts.fetchFn ?? fetch
  const { url, init } = buildMicrosoftEdgeRequest(texts, targetLang)
  const resp = await ensureOk(await f(url, { ...init, signal: opts.signal }), "Microsoft")
  return parseMicrosoftResponse(await resp.json(), texts.length, true)
}

export async function microsoftTranslateBatch(texts: string[], targetLang: string, opts: FetchOptions = {}): Promise<string[]> {
  if (texts.length === 0) return []
  if (Date.now() >= state.authDisabledUntil) {
    try {
      return await microsoftTranslateViaToken(texts, targetLang, opts)
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error
      state.authDisabledUntil = Date.now() + 60 * 60_000
      state.token = null
    }
  }
  return microsoftTranslateViaEdge(texts, targetLang, opts)
}
