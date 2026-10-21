/**
 * What the translators share: the languages of a request, the check of the credentials, the request with its JSON
 * answer, the reading of a list of translations, the error of an answer that does not line up with the paragraphs,
 * and the errors of the services that name a failure by a code of their own (Baidu and Youdao in the body of an
 * answer with HTTP 200, DeepL by HTTP status), made from a table of what each code means.
 */

import { LocalizedError, summarizeResponseBody } from "../../shared/errors"
import { type FetchOptions, fetchOk, HttpError, type RequestSpec } from "../../shared/http"

/** The languages of a request, as codes of the extension; the source may be "auto". */
export interface Languages {
  source: string
  target: string
}

/** Thrown when a batched answer cannot be mapped back onto the paragraphs. */
export class BatchParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BatchParseError"
  }
}

/** Throws before any request when the key, or with `needsAppId` the app ID, is missing. */
export function requireCredentials(service: string, provider: { apiKey: string; appId?: string }, needsAppId = false): void {
  if (needsAppId && !provider.appId) throw new LocalizedError("errAppIdRequired", [service])
  if (!provider.apiKey) throw new LocalizedError("errApiKeyRequired", [service])
}

/** The JSON answer of a request of `service`. */
export async function fetchJson(opts: FetchOptions, spec: RequestSpec, service: string): Promise<unknown> {
  return (await fetchOk(opts, spec, service)).json()
}

/** The translations of a list in an answer, one per paragraph: `pick` reads the text of an item. */
export function readTranslations(service: string, list: unknown, expected: number, pick: (item: unknown) => unknown = (item) => item): string[] {
  if (!Array.isArray(list)) throw new LocalizedError("errUnexpectedResponse", [service])
  if (list.length !== expected) throw new LocalizedError("errResultCount", [service, String(expected), String(list.length)])
  return list.map((item, i) => {
    const text = pick(item)
    if (typeof text !== "string") throw new LocalizedError("errMissingTranslation", [service, String(i + 1)])
    return text
  })
}

/**
 * What a code means: the key, app ID or signature was refused; the quota is
 * used up; too many requests (tried again); a passing failure of the
 * service (tried again); the language pair is not offered; the time stamp
 * was refused; the IP address is blocked.
 */
export type CodeMeaning = "key" | "quota" | "rate" | "retry" | "pair" | "clock" | "ip"

/** The error for `code` of `service`; `message`: what the service said about it. */
export function codeError(service: string, code: string, meaning: CodeMeaning | undefined, message = ""): Error {
  const detail = message.trim() || undefined
  switch (meaning) {
    case "key":
      return new LocalizedError("errKeyRejected", [service], detail, "hintAuth")
    case "quota":
      return new LocalizedError("errQuotaExceeded", [service], detail)
    case "pair":
      return new LocalizedError("errUnsupportedPair", [service], detail)
    case "clock":
      return new LocalizedError("errClockSkew", [service], detail)
    case "ip":
      return new LocalizedError("errIpBlocked", [service], detail)
  }
  const error = new LocalizedError("errServiceCode", [service, code], detail)
  // With the status of HTTP 429 or 503, which the request queue tries again and describeError() gives its hint.
  return meaning ? Object.assign(error, { status: meaning === "rate" ? 429 : 503 }) : error
}

/** An HTTP error of fetchOk() whose status the table names becomes the error of its meaning; any other error stays as it is. */
export function httpCodeError(error: unknown, service: string, meanings: Partial<Record<number, CodeMeaning>>): unknown {
  if (!(error instanceof HttpError) || !meanings[error.status]) return error
  const body = summarizeResponseBody(error.responseBody)
  return codeError(service, String(error.status), meanings[error.status], body.kind === "text" ? body.text : "")
}
