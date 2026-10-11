// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { APICallError, JSONParseError, NoContentGeneratedError, RetryError } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { compileMessagesJson, ENGLISH, I18n } from "../src/shared/i18n"
import { readLocaleSources, toMessagesJson } from "../scripts/locales.mjs"
import { analyzeError, describeError, type ErrorContext, firstLine, httpStatusLine, NetworkError, summarizeResponseBody } from "../src/shared/errors"
import { checkBaseURL, getPreset, PROVIDER_PRESETS } from "../src/shared/providers"
import { errorContext, TranslationService } from "../src/background/service"
import { PersistentCache } from "../src/background/cache"
import { HttpError } from "../src/background/queue/request-queue"
import { googleTranslateBatch } from "../src/background/translators/google"
import { createDefaultSettings, resolveProviderConfig } from "../src/shared/settings"

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
    const error = await googleTranslateBatch(["a"], "zh-CN", { fetchFn: fetchFn as unknown as typeof fetch }).catch((e: unknown) => e)
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
    const error = await googleTranslateBatch(["a"], "zh-CN", { fetchFn: fetchFn as unknown as typeof fetch }).catch((e: unknown) => e)
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
    const service = new TranslationService({
      getSettings: () => createDefaultSettings(),
      cache: new PersistentCache({ get: async () => undefined, set: async () => {}, remove: async () => {} }, 10, 0),
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: async () => {},
      i18n: () => zh,
    })
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
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function openOptions(testResponse: unknown) {
    const html = readFileSync(join(__dirname, "..", "static", "options.html"), "utf8")
    document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML
    const settings = createDefaultSettings("zh-CN")
    settings.uiLanguage = "zh_CN"
    settings.activeProviderId = "deepseek"
    settings.providers.deepseek = { enabled: true, apiKey: "sk-test", baseURL: "https://platform.deepseek.com", model: "" }
    const sendMessage = vi.fn(async (req: { type: string }) => {
      if (req.type === "testProvider") return testResponse
      if (req.type === "cacheStats") return { size: 0 }
      return undefined
    })
    const ext = {
      runtime: { sendMessage, getURL: (path: string) => `moz-extension://test/${path}` },
      storage: { local: { get: async () => ({ settings }), set: async () => {} }, onChanged: { addListener: () => {} } },
      i18n: { getUILanguage: () => "zh-CN" },
    }
    vi.stubGlobal("browser", ext)
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(toMessagesJson(sources.zh_CN))))
    await import("../src/options/index")
    await vi.waitFor(() => expect(document.querySelector("#providerPanel button")).not.toBeNull())
    return { sendMessage }
  }

  it("shows the full failure reason of the connection test, one item per line", async () => {
    const description = describeError(platform405(), zh, deepseekCtx("https://platform.deepseek.com"))
    const { sendMessage } = await openOptions({ ok: false, error: description })
    const test = Array.from(document.querySelectorAll<HTMLButtonElement>("#providerPanel button")).find((b) => b.textContent === zh.t("buttonTest"))!
    test.click()
    await vi.waitFor(() => expect(document.querySelector(".test-result.fail")).not.toBeNull())
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
    await vi.waitFor(() => expect(document.querySelector(".test-result.fail .test-reason")?.textContent).toBe("未知错误"))
  })

  it("warns about a console URL under the endpoint field and restores the default", async () => {
    await openOptions({ ok: true, text: "你好" })
    const warning = document.querySelector<HTMLElement>(".field-warning")!
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
