import { beforeEach, describe, expect, it, vi } from "vitest"
import { errorContext } from "../src/background/service"
import {
  AZURE_LIMITS,
  azureTranslateBatch,
  buildAzureRequest,
  MS_API_URL,
  MS_AUTH_URL,
  MS_EDGE_TRANSLATE_URL,
  microsoftTranslateBatch,
  resetMicrosoftState,
} from "../src/background/translators/microsoft"
import { describeError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { createDefaultSettings, normalizeSettings, resolveProvider, type Settings, toPublicSettings } from "../src/shared/settings"
import { asFetch, createService, jsonResponse } from "./helpers"

const AZURE_URL = "https://api.cognitive.microsofttranslator.com/translate"
const azure = { apiKey: "KEY", region: "westeurope", endpoint: AZURE_URL }

/** An Azure-style fake: answers every `{Text}` with `ZH(Text)`. */
function azureFetch() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const items = JSON.parse(String(init.body)) as { Text: string }[]
    return jsonResponse(items.map((i) => ({ translations: [{ text: `ZH(${i.Text})`, to: "zh-Hans" }] })))
  })
}

describe("Azure Translator request", () => {
  it("builds the v3 translate request with key and region headers", () => {
    const { url, init } = buildAzureRequest(["Hello", "World"], "zh-Hans", azure)
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe(AZURE_URL)
    expect([...u.searchParams.keys()]).toEqual(["api-version", "to"])
    expect(u.searchParams.get("api-version")).toBe("3.0")
    expect(u.searchParams.get("to")).toBe("zh-Hans")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({
      "Content-Type": "application/json; charset=UTF-8",
      "Ocp-Apim-Subscription-Key": "KEY",
      "Ocp-Apim-Subscription-Region": "westeurope",
    })
    expect(JSON.parse(init.body!)).toEqual([{ Text: "Hello" }, { Text: "World" }])
  })

  it("leaves out the region header when no region is set (global resource)", () => {
    const { init } = buildAzureRequest(["Hello"], "de", { ...azure, region: "" })
    expect(init.headers).not.toHaveProperty("Ocp-Apim-Subscription-Region")
    expect(init.headers["Ocp-Apim-Subscription-Key"]).toBe("KEY")
  })

  it("uses a custom endpoint", () => {
    const endpoint = "https://my-res.cognitiveservices.azure.com/translator/text/v3.0/translate"
    const { url } = buildAzureRequest(["Hello"], "de", { ...azure, endpoint })
    expect(url).toBe(`${endpoint}?api-version=3.0&to=de`)
  })

  it("parses the response of the batch and keeps text as it is (no HTML decoding)", async () => {
    const f = vi.fn(async () => jsonResponse([{ translations: [{ text: "a &lt; b", to: "de" }] }, { translations: [{ text: "x", to: "de" }] }]))
    expect(await azureTranslateBatch(["a", "b"], "de", azure, { fetchFn: asFetch(f) })).toEqual(["a &lt; b", "x"])
  })

  it("rejects an answer with the wrong number of results", async () => {
    const f = vi.fn(async () => jsonResponse([{ translations: [{ text: "x" }] }]))
    await expect(azureTranslateBatch(["a", "b"], "de", azure, { fetchFn: asFetch(f) })).rejects.toThrow(/expected 2/)
  })

  it("asks for a key before sending anything", async () => {
    const f = azureFetch()
    await expect(azureTranslateBatch(["a"], "de", { ...azure, apiKey: "" }, { fetchFn: asFetch(f) })).rejects.toThrow(/API key is required/)
    expect(f).not.toHaveBeenCalled()
  })

  it("surfaces HTTP errors with their status and URL", async () => {
    const f = vi.fn(async () => new Response('{"error":{"code":401000,"message":"The request is not authorized because credentials are missing or invalid."}}', { status: 401 }))
    await expect(azureTranslateBatch(["a"], "de", azure, { fetchFn: asFetch(f) })).rejects.toMatchObject({ status: 401, url: expect.stringContaining(AZURE_URL) })
  })
})

describe("Azure Translator limits", () => {
  it("uses the documented limits: 1000 elements and 50,000 characters per request", () => {
    expect(AZURE_LIMITS).toEqual({ maxItems: 1000, maxChars: 50_000 })
  })

  it("splits more than 1000 paragraphs into several requests and keeps the order", async () => {
    const f = azureFetch()
    const texts = Array.from({ length: 2500 }, (_, i) => `t${i}`)
    const out = await azureTranslateBatch(texts, "zh-Hans", azure, { fetchFn: asFetch(f) })
    expect(out).toEqual(texts.map((t) => `ZH(${t})`))
    expect(f.mock.calls.map(([, init]) => JSON.parse(String(init.body)).length)).toEqual([1000, 1000, 500])
  })

  it("splits requests that would exceed 50,000 characters", async () => {
    const f = azureFetch()
    const texts = ["a".repeat(30_000), "b".repeat(30_000), "c".repeat(20_000), "d".repeat(30_000)]
    const out = await azureTranslateBatch(texts, "zh-Hans", azure, { fetchFn: asFetch(f) })
    expect(out).toEqual(texts.map((t) => `ZH(${t})`))
    const sizes = f.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as { Text: string }[]).reduce((n, i) => n + i.Text.length, 0))
    expect(sizes).toEqual([30_000, 50_000, 30_000])
    expect(Math.max(...sizes)).toBeLessThanOrEqual(50_000)
  })
})

describe("Microsoft free mode stays as it was", () => {
  beforeEach(() => resetMicrosoftState())

  it("without Azure options it still tries the token route and then the direct route", async () => {
    const calls: string[] = []
    const f = vi.fn(async (url: string) => {
      calls.push(url.split("?")[0])
      if (url === MS_AUTH_URL) return new Response("", { status: 404 })
      return jsonResponse([{ translations: [{ text: "你好" }] }])
    })
    expect(await microsoftTranslateBatch(["Hello"], "zh-Hans", { fetchFn: asFetch(f) })).toEqual(["你好"])
    expect(calls).toEqual([MS_AUTH_URL, MS_EDGE_TRANSLATE_URL])
    expect(calls).not.toContain(AZURE_URL)
    expect(MS_API_URL).not.toBe(AZURE_URL)
  })

  it("with Azure options it does not touch the Edge endpoints", async () => {
    const f = azureFetch()
    expect(await microsoftTranslateBatch(["Hello"], "zh-Hans", { fetchFn: asFetch(f), azure })).toEqual(["ZH(Hello)"])
    expect(f.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([AZURE_URL])
  })
})

describe("Microsoft settings", () => {
  const keyed = (over: Partial<Settings["providers"][string]> = {}): Settings => {
    const s = createDefaultSettings("en")
    s.providers["microsoft-free"] = { ...s.providers["microsoft-free"], mode: "key", apiKey: " KEY ", region: " westeurope ", ...over }
    return s
  }

  it("defaults to free mode; mode, key and region survive normalization", () => {
    expect(resolveProvider(createDefaultSettings("en"), "microsoft-free")).toMatchObject({ mode: "free", apiKey: "", region: "", baseURL: AZURE_URL })
    const next = normalizeSettings(JSON.parse(JSON.stringify(keyed({ baseURL: "https://x.example.com/translate/" }))))
    expect(next.providers["microsoft-free"]).toMatchObject({ mode: "key", apiKey: " KEY ", region: " westeurope ", baseURL: "https://x.example.com/translate/" })
    expect(resolveProvider(next, "microsoft-free")).toMatchObject({ mode: "key", apiKey: "KEY", region: "westeurope", baseURL: "https://x.example.com/translate" })
  })

  it("ignores an unknown mode, and the key mode of other services", () => {
    const s = createDefaultSettings("en")
    const raw = JSON.parse(JSON.stringify(s))
    raw.providers["microsoft-free"].mode = "other"
    raw.providers.openai = { enabled: true, apiKey: "k", baseURL: "", model: "", mode: "key" }
    const next = normalizeSettings(raw)
    expect(next.providers["microsoft-free"].mode).toBeUndefined()
    expect(resolveProvider(next, "openai").mode).toBe("free")
  })

  it("does not tell content scripts about the key", () => {
    const key = keyed()
    key.activeProviderId = "microsoft-free"
    expect(JSON.stringify(toPublicSettings(key))).not.toContain("KEY")
  })
})

const service = (settings: Settings, fetchFn: typeof fetch) => createService(settings, { fetchFn }).service

describe("TranslationService with Azure Translator", () => {
  const keySettings = (): Settings => {
    const s = createDefaultSettings("en")
    s.providers["microsoft-free"] = { ...s.providers["microsoft-free"], mode: "key", apiKey: "KEY", region: "westeurope" }
    return s
  }

  beforeEach(() => resetMicrosoftState())

  it("sends one Azure request per window and caches the results", async () => {
    const f = azureFetch()
    const svc = service(keySettings(), asFetch(f))
    const req = (text: string) => ({ text, targetLang: "zh-CN", providerId: "microsoft-free" })
    expect(await Promise.all(["One", "Two", "Three"].map((t) => svc.translate(req(t))))).toEqual(["ZH(One)", "ZH(Two)", "ZH(Three)"])
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toBe(`${AZURE_URL}?api-version=3.0&to=zh-Hans`)
    expect((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("KEY")
    expect(await svc.translate(req("Two"))).toBe("ZH(Two)")
    expect(f).toHaveBeenCalledTimes(1)
  })

  it("is not capped at the 100 paragraphs and 5000 characters of the free route, only at the user's batch settings and Azure's limits", async () => {
    const f = azureFetch()
    const settings = keySettings()
    settings.batch.maxItemsPerBatch = 200
    settings.batch.maxCharsPerBatch = 50_000
    const svc = service(settings, asFetch(f))
    const texts = Array.from({ length: 150 }, (_, i) => `p${i}`)
    await Promise.all(texts.map((text) => svc.translate({ text, targetLang: "zh-CN", providerId: "microsoft-free" })))
    expect(f.mock.calls.map(([, init]) => JSON.parse(String(init.body)).length)).toEqual([150])
  })

  it("keeps the free route's caps in free mode", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const items = JSON.parse(String(init.body)) as string[]
      return jsonResponse(items.map((t) => ({ translations: [{ text: `ZH(${t})` }] })))
    })
    const settings = createDefaultSettings("en")
    settings.batch.maxItemsPerBatch = 200
    settings.batch.maxCharsPerBatch = 50_000
    const svc = service(settings, asFetch(f))
    const texts = Array.from({ length: 150 }, (_, i) => `p${i}`)
    await Promise.all(texts.map((text) => svc.translate({ text, targetLang: "zh-CN", providerId: "microsoft-free" })))
    const sizes = f.mock.calls.filter(([url]) => String(url).startsWith(MS_EDGE_TRANSLATE_URL)).map(([, init]) => JSON.parse(String(init.body)).length)
    expect(sizes).toEqual([100, 50])
    expect(f.mock.calls.some(([url]) => String(url).startsWith(AZURE_URL))).toBe(false)
  })

  it("tests the unsaved configuration in key mode and in free mode", async () => {
    const f = azureFetch()
    const svc = service(createDefaultSettings("en"), asFetch(f))
    expect(await svc.testProvider("microsoft-free", { apiKey: "K2", baseURL: "", model: "", mode: "key", region: "" }, "zh-CN")).toMatch(/^ZH\(/)
    const [url, init] = f.mock.calls[0]
    expect(String(url).startsWith(AZURE_URL)).toBe(true)
    expect(init.headers).toMatchObject({ "Ocp-Apim-Subscription-Key": "K2" })
    expect(init.headers).not.toHaveProperty("Ocp-Apim-Subscription-Region")

    const free = vi.fn(async (url: string) => (url === MS_AUTH_URL ? new Response("", { status: 404 }) : jsonResponse([{ translations: [{ text: "你好" }] }])))
    const svc2 = service(createDefaultSettings("en"), asFetch(free))
    expect(await svc2.testProvider("microsoft-free", { apiKey: "", baseURL: "", model: "" }, "zh-CN")).toBe("你好")
  })

  it("reports a wrong key with the Azure advice, and a missing key as such", async () => {
    const f = vi.fn(async () => new Response('{"error":{"code":401000,"message":"The request is not authorized because credentials are missing or invalid."}}', { status: 401 }))
    const settings = keySettings()
    const svc = service(settings, asFetch(f))
    const failure = await svc.translate({ text: "Hello", targetLang: "zh-CN", providerId: "microsoft-free" }).catch((e: Error) => e.message)
    expect(failure).toContain("HTTP 401")
    expect(failure).toContain(ENGLISH.t("hintAzureAuth"))
    expect(failure).toContain("credentials are missing or invalid")

    settings.providers["microsoft-free"].apiKey = ""
    const missing = await svc.translate({ text: "Other", targetLang: "zh-CN", providerId: "microsoft-free" }).catch((e: Error) => e.message)
    expect(missing).toContain("API key is required")
  })
})

describe("Azure error advice", () => {
  const ctx = (keyMode: boolean) => errorContext({ ...resolveProvider(createDefaultSettings("en"), "microsoft-free"), mode: keyMode ? "key" : "free" })
  const http = (status: number) => Object.assign(new Error(`HTTP ${status}`), { name: "HttpError", status, url: `${AZURE_URL}?api-version=3.0&to=de`, responseBody: "" })

  it.each([401, 403])("HTTP %i in key mode points at the Azure key and region", (status) => {
    const text = describeError(http(status), ENGLISH, ctx(true))
    expect(text).toContain(ENGLISH.t("hintAzureAuth"))
    expect(text).not.toContain(ENGLISH.t("hintAuth"))
  })

  it("keeps the generic key advice in free mode", () => {
    const text = describeError(http(401), ENGLISH, ctx(false))
    expect(text).toContain(ENGLISH.t("hintAuth"))
    expect(text).not.toContain(ENGLISH.t("hintAzureAuth"))
  })

  it("names the default endpoint after a 404 in key mode only", () => {
    expect(describeError(http(404), ENGLISH, ctx(true))).toContain(ENGLISH.t("hintEndpointDefault", ["Microsoft Translator", AZURE_URL]))
    expect(describeError(http(404), ENGLISH, ctx(false))).not.toContain(ENGLISH.t("hintEndpointDefault", ["Microsoft Translator", AZURE_URL]))
  })
})
