import { describe, expect, it, vi } from "vitest"
import { buildDeepLXRequest, deeplxTranslate, parseDeepLXResponse } from "../src/background/translators/deeplx"
import {
  buildGoogleBatchRequest,
  googleTranslateBatch,
  parseGoogleBatchResponse,
  parseGoogleSingleResponse,
} from "../src/background/translators/google"
import {
  buildMicrosoftEdgeRequest,
  decodeHtml,
  microsoftTranslateBatch,
  parseMicrosoftResponse,
} from "../src/background/translators/microsoft"
import { BatchParseError } from "../src/background/translators/common"
import { MS_EDGE_TRANSLATE_URL } from "../src/shared/hosts"
import { createDefaultSettings } from "../src/shared/settings"
import { asFetch, createService, jsonResponse, translateOne } from "./helpers"

const toChinese = { source: "auto", target: "zh-CN" }
const google = { baseURL: "https://translate.googleapis.com" }
const edge = { mode: "free" as const, apiKey: "", region: "", baseURL: "" }

describe("Google (gtx)", () => {
  it("builds one POST with a q parameter per paragraph", () => {
    const { url, init } = buildGoogleBatchRequest(["Hello world", "a & b = c?"], "zh-CN")
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe("https://translate.googleapis.com/translate_a/t")
    expect(u.searchParams.get("client")).toBe("gtx")
    expect(u.searchParams.get("sl")).toBe("auto")
    expect(u.searchParams.get("tl")).toBe("zh-CN")
    expect(init.method).toBe("POST")
    const body = new URLSearchParams(init.body)
    expect(body.getAll("q")).toEqual(["Hello world", "a & b = c?"])
  })

  it("sends a chosen source language as sl", () => {
    expect(new URL(buildGoogleBatchRequest(["Hallo"], "zh-CN", { source: "de" }).url).searchParams.get("sl")).toBe("de")
  })

  it("parses both response shapes and validates the count", () => {
    expect(parseGoogleBatchResponse([["你好", "en"], ["再见", "en"]], 2)).toEqual(["你好", "再见"])
    expect(parseGoogleBatchResponse(["你好", "再见"], 2)).toEqual(["你好", "再见"])
    expect(parseGoogleBatchResponse("你好", 1)).toEqual(["你好"])
    expect(() => parseGoogleBatchResponse([["你好", "en"]], 2)).toThrow(/expected 2/)
    expect(() => parseGoogleBatchResponse({ error: 1 }, 1)).toThrow()
  })

  it("parses translate_a/single sentence chunks", () => {
    const json = [[["你好。", "Hello.", null, null, 10], ["再见。", "Bye.", null, null, 10]], null, "en"]
    expect(parseGoogleSingleResponse(json)).toBe("你好。再见。")
  })

  it("sends one request for a batch (mock fetch)", async () => {
    const fetchFn = vi.fn(async () => jsonResponse([["你好", "en"], ["世界", "en"], ["再见", "en"]]))
    const out = await googleTranslateBatch(["Hello", "World", "Bye"], toChinese, google, { fetchFn: asFetch(fetchFn) })
    expect(out).toEqual(["你好", "世界", "再见"])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("reports an unexpected batch shape as BatchParseError, so the service can ask paragraph by paragraph", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ unexpected: true }))
    await expect(googleTranslateBatch(["a", "b"], toChinese, google, { fetchFn: asFetch(fetchFn) })).rejects.toBeInstanceOf(BatchParseError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("falls back to per-paragraph requests through the request queue: concurrency, retries, and a failure of one paragraph only", async () => {
    let running = 0
    let most = 0
    let failures = 0
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/translate_a/t")) return jsonResponse({ unexpected: true })
      const q = new URLSearchParams(String(init.body)).get("q")!
      most = Math.max(most, ++running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      // "b" fails once with 503 and is retried; "c" is refused for good.
      if (q === "b" && failures++ === 0) return new Response("busy", { status: 503 })
      if (q === "c") return new Response("bad", { status: 400 })
      return jsonResponse([[[`G(${q})`, q, null, null, 1]], null, "en"])
    })
    const settings = createDefaultSettings()
    settings.batch.concurrency = 2
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) })
    const out = await Promise.allSettled(["a", "b", "c", "d"].map((text) => translateOne(service, { text, providerId: "google-free" })))
    expect(out.map((r) => (r.status === "fulfilled" ? r.value : "failed"))).toEqual(["G(a)", "G(b)", "failed", "G(d)"])
    expect(most).toBe(2)
    expect(fetchFn).toHaveBeenCalledTimes(1 + 5)
  })

  it("surfaces HTTP errors with their status", async () => {
    const fetchFn = vi.fn(async () => new Response("Too Many Requests", { status: 429 }))
    await expect(googleTranslateBatch(["a"], toChinese, google, { fetchFn: asFetch(fetchFn) })).rejects.toMatchObject({ status: 429 })
  })
})

describe("Microsoft", () => {
  it("builds the direct Edge request with escaped text", () => {
    const { url, init } = buildMicrosoftEdgeRequest(["a < b & c"], "zh-Hans")
    expect(url.startsWith(`${MS_EDGE_TRANSLATE_URL}?`)).toBe(true)
    expect(new URL(url).searchParams.get("to")).toBe("zh-Hans")
    expect(JSON.parse(init.body!)).toEqual(["a &lt; b &amp; c"])
  })

  it("leaves out from for automatic detection and sends a chosen source language", () => {
    expect(new URL(buildMicrosoftEdgeRequest(["x"], "zh-Hans").url).searchParams.has("from")).toBe(false)
    expect(new URL(buildMicrosoftEdgeRequest(["x"], "zh-Hans", "de").url).searchParams.get("from")).toBe("de")
  })

  it("parses array responses and decodes entities on the direct route", () => {
    const json = [{ translations: [{ text: "你好", to: "zh-Hans" }] }, { translations: [{ text: "a &lt; b", to: "zh-Hans" }] }]
    expect(parseMicrosoftResponse(json, 2, true)).toEqual(["你好", "a < b"])
    expect(() => parseMicrosoftResponse(json, 3)).toThrow(/expected 3/)
    expect(() => parseMicrosoftResponse([{}], 1)).toThrow(/missing/)
    expect(decodeHtml("&amp;lt; &#39;x&#39; &#x4F60;")).toBe("&lt; 'x' 你")
  })

  it("sends every request to the direct route only", async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse([{ translations: [{ text: "你好" }] }, { translations: [{ text: "世界" }] }]))
    const f = asFetch(fetchFn)
    expect(await microsoftTranslateBatch(["Hello", "World"], toChinese, edge, { fetchFn: f })).toEqual(["你好", "世界"])
    expect(await microsoftTranslateBatch(["Hello", "World"], toChinese, edge, { fetchFn: f })).toEqual(["你好", "世界"])
    expect(fetchFn.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([MS_EDGE_TRANSLATE_URL, MS_EDGE_TRANSLATE_URL])
  })
})

describe("DeepLX", () => {
  it("builds the request with a bearer token or a URL placeholder", () => {
    const a = buildDeepLXRequest("Hello", "ZH", "https://deeplx.example/translate", "secret")
    expect(a.url).toBe("https://deeplx.example/translate")
    expect(a.init.headers.Authorization).toBe("Bearer secret")
    expect(JSON.parse(a.init.body!)).toEqual({ text: "Hello", source_lang: "auto", target_lang: "ZH" })

    const b = buildDeepLXRequest("Hello", "ZH", "https://api.deeplx.org/{{apiKey}}/translate", "k/1")
    expect(b.url).toBe("https://api.deeplx.org/k%2F1/translate")
    expect(b.init.headers.Authorization).toBeUndefined()

    expect(JSON.parse(buildDeepLXRequest("Hallo", "ZH", "https://d.example/translate", "", "DE").init.body!).source_lang).toBe("DE")
    expect(() => buildDeepLXRequest("x", "ZH", "", "")).toThrow(/endpoint/)
    expect(() => buildDeepLXRequest("x", "ZH", "https://x/{{apiKey}}", "")).toThrow(/token/)
  })

  it("parses DeepLX and DeepL response shapes", () => {
    expect(parseDeepLXResponse({ code: 200, data: "你好", alternatives: [] })).toBe("你好")
    expect(parseDeepLXResponse({ translations: [{ text: "你好" }] })).toBe("你好")
    expect(() => parseDeepLXResponse({ code: 429, message: "Too many requests" })).toThrow(/Too many/)
    expect(() => parseDeepLXResponse({})).toThrow(/unexpected/)
  })

  it("translates through fetch", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ code: 200, data: "你好" }))
    expect(await deeplxTranslate("Hello", toChinese, { baseURL: "https://d.example/translate", apiKey: "" }, { fetchFn: asFetch(fetchFn) })).toBe("你好")
  })
})

describe("edge cases of the free translators", () => {
  const never = () => vi.fn(async () => jsonResponse([]))

  it("send nothing for no paragraphs", async () => {
    const fetchFn = never()
    expect(await googleTranslateBatch([], toChinese, google, { fetchFn: asFetch(fetchFn) })).toEqual([])
    expect(await microsoftTranslateBatch([], toChinese, edge, { fetchFn: asFetch(fetchFn) })).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("Google: names a missing entry, rejects other single shapes and skips chunks without text", () => {
    expect(() => parseGoogleBatchResponse([["你好", "en"], [null]], 2)).toThrow(/2/)
    expect(() => parseGoogleSingleResponse({ sentences: [] })).toThrow()
    expect(() => parseGoogleSingleResponse([null])).toThrow()
    expect(parseGoogleSingleResponse([[["你好", "Hello"], [null, null, "Nǐ hǎo"], "x"]])).toBe("你好")
  })

  it("Google: uses a custom endpoint and the chosen source language on the fallback route too", async () => {
    const fetchFn = vi.fn(async (url: string) => (url.includes("/translate_a/t") ? jsonResponse(null) : jsonResponse([[["你好", "Hallo"]]])))
    const settings = createDefaultSettings()
    settings.providers["google-free"].baseURL = "https://gt.example.com/"
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) })
    expect(await translateOne(service, { text: "Hallo", sourceLang: "de", providerId: "google-free" })).toBe("你好")
    const urls = fetchFn.mock.calls.map(([url]) => new URL(url))
    expect(urls.map((u) => u.origin + u.pathname)).toEqual(["https://gt.example.com/translate_a/t", "https://gt.example.com/translate_a/single"])
    expect(urls.map((u) => u.searchParams.get("sl"))).toEqual(["de", "de"])
  })

  it("Microsoft: rejects an answer that is not a list", () => {
    expect(() => parseMicrosoftResponse({ error: { code: 401000 } }, 1)).toThrow(/unexpected/i)
  })

  it("DeepLX: reports a service code without a message", () => {
    expect(() => parseDeepLXResponse({ code: 503 })).toThrow(expect.objectContaining({ status: 503, i18nText: { key: "errServiceCode", args: ["DeepLX", "503"] } }))
  })
})

it("Microsoft: decodes decimal character references", () => {
  expect(decodeHtml("&#20320;&#22909; &quot;x&quot; &apos;y&apos;")).toBe(`你好 "x" 'y'`)
})
