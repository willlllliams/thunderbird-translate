/**
 * Youdao AI Cloud, batch text translation (openapi.youdao.com/v2/api), with
 * the user's app ID (appKey) and app secret.
 *
 * Request:  POST <endpoint>, form fields q (once per paragraph), from, to, appKey, salt, curtime, signType=v3, sign;
 *           sign = SHA-256(appKey + input + salt + curtime + secret) in hex, curtime in UTC seconds,
 *           input = the q values joined, cut to "first 10 characters + length + last 10" when longer than 20
 * Response: {"errorCode": "0", "translateResults": [{"query": "...", "translation": "..."}, ...], "errorIndex"?: [1]}
 *
 * The characters of input are counted in code points, as the official
 * Python example does. A paragraph listed in errorIndex fails on its own.
 * Automatic detection of the batch interface knows 13 languages; a paragraph
 * in another one fails here and keeps the translation of another tier.
 */

import { LocalizedError } from "../../shared/errors"
import { sha256Hex } from "../../shared/hash"
import { type FetchOptions, fetchOk, type RequestSpec } from "../../shared/http"
import type { ResolvedProvider } from "../../shared/settings"
import { type CodeMeaning, codeError } from "./codes"

type YoudaoProvider = Pick<ResolvedProvider, "apiKey" | "appId" | "baseURL">

const SERVICE = "Youdao"

/** Youdao's codes where they differ from the codes of the extension; every other language keeps its code. */
const YOUDAO_LANGS: Partial<Record<string, string>> = { "zh-CN": "zh-CHS", "zh-TW": "zh-CHT" }

export const youdaoLang = (code: string) => YOUDAO_LANGS[code] ?? code

const CODES: Partial<Record<string, CodeMeaning>> = {
  "108": "key",
  "110": "key",
  "202": "key",
  "401": "quota",
  "411": "rate",
  "412": "rate",
  "207": "retry",
  "206": "clock",
  "102": "pair",
}

/**
 * The input of the signature: the text itself up to 20 code points, else its first 10, its length and its last 10.
 * The documentation says "characters" only; its Python and PHP samples count code points, its Java, JavaScript and C#
 * samples UTF-16 units. The two differ only for characters outside the Basic Multilingual Plane, such as most emoji;
 * which one the service checks is to be confirmed with a real account (a batch with an emoji answers 202 if wrong).
 */
export function youdaoInput(q: string): string {
  const chars = Array.from(q)
  return chars.length <= 20 ? q : `${chars.slice(0, 10).join("")}${chars.length}${chars.slice(-10).join("")}`
}

export interface YoudaoOptions extends FetchOptions {
  /** Salt of the signature; a random UUID when absent. */
  salt?: string
  /** Seconds since 1970 (UTC); the clock of the computer when absent. */
  curtime?: number
}

export async function buildYoudaoRequest(texts: string[], from: string, to: string, provider: YoudaoProvider, salt: string, curtime: number): Promise<RequestSpec> {
  const time = String(curtime)
  const sign = await sha256Hex(new TextEncoder().encode(provider.appId + youdaoInput(texts.join("")) + salt + time + provider.apiKey))
  const body = new URLSearchParams([...texts.map((q) => ["q", q]), ["from", from], ["to", to], ["appKey", provider.appId], ["salt", salt], ["curtime", time], ["signType", "v3"], ["sign", sign]])
  return { url: provider.baseURL, init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() } }
}

/** The result of each paragraph; a failure of the whole request, named by errorCode, becomes the error of its meaning. */
export function parseYoudaoResponse(json: unknown, expected: number): PromiseSettledResult<string>[] {
  const j = json as { errorCode?: unknown; errorIndex?: unknown; translateResults?: { translation?: unknown }[] } | null
  const code = String(j?.errorCode ?? "")
  if (code !== "0") throw code ? codeError(SERVICE, code, CODES[code]) : new LocalizedError("errUnexpectedResponse", [SERVICE])
  const failed = new Set(Array.isArray(j?.errorIndex) ? j.errorIndex.map(Number) : [])
  let results = Array.isArray(j?.translateResults) ? j.translateResults : []
  // The answer lists the failed paragraphs too, or leaves them out.
  if (results.length === expected - failed.size && failed.size > 0) {
    const rest = results.values()
    results = Array.from({ length: expected }, (_, i) => (failed.has(i) ? {} : rest.next().value!))
  }
  if (results.length !== expected) throw new LocalizedError("errResultCount", [SERVICE, String(expected), String(results.length)])
  return results.map((item, i): PromiseSettledResult<string> => {
    const text = failed.has(i) ? undefined : item?.translation
    return typeof text === "string" ? { status: "fulfilled", value: text } : { status: "rejected", reason: new LocalizedError("errMissingTranslation", [SERVICE, String(i + 1)]) }
  })
}

/** Every paragraph in one request; `target` and `source` are language codes of the extension. */
export async function youdaoTranslateBatch(texts: string[], target: string, source: string, provider: YoudaoProvider, opts: YoudaoOptions = {}): Promise<PromiseSettledResult<string>[]> {
  if (!provider.appId) throw new LocalizedError("errAppIdRequired", [SERVICE])
  if (!provider.apiKey) throw new LocalizedError("errApiKeyRequired", [SERVICE])
  const from = source === "auto" ? "auto" : youdaoLang(source)
  const spec = await buildYoudaoRequest(texts, from, youdaoLang(target), provider, opts.salt ?? crypto.randomUUID(), opts.curtime ?? Math.floor(Date.now() / 1000))
  return parseYoudaoResponse(await (await fetchOk(opts, spec, SERVICE)).json(), texts.length)
}
