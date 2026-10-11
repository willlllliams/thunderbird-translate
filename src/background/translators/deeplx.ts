/**
 * DeepLX: a self-hosted or third-party proxy that speaks a DeepL-like API.
 *
 * Request:  POST <endpoint> {"text": "...", "source_lang": "auto", "target_lang": "ZH"}
 * Response: {"code": 200, "data": "译文", "alternatives": [...]}
 *
 * Some deployments put the token in the URL (`{{apiKey}}` placeholder or
 * `?token=`), others expect `Authorization: Bearer <token>`. Both work here.
 */

import { ensureOk, HttpError } from "../queue/request-queue"
import type { FetchOptions, RequestSpec } from "./google"

export function buildDeepLXRequest(text: string, targetDeepl: string, endpoint: string, token = ""): RequestSpec {
  if (!endpoint) throw new Error("DeepLX: endpoint is not configured")
  let url = endpoint
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (url.includes("{{apiKey}}")) {
    if (!token) throw new Error("DeepLX: the endpoint contains {{apiKey}} but no token is set")
    url = url.replaceAll("{{apiKey}}", encodeURIComponent(token))
  } else if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return {
    url,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({ text, source_lang: "auto", target_lang: targetDeepl }),
    },
  }
}

export function parseDeepLXResponse(json: unknown): string {
  const j = json as { code?: number; data?: unknown; message?: string; translations?: { text?: unknown }[] }
  if (typeof j?.data === "string") return j.data
  // Official DeepL shape, returned by some proxies.
  const t = j?.translations?.[0]?.text
  if (typeof t === "string") return t
  if (typeof j?.code === "number" && j.code !== 200) {
    throw new HttpError(`DeepLX: ${j.message ?? `code ${j.code}`}`, j.code)
  }
  throw new Error("DeepLX: unexpected response format")
}

export async function deeplxTranslate(
  text: string,
  targetDeepl: string,
  endpoint: string,
  token: string,
  opts: FetchOptions = {},
): Promise<string> {
  const f = opts.fetchFn ?? fetch
  const { url, init } = buildDeepLXRequest(text, targetDeepl, endpoint, token)
  const resp = await ensureOk(await f(url, { ...init, signal: opts.signal }), "DeepLX")
  return parseDeepLXResponse(await resp.json())
}
