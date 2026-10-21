// @vitest-environment jsdom
import { APICallError, JSONParseError, NoContentGeneratedError, RetryError } from "ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { compileMessagesJson, ENGLISH, I18n } from "../src/shared/i18n"
import { readLocaleSources, toMessagesJson } from "../scripts/locales.mjs"
import { analyzeError, describeError, type ErrorContext, firstLine, httpStatusLine, isUnreachable, LocalizedError, NetworkError, redactUrl, renderErrorText, summarizeResponseBody, TimeoutError } from "../src/shared/errors"
import { checkBaseURL, getPreset, PROVIDER_PRESETS, sameEndpoint, urlHost } from "../src/shared/providers"
import { errorContext } from "../src/background/service"
import { HttpError } from "../src/shared/http"
import { googleTranslateBatch } from "../src/background/translators/google"
import { createDefaultSettings, resolveProviderConfig } from "../src/shared/settings"
import { asFetch, createService, openPage, translateOne, until, useFakeTimers } from "./helpers"

const sources = readLocaleSources()
const zh = new I18n("zh_CN", compileMessagesJson(toMessagesJson(sources.zh_CN)))

const deepseekCtx = (baseURL: string): ErrorContext =>
  errorContext(resolveProviderConfig("deepseek", { apiKey: "sk-test", baseURL, model: "" }))

/** The error the AI SDK throws in Thunderbird for https://platform.deepseek.com (HTTP/2: statusText is ""). */
function platform405(): APICallError {
  return new APICallError({
    message: "",
    url: "https://platform.deepseek.com/chat/completions",
    requestBodyValues: {},
    statusCode: 405,
    responseHeaders: { "content-type": "application/json" },
    responseBody: '{"detail":"Method Not Allowed"}',
  })
}

describe("describeError: API call errors", () => {
  it("explains the 405 from a console URL with status, URL, suggestion and the default endpoint", () => {
    const text = describeError(platform405(), ENGLISH, deepseekCtx("https://platform.deepseek.com"))
    expect(text).toContain("405")
    expect(text).toContain("Method Not Allowed")
    expect(text).toContain("https://platform.deepseek.com/chat/completions")
    expect(text).toContain(ENGLISH.t("hintEndpoint"))
    expect(text).toContain("https://api.deepseek.com")
    expect(text).toContain(ENGLISH.t("hintEndpointDiffers", ["DeepSeek", "https://api.deepseek.com", "https://platform.deepseek.com"]))
    expect(text).toContain(ENGLISH.t("hintWebHost", ["platform.deepseek.com"]))

    const zhText = describeError(platform405(), zh, deepseekCtx("https://platform.deepseek.com"))
    expect(firstLine(zhText)).toBe("DeepSeek 请求失败：HTTP 405 Method Not Allowed")
    expect(zhText).toContain("请检查接口地址")
    expect(zhText).toContain("https://api.deepseek.com")
    expect(zhText).toContain("请求地址：https://platform.deepseek.com/chat/completions")
  })

  it("names the default endpoint even without context-specific mismatch", () => {
    const err = new APICallError({ message: "", url: "https://api.deepseek.com/chat/completions", requestBodyValues: {}, statusCode: 404, responseBody: "" })
    const text = describeError(err, ENGLISH, deepseekCtx(""))
    expect(text).toContain("404 Not Found")
    expect(text).toContain(ENGLISH.t("hintEndpointDefault", ["DeepSeek", "https://api.deepseek.com"]))
  })

  it("quotes the server message of a DeepSeek 401 and points at the key", () => {
    const err = new APICallError({
      message: "Authentication Fails, Your api key: ****test is invalid",
      url: "https://api.deepseek.com/chat/completions",
      requestBodyValues: {},
      statusCode: 401,
      responseBody: '{"error":{"message":"Authentication Fails, Your api key: ****test is invalid","type":"authentication_error","param":null,"code":"invalid_request_error"}}',
    })
    const text = describeError(err, zh, deepseekCtx(""))
    expect(text).toContain("HTTP 401 Unauthorized")
    expect(text).toContain("服务器返回：Authentication Fails, Your api key: ****test is invalid")
    expect(text).toContain(zh.t("hintAuth"))
    expect(text).not.toContain(zh.t("hintEndpoint"))
  })

  it("reports an HTML page instead of quoting it", () => {
    const err = new APICallError({
      message: "",
      url: "https://example.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 404,
      responseBody: "<!DOCTYPE html><html><head><title>Not found</title></head><body>…</body></html>",
    })
    const report = analyzeError(err, ENGLISH, { service: "Custom" })
    expect(report.serverMessage).toBeUndefined()
    expect(report.hints).toContain(ENGLISH.t("hintHtmlResponse"))
    expect(describeError(err, ENGLISH)).not.toContain("<html")
  })

  it("truncates plain-text bodies to about 200 characters", () => {
    const long = "upstream timeout ".repeat(40)
    const err = new APICallError({ message: "", url: "https://x.example/v1", requestBodyValues: {}, statusCode: 502, responseBody: long })
    const report = analyzeError(err, ENGLISH)
    expect(report.serverMessage!.length).toBeLessThanOrEqual(200)
    expect(report.serverMessage).toMatch(/^upstream timeout/)
    expect(report.hints).toEqual([ENGLISH.t("hintServerError")])
  })

  it("recognizes a missing model", () => {
    const err = new APICallError({
      message: "",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 404,
      responseBody: '{"error":{"message":"The model `gpt-9` does not exist or you do not have access to it.","code":"model_not_found"}}',
    })
    const ctx = errorContext(resolveProviderConfig("openai", { apiKey: "k", baseURL: "", model: "gpt-9" }))
    const report = analyzeError(err, ENGLISH, ctx)
    expect(report.hints).toEqual([ENGLISH.t("hintModel", ["gpt-9"])])
  })

  it("covers 429 and the extraction order of JSON bodies", () => {
    const err = new APICallError({ message: "", url: "https://api.groq.com/openai/v1/chat/completions", requestBodyValues: {}, statusCode: 429, responseBody: '{"msg":"slow down"}' })
    expect(analyzeError(err, ENGLISH).hints).toEqual([ENGLISH.t("hintRateLimit")])
    expect(summarizeResponseBody('{"error":"bad thing"}')).toEqual({ kind: "text", text: "bad thing" })
    expect(summarizeResponseBody('{"message":"m","detail":"d"}')).toEqual({ kind: "text", text: "m" })
    expect(summarizeResponseBody('{"errors":[{"message":"first"}]}')).toEqual({ kind: "text", text: "first" })
    expect(summarizeResponseBody('{"detail":[{"msg":"field required"}]}')).toEqual({ kind: "text", text: "field required" })
    expect(summarizeResponseBody("")).toEqual({ kind: "none" })
    expect(httpStatusLine(405, "")).toBe("405 Method Not Allowed")
    expect(httpStatusLine(799)).toBe("799")
  })

  it("unwraps RetryError and describes other AI SDK errors", () => {
    const retry = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [new Error("x"), platform405()] })
    expect(describeError(retry, ENGLISH, deepseekCtx("https://platform.deepseek.com"))).toContain("405 Method Not Allowed")
    expect(describeError(new NoContentGeneratedError(), ENGLISH, { service: "DeepSeek" })).toContain(ENGLISH.t("errNoContent", ["DeepSeek"]))
    const parse = new JSONParseError({ text: "<html><body>Login</body></html>", cause: new SyntaxError("Unexpected token <") })
    const text = describeError(parse, ENGLISH, deepseekCtx("https://platform.deepseek.com"))
    expect(text).toContain(ENGLISH.t("errUnreadableResponse", ["DeepSeek"]))
    expect(text).toContain(ENGLISH.t("hintHtmlResponse"))
  })
})

describe("secrets in error texts", () => {
  it.each([
    ["a token path segment", "https://api.deeplx.org/u7Rk29xQpL4mZ8vT1nW5/translate", "https://api.deeplx.org/***/translate"],
    ["credential parameters", "https://x.example/t?token=abc&key=k1&api-version=3.0&access_token=z", "https://x.example/t?token=***&key=***&api-version=3.0&access_token=***"],
    ["user info", "https://user:pw@x.example/v1", "https://***:***@x.example/v1"],
    ["nothing secret: left as it is", "https://api.deepseek.com/chat/completions", "https://api.deepseek.com/chat/completions"],
    ["a model name with dots", "https://g.example/v1beta/models/gemini-2.5-flash-preview-0520:generateContent", "https://g.example/v1beta/models/gemini-2.5-flash-preview-0520:generateContent"],
    ["no URL", "not a url", "not a url"],
  ])("masks %s", (_name, url, expected) => {
    expect(redactUrl(url)).toBe(expected)
  })

  it("never shows the DeepLX token of the request, in the URL line, the hints or the server message", async () => {
    const token = "tok-12/ab"
    const provider = resolveProviderConfig("deeplx", { apiKey: token, baseURL: "https://dlx.example/{{apiKey}}/translate", model: "" })
    const url = `https://dlx.example/${encodeURIComponent(token)}/translate`
    const error = new HttpError("DeepLX request failed: HTTP 401", 401, undefined, undefined, url, `{"message":"bad token ${token}"}`)
    const text = describeError(error, ENGLISH, errorContext(provider))
    expect(text).toContain("Request URL: https://dlx.example/***/translate")
    expect(text).not.toContain(token)
    expect(text).not.toContain(encodeURIComponent(token))
    // The same through the service, as the page and the popup show it.
    const fetchFn = vi.fn(async () => new Response(`{"message":"bad token ${token}"}`, { status: 401 }))
    const settings = createDefaultSettings()
    settings.providers.deeplx = { enabled: true, apiKey: token, baseURL: "https://dlx.example/{{apiKey}}/translate", model: "" }
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) })
    const shown = await translateOne(service, { text: "Hello", providerId: "deeplx" }).catch((e: Error) => e.message)
    expect(shown).toContain("***")
    expect(shown).not.toContain(token)
    expect(shown).not.toContain(encodeURIComponent(token))
  })
})

describe("describeError: other errors", () => {
  it("explains a network failure with the host and what to check", () => {
    const err = new TypeError("NetworkError when attempting to fetch resource.")
    const text = describeError(err, zh, deepseekCtx(""))
    expect(firstLine(text)).toBe("DeepSeek：无法连接到 api.deepseek.com")
    expect(text).toContain(zh.t("hintNetwork"))
    expect(text).toContain("NetworkError when attempting to fetch resource.")

    const wrapped = new NetworkError("https://edge.microsoft.com/translate/translatetext?to=zh", err)
    expect(firstLine(describeError(wrapped, ENGLISH, { service: "Microsoft Translator", kind: "microsoft" }))).toBe(
      "Microsoft Translator: could not connect to edge.microsoft.com",
    )
  })

  it("describes HTTP errors of the free translators like API errors", async () => {
    const fetchFn = vi.fn(async () => new Response("<html><body>blocked</body></html>", { status: 403 }))
    const error = await googleTranslateBatch(["a"], { source: "auto", target: "zh-CN" }, { baseURL: "https://translate.googleapis.com" }, { fetchFn: asFetch(fetchFn) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    const text = describeError(error, ENGLISH, { service: "Google Translate", kind: "google" })
    expect(text).toContain("HTTP 403 Forbidden")
    expect(text).toContain(ENGLISH.t("hintHtmlResponse"))
    expect(text).toContain("https://translate.googleapis.com/translate_a/t?")
  })

  it("wraps fetch failures of the free translators with their URL", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("NetworkError when attempting to fetch resource.")
    })
    const error = await googleTranslateBatch(["a"], { source: "auto", target: "zh-CN" }, { baseURL: "https://translate.googleapis.com" }, { fetchFn: asFetch(fetchFn) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NetworkError)
    expect(describeError(error, ENGLISH, { service: "Google Translate", kind: "google" })).toContain("translate.googleapis.com")
  })

  it("never returns an empty string", () => {
    for (const [i, value] of [new Error(""), new Error(), "", undefined, null, {}, 0, Object.create(null)].entries()) {
      const text = describeError(value, zh)
      expect(text.trim().length, `value #${i}`).toBeGreaterThan(0)
    }
    expect(describeError(new Error(""), zh)).toBe("未知错误")
    const named = new Error("")
    named.name = "AbortError"
    expect(describeError(named, ENGLISH)).toBe("AbortError")
    expect(describeError(42, ENGLISH)).toBe("42")
    expect(describeError({ code: 7 }, ENGLISH)).toBe('{"code":7}')
  })
})

describe("full pipeline", () => {
  it("TranslationService.testProvider reports the 405 of a console URL (statusText empty)", async () => {
    const fetchFn = vi.fn(async () => new Response('{"detail":"Method Not Allowed"}', { status: 405, statusText: "", headers: { "content-type": "application/json" } }))
    const { service } = createService(createDefaultSettings(), { fetchFn: asFetch(fetchFn), i18n: () => zh })
    const error = await service.testProvider("deepseek", { apiKey: "sk-test", baseURL: "https://platform.deepseek.com", model: "" }, "zh-CN").catch((e: Error) => e)
    const text = (error as Error).message
    expect(text.split("\n")).toEqual([
      "DeepSeek 请求失败：HTTP 405 Method Not Allowed",
      "接口地址或模型名可能有误，请检查接口地址。",
      "platform.deepseek.com 是网站（控制台、文档或聊天页面），不是 API 接口地址。",
      "DeepSeek 的默认接口地址是 https://api.deepseek.com，当前填写的是 https://platform.deepseek.com。",
      "请求地址：https://platform.deepseek.com/chat/completions",
    ])
  })
})

describe("checkBaseURL", () => {
  it("warns about console and documentation hosts", () => {
    expect(checkBaseURL("https://platform.deepseek.com")).toEqual({ kind: "webPage", host: "platform.deepseek.com" })
    expect(checkBaseURL("https://platform.openai.com/v1")).toEqual({ kind: "webPage", host: "platform.openai.com" })
    expect(checkBaseURL("https://console.anthropic.com")?.kind).toBe("webPage")
    expect(checkBaseURL("https://aistudio.google.com/")?.kind).toBe("webPage")
    expect(checkBaseURL("https://console.groq.com")?.kind).toBe("webPage")
  })

  it("accepts API endpoints and empty values", () => {
    expect(checkBaseURL("https://api.deepseek.com")).toBeNull()
    expect(checkBaseURL("")).toBeNull()
    expect(checkBaseURL("http://localhost:11434/v1")).toBeNull()
    expect(checkBaseURL("https://api.deeplx.org/{{apiKey}}/translate")).toBeNull()
  })

  it("flags malformed URLs", () => {
    expect(checkBaseURL("api.deepseek.com")).toEqual({ kind: "invalid" })
    expect(checkBaseURL("ftp://api.deepseek.com")).toEqual({ kind: "invalid" })
    expect(checkBaseURL("https://")).toEqual({ kind: "invalid" })
  })

  it("never flags a preset's own default endpoint", () => {
    for (const p of PROVIDER_PRESETS) if (p.defaultBaseURL) expect(checkBaseURL(p.defaultBaseURL), p.id).toBeNull()
  })
})

/* ---------- settings page ---------- */

describe("settings page", () => {
  beforeEach(() => useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function openOptions(testResponse: unknown) {
    const settings = createDefaultSettings("zh-CN")
    settings.uiLanguage = "zh_CN"
    settings.tiers.ai = "deepseek"
    settings.providers.deepseek = { enabled: true, apiKey: "sk-test", baseURL: "https://platform.deepseek.com", model: "" }
    const page = await openPage("options", settings, { uiLanguage: "zh-CN", respond: (req) => (req.type === "testProvider" ? testResponse : undefined) })
    await until(() => expect(document.querySelector("#providerPanel button")).not.toBeNull())
    return page
  }

  it("shows the full failure reason of the connection test, one item per line", async () => {
    const description = describeError(platform405(), zh, deepseekCtx("https://platform.deepseek.com"))
    const { sendMessage } = await openOptions({ ok: false, error: description })
    const test = Array.from(document.querySelectorAll<HTMLButtonElement>("#providerPanel button")).find((b) => b.textContent === zh.t("buttonTest"))!
    test.click()
    await until(() => expect(document.querySelector(".test-result.fail")).not.toBeNull())
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "testProvider", providerId: "deepseek" }))
    const box = document.querySelector(".test-result.fail")!
    expect(box.querySelector(".test-title")?.textContent).toBe("连接测试失败")
    expect(box.querySelector(".test-reason")?.textContent).toBe("DeepSeek 请求失败：HTTP 405 Method Not Allowed")
    const lines = Array.from(box.querySelectorAll(".test-line")).map((el) => el.textContent)
    expect(lines).toContain("请求地址：https://platform.deepseek.com/chat/completions")
    expect(lines.some((l) => l?.includes("https://api.deepseek.com"))).toBe(true)
  })

  it("never shows an empty failure", async () => {
    await openOptions({ ok: false, error: "" })
    const test = Array.from(document.querySelectorAll<HTMLButtonElement>("#providerPanel button")).find((b) => b.textContent === zh.t("buttonTest"))!
    test.click()
    await until(() => expect(document.querySelector(".test-result.fail .test-reason")?.textContent).toBe("未知错误"))
  })

  it("warns about a console URL under the endpoint field and restores the default", async () => {
    await openOptions({ ok: true, text: "你好" })
    const warning = document.querySelector<HTMLElement>("#providerPanel .field-warning")!
    expect(warning.hidden).toBe(false)
    expect(warning.textContent).toContain("platform.deepseek.com")
    expect(warning.textContent).toContain(getPreset("deepseek")!.defaultBaseURL)
    const restore = Array.from(warning.querySelectorAll("button")).find((b) => b.textContent === zh.t("buttonRestoreBaseUrl"))!
    restore.click()
    expect(warning.hidden).toBe(true)
    const input = document.querySelector<HTMLInputElement>('.field-group input[type="text"]')!
    expect(input.value).toBe("")
    expect(input.placeholder).toBe("https://api.deepseek.com")

    input.value = "https://api.deepseek.com"
    input.dispatchEvent(new Event("change"))
    expect(warning.hidden).toBe(true)
    input.value = "not a url"
    input.dispatchEvent(new Event("change"))
    expect(warning.hidden).toBe(false)
    expect(warning.textContent).toContain(zh.t("warnBaseUrlInvalid"))
  })
})

describe("describeError: every kind of error", () => {
  const t = (key: Parameters<typeof ENGLISH.t>[0], args: string[] = []) => ENGLISH.t(key, args)
  const named = (name: string, props: Record<string, unknown> = {}) => Object.assign(new Error(String(props.message ?? "")), { name }, props)
  const circular: Record<string, unknown> = {}
  circular.self = circular

  it.each<[string, unknown, ErrorContext, Partial<ReturnType<typeof analyzeError>>]>([
    ["LocalizedError with a hint", new LocalizedError("errDictionaryMissing", ["fr → de"], undefined, "hintDictionaryDownload"), {}, { reason: t("errDictionaryMissing", ["fr → de"]), hints: [t("hintDictionaryDownload")] }],
    ["LocalizedError with a detail", new LocalizedError("errUnknownProvider", ["x"], "more"), {}, { reason: `${t("errUnknownProvider", ["x"])} - more`, hints: [] }],
    ["NetworkError without cause", new NetworkError("https://platform.deepseek.com/v1/chat"), { service: "DeepSeek" }, { reason: t("errNetwork", ["DeepSeek", "platform.deepseek.com"]), serverMessage: undefined, hints: [t("hintNetwork"), t("hintWebHost", ["platform.deepseek.com"])] }],
    ["APICallError without status", named("AI_APICallError", { message: "fetch failed" }), { baseURL: "https://api.x.example/v1" }, { reason: t("errNetwork", ["api.x.example", "api.x.example"]), serverMessage: "fetch failed" }],
    ["TypeError without URL", new TypeError("Failed to fetch"), {}, { reason: t("errNetworkNoHost", ["API"]), serverMessage: "Failed to fetch" }],
    ["empty response body", named("AI_EmptyResponseBodyError"), { service: "Groq" }, { reason: t("errNoContent", ["Groq"]), hints: [] }],
    ["invalid response data", named("AI_InvalidResponseDataError", { data: { foo: 1 } }), { service: "Groq" }, { reason: t("errUnreadableResponse", ["Groq"]), serverMessage: '{"foo":1}', hints: [t("hintNotApi")] }],
    ["type validation", named("AI_TypeValidationError", { value: { error: { message: "bad" } } }), { service: "Groq" }, { serverMessage: "bad", hints: [t("hintNotApi")] }],
    ["no such model, model known", named("AI_NoSuchModelError", { message: "No such model: x" }), { model: "x" }, { reason: "No such model: x", hints: [t("hintModel", ["x"])] }],
    ["no such model, no message", named("AI_NoSuchModelError"), {}, { reason: "AI_NoSuchModelError", hints: [t("hintModelGeneric")] }],
    ["missing API key", named("AI_LoadAPIKeyError", { message: "API key is missing" }), {}, { reason: "API key is missing", hints: [t("hintAuth")] }],
    ["service code 401 without request details", Object.assign(new Error("DeepLX: unauthorized"), { status: 401 }), {}, { reason: "DeepLX: unauthorized", hints: [t("hintAuth")] }],
    ["service code 503", Object.assign(new Error("busy"), { status: 503 }), {}, { hints: [t("hintServerError")] }],
    ["timeout", new DOMException("The operation timed out.", "TimeoutError"), {}, { reason: "The operation timed out." }],
    ["empty error with a cause", new Error("", { cause: new Error("inner reason") }), {}, { reason: "inner reason" }],
    ["object with its own text", { toString: () => "custom text" }, {}, { reason: "custom text" }],
    ["circular object", circular, {}, { reason: t("errUnknown") }],
    ["blank string", "   ", {}, { reason: t("errUnknown") }],
  ])("%s", (_name, error, ctx, expected) => {
    const report = analyzeError(error, ENGLISH, ctx)
    expect(report).toMatchObject(expected)
    expect(describeError(error, ENGLISH, ctx).trim()).not.toBe("")
  })

  it("reads HTTP failures: status phrase for an empty statusText, server message, hints and URL", () => {
    const http = (status: number, responseBody: unknown, message = "") =>
      Object.assign(new Error(message), { statusCode: status, statusText: "", url: "https://api.x.example/v1/chat", responseBody })
    const ctx: ErrorContext = { service: "X", kind: "llm", baseURL: "https://api.x.example/v1", defaultBaseURL: "https://api.x.example/v1" }
    expect(analyzeError(http(404, ""), ENGLISH, ctx)).toEqual({
      reason: t("errHttp", ["X", "404 Not Found"]),
      serverMessage: undefined,
      hints: [t("hintEndpoint"), t("hintEndpointDefault", ["X", "https://api.x.example/v1"])],
      url: "https://api.x.example/v1/chat",
    })
    expect(analyzeError(http(502, undefined, "upstream down"), ENGLISH, ctx)).toMatchObject({ serverMessage: "upstream down", hints: [t("hintServerError")] })
    expect(analyzeError(http(500, "Internal Server Error"), ENGLISH, ctx).serverMessage).toBeUndefined()
    expect(analyzeError(http(402, '{"error":{"code":1},"error_msg":"balance"}'), ENGLISH, ctx)).toMatchObject({ serverMessage: "balance", hints: [t("hintRateLimit")] })
    expect(analyzeError(http(400, "{not json"), ENGLISH, ctx).serverMessage).toBe("{not json")
    // A status outside HTTP is not an HTTP failure.
    expect(analyzeError(Object.assign(new Error("odd"), { statusCode: 42, url: "https://x" }), ENGLISH).reason).toBe("odd")
    expect(analyzeError({ status: 500, data: { message: "from data" }, url: "https://x.example" }, ENGLISH).serverMessage).toBe("from data")
  })

  it("summarizes bodies of every type", () => {
    expect(summarizeResponseBody(null)).toEqual({ kind: "none" })
    expect(summarizeResponseBody({})).toEqual({ kind: "none" })
    expect(summarizeResponseBody({ error: { message: "deep" } })).toEqual({ kind: "text", text: "deep" })
    expect(summarizeResponseBody([{ msg: "first" }])).toEqual({ kind: "text", text: "first" })
    expect(summarizeResponseBody({ error: { code: 1 }, errors: [] })).toEqual({ kind: "text", text: '{"error":{"code":1},"errors":[]}' })
    expect(summarizeResponseBody(circularBody())).toEqual({ kind: "none" })
    expect(summarizeResponseBody('"just text"')).toEqual({ kind: "text", text: '"just text"' })
    // A blank message is no message: the body is quoted, whitespace collapsed.
    expect(summarizeResponseBody('{"error":"  "}')).toEqual({ kind: "text", text: '{"error":" "}' })
    expect(summarizeResponseBody("<!DOCTYPE html><title>x</title>")).toEqual({ kind: "html" })
    expect(summarizeResponseBody(42)).toEqual({ kind: "text", text: "42" })
  })

  it("takes the first line of a description", () => {
    expect(firstLine("a\nb")).toBe("a")
    expect(firstLine("")).toBe("")
  })
})

function circularBody() {
  const o: Record<string, unknown> = { code: 1 }
  o.self = o
  return o
}

describe("describeError: remaining shapes", () => {
  it("covers bare texts, causes and bodies without a message", () => {
    expect(renderErrorText({ key: "errUnknown" }, ENGLISH)).toBe(ENGLISH.t("errUnknown"))
    expect(new NetworkError("not a url", "plain cause").message).toBe("Could not connect to not a url")
    expect(new NetworkError("https://a.example/x", new Error("")).message).toBe("Could not connect to a.example")
    expect(summarizeResponseBody('["  "]')).toEqual({ kind: "text", text: '[" "]' })
    expect(summarizeResponseBody('["first"]')).toEqual({ kind: "text", text: "first" })
    expect(summarizeResponseBody({ detail: { loc: 1 }, msg: "later key" })).toEqual({ kind: "text", text: "later key" })
    expect(analyzeError({ statusCode: 500, responseBody: "down" }, ENGLISH)).toMatchObject({ reason: ENGLISH.t("errHttp", ["API", "500 Internal Server Error"]), url: undefined })
    const apiCall = Object.assign(new Error(""), { name: "AI_APICallError", url: "https://a.example/v1", cause: new Error("ECONNREFUSED") })
    expect(analyzeError(apiCall, ENGLISH).serverMessage).toBe("ECONNREFUSED")
    expect(analyzeError(Object.assign(new Error(""), { name: "AI_LoadAPIKeyError" }), ENGLISH).reason).toBe("AI_LoadAPIKeyError")
  })

  it("compares endpoints and reads hosts of malformed URLs", () => {
    expect(urlHost("not a url")).toBe("")
    expect(urlHost(undefined)).toBe("")
    expect(urlHost("https://x.example/{{apiKey}}/t")).toBe("x.example")
    expect(sameEndpoint("https://API.example.com/v1/", "https://api.example.com/v1")).toBe(true)
    expect(sameEndpoint(" not a url/ ", "not a url")).toBe(true)
    expect(sameEndpoint("https://a.example/v1", "https://a.example/v2")).toBe(false)
  })
})

describe("G1: a free route that cannot be reached", () => {
  it("names the services that work without it after a network failure or a timeout, Google with mainland China", () => {
    const network = new NetworkError("https://translate.googleapis.com/translate_a/t", new TypeError("NetworkError when attempting to fetch resource."))
    expect(describeError(network, ENGLISH, { service: "Google", kind: "google" })).toContain(ENGLISH.t("hintUnreachableGoogle"))
    expect(describeError(new TimeoutError("Microsoft", 60_000), ENGLISH, { service: "Microsoft", kind: "microsoft" })).toContain(ENGLISH.t("hintUnreachableMicrosoft"))
    // With an Azure key, another service, or another failure: no such hint.
    expect(describeError(new TimeoutError("Microsoft", 60_000), ENGLISH, { kind: "microsoft", keyMode: true })).not.toContain(ENGLISH.t("hintUnreachableMicrosoft"))
    expect(describeError(network, ENGLISH, { kind: "deepl" })).not.toContain("mainland China")
    expect(describeError(new HttpError("x", 403, undefined, undefined, "https://translate.googleapis.com/x"), ENGLISH, { kind: "google" })).not.toContain("mainland China")
    expect(isUnreachable(Object.assign(new Error("retry"), { name: "AI_RetryError", lastError: network }))).toBe(true)
    expect(isUnreachable("text")).toBe(false)
  })
})
