/**
 * Errors that carry a message key, so the text can be shown in the interface
 * language chosen by the user. `message` holds the English text for logs
 * and for code that only looks at Error.message.
 *
 * describeError() turns any thrown value into text for the user: what failed,
 * what the server said, what to check and which URL was requested. It never
 * returns an empty string. Under HTTP/2 (Thunderbird) `statusText` is always
 * empty, and the AI SDK uses it as the message when the response body is not
 * in the provider's error format, so Error.message alone is often "".
 */

import { ENGLISH, type I18n, type MessageKey } from "./i18n"
import { isKnownWebHost, type ProviderKind, sameEndpoint, urlHost } from "./providers"

export interface ErrorText {
  key: MessageKey
  args?: string[]
  /** Untranslated detail appended after the message, e.g. a server response. */
  detail?: string
  /** Suggestion shown on its own line by describeError(). */
  hint?: MessageKey
}

export function renderErrorText(text: ErrorText, i18n: I18n): string {
  const base = i18n.t(text.key, text.args ?? [])
  return text.detail ? `${base} - ${text.detail}` : base
}

export class LocalizedError extends Error {
  readonly i18nText: ErrorText

  constructor(key: MessageKey, args: string[] = [], detail?: string, hint?: MessageKey) {
    const text: ErrorText = { key, args, detail, hint }
    super(renderErrorText(text, ENGLISH))
    this.name = "LocalizedError"
    this.i18nText = text
  }
}

/** fetch() failed before any HTTP response arrived (DNS, TLS, refused connection, CORS, proxy). */
export class NetworkError extends Error {
  readonly isRetryable = true

  constructor(
    readonly url: string,
    cause?: unknown,
  ) {
    super(`Could not connect to ${urlHost(url) || url}${cause instanceof Error && cause.message ? `: ${cause.message}` : ""}`, { cause })
    this.name = "NetworkError"
  }
}

/** The service did not answer within the request timeout of the settings; retried like a network failure. */
export class TimeoutError extends LocalizedError {
  readonly isRetryable = true

  constructor(service: string, ms: number) {
    super("errTimeout", [service, String(Math.round(ms / 1000))], undefined, "hintTimeout")
    this.name = "TimeoutError"
  }
}

/* ---------- secrets in error texts ---------- */

/** Query parameters that commonly carry credentials. */
const SECRET_PARAM = /key|token|auth|secret|sig|pass|credential|session/i
/** A path segment that looks like a token: 20 or more characters with letters and digits, no dot. */
const TOKEN_SEGMENT = /^(?=.*\d)(?=.*[A-Za-z])[\w:-]{20,}$/

/** The URL with user info, token-like path segments and credential parameters replaced by ***. */
export function redactUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url
  }
  const secretParams = [...new Set(u.searchParams.keys())].filter((key) => SECRET_PARAM.test(key))
  const segments = u.pathname.split("/")
  const tokens = segments.filter((segment) => TOKEN_SEGMENT.test(decodeURIComponent(segment)))
  if (!u.username && !u.password && tokens.length === 0 && secretParams.length === 0) return url
  if (u.username) u.username = "***"
  if (u.password) u.password = "***"
  u.pathname = segments.map((segment) => (tokens.includes(segment) ? "***" : segment)).join("/")
  for (const key of secretParams) u.searchParams.set(key, "***")
  return u.toString()
}

/** `text` with every occurrence of the secrets, also URL-encoded, replaced by ***. */
function redactSecrets(text: string, secrets: readonly string[] = []): string {
  for (const secret of secrets) {
    if (secret.length < 4) continue
    for (const form of new Set([secret, encodeURIComponent(secret)])) text = text.replaceAll(form, "***")
  }
  return text
}

/* ---------- HTTP details ---------- */

/** Reason phrases (RFC 9110 and widespread extensions) for responses whose statusText is empty. */
const REASON_PHRASES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Content Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  418: "I'm a teapot",
  421: "Misdirected Request",
  422: "Unprocessable Content",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  507: "Insufficient Storage",
  508: "Loop Detected",
  511: "Network Authentication Required",
  520: "Web Server Returned an Unknown Error",
  521: "Web Server Is Down",
  522: "Connection Timed Out",
  523: "Origin Is Unreachable",
  524: "A Timeout Occurred",
  529: "Overloaded",
}

/** "405 Method Not Allowed"; the table fills in an empty statusText. */
export function httpStatusLine(status: number, statusText?: string): string {
  const phrase = statusText?.trim() || REASON_PHRASES[status] || ""
  return phrase ? `${status} ${phrase}` : String(status)
}

const MAX_DETAIL = 200

export function truncate(text: string, max = MAX_DETAIL): string {
  const t = text.replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function looksLikeHtml(text: string): boolean {
  const head = text.trimStart().slice(0, 512).toLowerCase()
  return /^<(!doctype html|html|head|body|meta|title|script|div)\b/.test(head) || head.includes("<html")
}

/** Message from a JSON error body: error.message, error, message, detail, msg, errors[0].message. */
function messageFromJson(json: unknown): string | undefined {
  if (typeof json === "string") return json.trim() || undefined
  if (!json || typeof json !== "object") return undefined
  if (Array.isArray(json)) return messageFromJson(json[0])
  const o = json as Record<string, unknown>
  const err = o.error
  if (err && typeof err === "object" && !Array.isArray(err)) {
    const inner = messageFromJson(err)
    if (inner) return inner
  }
  if (typeof err === "string" && err.trim()) return err.trim()
  for (const key of ["message", "detail", "msg", "error_msg", "errorMessage", "description"]) {
    const v = o[key]
    if (typeof v === "string" && v.trim()) return v.trim()
    // FastAPI validation errors: {"detail": [{"msg": "..."}]}
    if (v && typeof v === "object") {
      const inner = messageFromJson(v)
      if (inner) return inner
    }
  }
  const errors = o.errors
  if (Array.isArray(errors) && errors.length > 0) return messageFromJson(errors[0])
  return undefined
}

export type BodySummary = { kind: "none" } | { kind: "html" } | { kind: "text"; text: string }

/** What the server said, in at most ~200 characters; HTML pages are reported, not quoted. */
export function summarizeResponseBody(body: unknown): BodySummary {
  if (body === undefined || body === null) return { kind: "none" }
  if (typeof body !== "string") {
    const m = messageFromJson(body)
    if (m) return { kind: "text", text: truncate(m) }
    try {
      const s = JSON.stringify(body)
      return s && s !== "{}" ? { kind: "text", text: truncate(s) } : { kind: "none" }
    } catch {
      return { kind: "none" }
    }
  }
  const raw = body.trim()
  if (!raw) return { kind: "none" }
  if (looksLikeHtml(raw)) return { kind: "html" }
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const json: unknown = JSON.parse(raw)
      const m = messageFromJson(json)
      return { kind: "text", text: truncate(m ?? raw) }
    } catch {
      // Not JSON after all: quote it as text.
    }
  }
  return { kind: "text", text: truncate(raw) }
}

/* ---------- description ---------- */

/** What the caller knows about the request that failed. */
export interface ErrorContext {
  /** Service name, e.g. "DeepSeek". */
  service?: string
  /** Provider kind; the endpoint of the free Google/Microsoft services is not user-editable. */
  kind?: ProviderKind
  /** Endpoint that was used. */
  baseURL?: string
  /** The preset's default endpoint; empty when the user must supply one. */
  defaultBaseURL?: string
  model?: string
  /** Microsoft Translator called with the user's Azure key. */
  keyMode?: boolean
  /** API key or token of the request; replaced by *** wherever it shows up in the description. */
  secrets?: string[]
}

export interface ErrorReport {
  /** One line: what failed. */
  reason: string
  /** What the server said, already shortened. */
  serverMessage?: string
  /** Localized suggestions, one sentence each. */
  hints: string[]
  /** URL of the failed request. */
  url?: string
}

interface HttpFailure {
  status: number
  statusText?: string
  url?: string
  body: BodySummary
  /** Error.message when it adds something (the AI SDK puts the provider's error message there). */
  message?: string
}

type AnyError = Record<string, unknown> & { name?: unknown; message?: unknown }

function asObject(error: unknown): AnyError | null {
  return error && typeof error === "object" ? (error as AnyError) : null
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function httpFailure(e: AnyError): HttpFailure | null {
  const status = typeof e.statusCode === "number" ? e.statusCode : typeof e.status === "number" ? e.status : undefined
  if (status === undefined || status < 100 || status > 599) return null
  const hasRequestInfo = typeof e.url === "string" || "responseBody" in e || e.name === "AI_APICallError"
  if (!hasRequestInfo) return null
  return {
    status,
    statusText: str(e.statusText),
    url: str(e.url) || undefined,
    body: summarizeResponseBody(e.responseBody ?? e.data),
    message: str(e.message).trim() || undefined,
  }
}

function isNetworkFailure(e: AnyError): boolean {
  const name = str(e.name)
  const message = str(e.message)
  if (name === "NetworkError") return true
  if (name === "AI_APICallError" && typeof e.statusCode !== "number") return true
  return name === "TypeError" && /networkerror|failed to fetch|fetch failed|load failed|network/i.test(message)
}

function serviceLabel(ctx: ErrorContext, url?: string): string {
  return ctx.service || urlHost(url) || urlHost(ctx.baseURL) || "API"
}

/** Endpoint advice: web-page hosts, and the preset default compared with the endpoint in use. */
function endpointHints(ctx: ErrorContext, i18n: I18n): string[] {
  if (ctx.kind === "google" || (ctx.kind === "microsoft" && !ctx.keyMode)) return []
  const hints: string[] = []
  const host = urlHost(ctx.baseURL)
  if (host && isKnownWebHost(host)) hints.push(i18n.t("hintWebHost", [host]))
  const service = ctx.service || "API"
  if (ctx.defaultBaseURL) {
    if (ctx.baseURL && !sameEndpoint(ctx.baseURL, ctx.defaultBaseURL)) {
      hints.push(i18n.t("hintEndpointDiffers", [service, ctx.defaultBaseURL, redactUrl(ctx.baseURL)]))
    } else {
      hints.push(i18n.t("hintEndpointDefault", [service, ctx.defaultBaseURL]))
    }
  }
  return hints
}

const MODEL_MISSING = /model/i
const MODEL_MISSING_DETAIL = /not[ _-]?(?:exist|found|available|supported)|does not exist|no such|unknown|invalid|unsupported|not have access|decommissioned|deprecated/i

function modelHint(ctx: ErrorContext, i18n: I18n): string {
  return ctx.model ? i18n.t("hintModel", [ctx.model]) : i18n.t("hintModelGeneric")
}

/** Advice for authentication, rate-limit and server errors. */
function statusHints(status: number | undefined, i18n: I18n, keyMode = false): string[] {
  if (status === 401 || status === 403) return [i18n.t(keyMode ? "hintAzureAuth" : "hintAuth")]
  if (status === 402 || status === 429) return [i18n.t("hintRateLimit")]
  if (status !== undefined && status >= 500 && status < 600) return [i18n.t("hintServerError")]
  return []
}

function httpReport(f: HttpFailure, ctx: ErrorContext, i18n: I18n): ErrorReport {
  const statusLine = httpStatusLine(f.status, f.statusText)
  const reason = i18n.t("errHttp", [serviceLabel(ctx, f.url), statusLine])
  let serverMessage: string | undefined
  if (f.body.kind === "text") serverMessage = f.body.text
  else if (f.body.kind === "none" && f.message) serverMessage = truncate(f.message)
  // "Method Not Allowed" again after "HTTP 405 Method Not Allowed" adds nothing.
  if (serverMessage && statusLine.toLowerCase().endsWith(serverMessage.toLowerCase().replace(/[.!]$/, ""))) serverMessage = undefined

  const hints: string[] = []
  const said = f.body.kind === "text" ? f.body.text : (f.message ?? "")
  const modelProblem = [400, 404, 422].includes(f.status) && MODEL_MISSING.test(said) && MODEL_MISSING_DETAIL.test(said)
  if (f.body.kind === "html") {
    hints.push(i18n.t("hintHtmlResponse"), ...endpointHints(ctx, i18n))
  } else if (modelProblem) {
    hints.push(modelHint(ctx, i18n))
  } else if (f.status === 404 || f.status === 405) {
    hints.push(i18n.t("hintEndpoint"), ...endpointHints(ctx, i18n))
  } else {
    hints.push(...statusHints(f.status, i18n, ctx.keyMode))
  }
  return { reason, serverMessage, hints, url: f.url }
}

function networkReport(e: AnyError, ctx: ErrorContext, i18n: I18n): ErrorReport {
  const url = str(e.url) || ctx.baseURL || undefined
  const host = urlHost(url)
  const service = serviceLabel(ctx, url)
  const reason = host ? i18n.t("errNetwork", [service, host]) : i18n.t("errNetworkNoHost", [service])
  const cause = asObject(e.cause)
  const causeMessage = str(cause?.message).trim()
  const own = str(e.message).trim()
  // Keep the browser's own wording (e.g. "NetworkError when attempting to fetch resource.") as the detail.
  const serverMessage = e.name === "NetworkError" ? causeMessage || undefined : own || causeMessage || undefined
  const hints = [i18n.t("hintNetwork")]
  if (host && isKnownWebHost(host)) hints.push(i18n.t("hintWebHost", [host]))
  return { reason, serverMessage: serverMessage ? truncate(serverMessage) : undefined, hints, url }
}

function analyze(error: unknown, ctx: ErrorContext, i18n: I18n, depth: number): ErrorReport {
  const e = asObject(error)
  if (!e) {
    const text = typeof error === "string" ? error.trim() : error === undefined || error === null ? "" : String(error)
    return { reason: text || i18n.t("errUnknown"), hints: [] }
  }
  const name = str(e.name)

  if (name === "AI_RetryError" && e.lastError !== undefined && depth < 5) return analyze(e.lastError, ctx, i18n, depth + 1)

  const http = httpFailure(e)
  if (http) return httpReport(http, ctx, i18n)
  if (isNetworkFailure(e)) return networkReport(e, ctx, i18n)

  const label = serviceLabel(ctx)
  switch (name) {
    case "AI_NoContentGeneratedError":
    case "AI_EmptyResponseBodyError":
      return { reason: i18n.t("errNoContent", [label]), hints: [] }
    case "AI_InvalidResponseDataError":
    case "AI_JSONParseError":
    case "AI_TypeValidationError": {
      const body = summarizeResponseBody(name === "AI_JSONParseError" ? e.text : name === "AI_TypeValidationError" ? e.value : e.data)
      const hints = body.kind === "html" ? [i18n.t("hintHtmlResponse")] : [i18n.t("hintNotApi")]
      hints.push(...endpointHints(ctx, i18n))
      return { reason: i18n.t("errUnreadableResponse", [label]), serverMessage: body.kind === "text" ? body.text : undefined, hints }
    }
    case "AI_NoSuchModelError":
      return { reason: truncate(str(e.message)) || name, hints: [modelHint(ctx, i18n)] }
    case "AI_LoadAPIKeyError":
      return { reason: truncate(str(e.message)) || name, hints: [i18n.t("hintAuth")] }
  }

  // Service-level codes without request details, e.g. DeepLX's {"code": 401, "message": "..."}.
  const hints = statusHints(typeof e.status === "number" ? e.status : undefined, i18n)

  const text = e.i18nText as ErrorText | undefined
  if (text && typeof text.key === "string") return { reason: renderErrorText(text, i18n), hints: text.hint ? [i18n.t(text.hint)] : hints }

  const message = str(e.message).trim()
  if (!message && e.cause !== undefined && e.cause !== error && depth < 5) return analyze(e.cause, ctx, i18n, depth + 1)
  if (message) return { reason: message, hints }
  if (name && name !== "Error") return { reason: name, hints }
  let fallback = ""
  try {
    fallback = String(error)
  } catch {
    // Objects without a usable toString.
  }
  if (!fallback || fallback === "[object Object]" || fallback === "Error") {
    try {
      const json = JSON.stringify(error)
      if (json && json !== "{}") fallback = truncate(json)
    } catch {
      // Circular structure.
    }
  }
  return { reason: fallback && fallback !== "[object Object]" && fallback !== "Error" ? fallback : i18n.t("errUnknown"), hints: [] }
}

/** Structured description of an error; `reason` is never empty. */
export function analyzeError(error: unknown, i18n: I18n, ctx: ErrorContext = {}): ErrorReport {
  const report = analyze(error, ctx, i18n, 0)
  if (!report.reason.trim()) report.reason = i18n.t("errUnknown")
  if (report.url) report.url = redactUrl(report.url)
  return report
}

/** Lines: reason, server message, suggestions, request URL. */
function formatErrorReport(report: ErrorReport, i18n: I18n): string {
  const lines = [report.reason]
  if (report.serverMessage) lines.push(i18n.t("errServerMessage", [report.serverMessage]))
  lines.push(...report.hints)
  if (report.url) lines.push(i18n.t("errRequestUrl", [report.url]))
  return lines.join("\n")
}

/**
 * Text for the user in the given language, one item per line (first line =
 * reason). Never empty. Errors with a message key are translated; HTTP,
 * network and AI SDK errors get the status, the server's message, the URL
 * and suggestions. Keys, tokens and credential parameters are masked.
 */
export function describeError(error: unknown, i18n: I18n, ctx: ErrorContext = {}): string {
  return redactSecrets(formatErrorReport(analyzeError(error, i18n, ctx), i18n), ctx.secrets)
}

/** First line of a description, for places with room for one line only. */
export function firstLine(description: string): string {
  return description.split("\n", 1)[0] ?? ""
}
