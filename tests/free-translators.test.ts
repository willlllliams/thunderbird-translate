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
  MS_EDGE_TRANSLATE_URL,
  microsoftTranslateBatch,
  parseMicrosoftResponse,
} from "../src/background/translators/microsoft"
import { asFetch, jsonResponse } from "./helpers"

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
    const out = await googleTranslateBatch(["Hello", "World", "Bye"], "zh-CN", { fetchFn: asFetch(fetchFn) })
    expect(out).toEqual(["你好", "世界", "再见"])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("falls back to per-paragraph requests when the batch shape is unexpected", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/translate_a/t")) return jsonResponse({ unexpected: true })
      return jsonResponse([[["译文", "src", null, null, 1]], null, "en"])
    })
    const out = await googleTranslateBatch(["a", "b"], "zh-CN", { fetchFn: asFetch(fetchFn) })
    expect(out).toEqual(["译文", "译文"])
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("surfaces HTTP errors with their status", async () => {
    const fetchFn = vi.fn(async () => new Response("Too Many Requests", { status: 429 }))
    await expect(googleTranslateBatch(["a"], "zh-CN", { fetchFn: asFetch(fetchFn) })).rejects.toMatchObject({ status: 429 })
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
    expect(await microsoftTranslateBatch(["Hello", "World"], "zh-Hans", { fetchFn: f })).toEqual(["你好", "世界"])
    expect(await microsoftTranslateBatch(["Hello", "World"], "zh-Hans", { fetchFn: f })).toEqual(["你好", "世界"])
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
    expect(await deeplxTranslate("Hello", "ZH", "https://d.example/translate", "", { fetchFn: asFetch(fetchFn) })).toBe("你好")
  })
})
