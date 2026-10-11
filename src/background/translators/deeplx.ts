/**
 * DeepLX: a self-hosted or third-party proxy that speaks a DeepL-like API.
 *
 * Request:  POST <endpoint> {"text": "...", "source_lang": "auto", "target_lang": "ZH"}
 * (source_lang is "auto" or a DeepL source code such as "EN")
 * Response: {"code": 200, "data": "译文", "alternatives": [...]}
 *
 * Some deployments put the token in the URL (`{{apiKey}}` placeholder or
 * `?token=`), others expect `Authorization: Bearer <token>`. Both work here.
 */

import { type ErrorText, LocalizedError, renderErrorText } from "../../shared/errors"
import { ENGLISH } from "../../shared/i18n"
import { type FetchOptions, fetchOk, HttpError, type RequestSpec } from "../queue/request-queue"

export function buildDeepLXRequest(text: string, targetDeepl: string, endpoint: string, token = "", sourceDeepl = "auto"): RequestSpec {
  if (!endpoint) throw new LocalizedError("errEndpointRequired", ["DeepLX"])
  let url = endpoint
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (url.includes("{{apiKey}}")) {
    if (!token) throw new LocalizedError("errDeeplxTokenMissing", ["DeepLX"])
    url = url.replaceAll("{{apiKey}}", encodeURIComponent(token))
  } else if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return {
    url,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({ text, source_lang: sourceDeepl, target_lang: targetDeepl }),
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
    if (j.message) throw new HttpError(`DeepLX: ${j.message}`, j.code)
    const text: ErrorText = { key: "errServiceCode", args: ["DeepLX", String(j.code)] }
    throw new HttpError(renderErrorText(text, ENGLISH), j.code, undefined, text)
  }
  throw new LocalizedError("errUnexpectedResponse", ["DeepLX"])
}

export async function deeplxTranslate(
  text: string,
  targetDeepl: string,
  endpoint: string,
  token: string,
  opts: FetchOptions & { source?: string } = {},
): Promise<string> {
  const resp = await fetchOk(opts.fetchFn, buildDeepLXRequest(text, targetDeepl, endpoint, token, opts.source), "DeepLX")
  return parseDeepLXResponse(await resp.json())
}
