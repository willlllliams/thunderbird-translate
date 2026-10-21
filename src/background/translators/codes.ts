/**
 * Errors of the machine translators that name a failure by a code of their
 * own: Baidu and Youdao in the body of an answer with HTTP 200, DeepL by
 * HTTP status. Each translator has a table from its codes to what they
 * mean; this module makes the error the user reads from that meaning.
 */

import { LocalizedError, summarizeResponseBody } from "../../shared/errors"
import { HttpError } from "../../shared/http"

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
