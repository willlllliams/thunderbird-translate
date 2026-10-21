/**
 * The machine translators with the user's own account: DeepL, Baidu, Youdao and Caiyun. Their requests (signatures
 * checked against the examples of the official documentation and against Node's crypto), the language codes, the
 * batches and their limits, the error codes, and how the translation service uses them. No request leaves the test.
 */
import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { isRetryableError } from "../src/background/queue/request-queue"
import { BAIDU_LANGS, BAIDU_LIMITS, BAIDU_PREMIUM_ONLY, baiduTranslateBatch, baiduTranslateSingle, buildBaiduRequest, parseBaiduResponse } from "../src/background/translators/baidu"
import { buildCaiyunRequest, caiyunDirection, caiyunTranslateBatch, parseCaiyunResponse } from "../src/background/translators/caiyun"
import { codeError, httpCodeError } from "../src/background/translators/codes"
import { buildDeeplRequest, deeplSource, deeplTarget, deeplTranslateBatch, deeplUsage, parseDeeplResponse } from "../src/background/translators/deepl"
import { BatchParseError } from "../src/background/translators/llm-prompt"
import { buildYoudaoRequest, parseYoudaoResponse, youdaoInput, youdaoLang, youdaoTranslateBatch } from "../src/background/translators/youdao"
import { describeError, LocalizedError } from "../src/shared/errors"
import { HttpError } from "../src/shared/http"
import { ENGLISH } from "../src/shared/i18n"
import { LANGUAGES } from "../src/shared/languages"
import { md5 } from "../src/shared/md5"
import { getPreset } from "../src/shared/providers"
import { addedByDefault, type BaiduEdition, createDefaultSettings, DEEPL_FREE_URL, DEFAULT_DEEPL, emptyProviderConfig, normalizeSettings, resolveProviderConfig, resultInputs, toPublicSettings } from "../src/shared/settings"
import { asFetch, createService, jsonResponse, translateOne } from "./helpers"

const text = (error: unknown) => describeError(error, ENGLISH)
const fails = async (promise: Promise<unknown>) => text(await promise.then(() => undefined, (error: unknown) => error))
const form = (body: unknown) => new URLSearchParams(String(body))
/** fetch() that answers every request with `answer(url, init)` and records it. */
const stub = (answer: (url: string, init: RequestInit) => unknown) => vi.fn(async (url: string, init: RequestInit) => jsonResponse(answer(url, init)))

describe("MD5", () => {
  it("gives the values of the test suite of RFC 1321", () => {
    expect(
      ["", "a", "abc", "message digest", "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "1234567890".repeat(8)].map(md5),
    ).toEqual([
      "d41d8cd98f00b204e9800998ecf8427e",
      "0cc175b9c0f1b6a831c399e269772661",
      "900150983cd24fb0d6963f7d28e17f72",
      "f96b697d7cb7938d525a2f31aaf161d0",
      "c3fcd3d76192e4007dfb496cca67e13b",
      "d174ab98d277d9f5a5611c2c9f419d9f",
      "57edf4a22be3c955ac49da2e2107b67a",
    ])
  })

  it("hashes the UTF-8 bytes, as Node's crypto does, also at the block boundaries", () => {
    for (const input of ["中文翻译", "emoji 😀👍🏽", "Grüße", "x".repeat(55), "x".repeat(56), "x".repeat(64), "y".repeat(1000)]) {
      expect([input.slice(0, 8), md5(input)]).toEqual([input.slice(0, 8), createHash("md5").update(input, "utf8").digest("hex")])
    }
  })
})

describe("Baidu Translate", () => {
  const provider = { appId: "2015063000000001", apiKey: "12345678", baseURL: "https://fanyi-api.baidu.com/api/trans/vip/translate", edition: "standard" as BaiduEdition }

  it("signs as the example of the documentation: MD5 of appid, q, salt and key", () => {
    const { url, init } = buildBaiduRequest("apple", "en", "zh", provider, "1435660288")
    expect(url).toBe(provider.baseURL)
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded")
    expect(Object.fromEntries(form(init.body))).toEqual({ q: "apple", from: "en", to: "zh", appid: "2015063000000001", salt: "1435660288", sign: "f89f9594663708c1605f3d736d01d2d4" })
  })

  it("has a code for every language of the extension; four need the premium edition", () => {
    expect(LANGUAGES.map((l) => l.code).filter((code) => !BAIDU_LANGS[code])).toEqual([])
    expect([BAIDU_LANGS["zh-TW"], BAIDU_LANGS.ja, BAIDU_LANGS.ko, BAIDU_LANGS.fr, BAIDU_LANGS.es, BAIDU_LANGS.vi, BAIDU_LANGS.ar, BAIDU_LANGS.uk]).toEqual(["cht", "jp", "kor", "fra", "spa", "vie", "ara", "ukr"])
    expect(BAIDU_PREMIUM_ONLY).toEqual(["uk", "tr", "id", "hi"])
  })

  it("sends the paragraphs as the lines of one q, a line break inside a paragraph as ⁂", async () => {
    const fetchFn = stub((_url, init) => ({ trans_result: form(init.body).get("q")!.split("\n").map((line) => ({ src: line, dst: `T:${line}` })) }))
    expect(await baiduTranslateBatch(["One", "Two\nlines"], "zh-CN", "en", provider, { fetchFn: asFetch(fetchFn), salt: "1" })).toEqual(["T:One", "T:Two\nlines"])
    const sent = form(fetchFn.mock.calls[0][1].body)
    expect([sent.get("q"), sent.get("from"), sent.get("to"), sent.get("sign")]).toEqual(["One\nTwo⁂lines", "en", "zh", md5(`${provider.appId}One\nTwo⁂lines1${provider.apiKey}`)])
  })

  it("gives up the batch when the answer has another number of lines or lost a ⁂", async () => {
    const lines = (dst: string[]) => asFetch(stub(() => ({ trans_result: dst.map((d) => ({ dst: d })) })))
    await expect(baiduTranslateBatch(["a", "b"], "zh-CN", "auto", provider, { fetchFn: lines(["A"]) })).rejects.toBeInstanceOf(BatchParseError)
    await expect(baiduTranslateBatch(["a\nb"], "zh-CN", "auto", provider, { fetchFn: lines(["A B"]) })).rejects.toBeInstanceOf(BatchParseError)
    // One paragraph alone keeps its line breaks as lines.
    expect(await baiduTranslateSingle("a\nb", "zh-CN", "auto", provider, { fetchFn: lines(["A", "B"]) })).toBe("A\nB")
  })

  it("names the meaning of its error codes, and tries the passing ones again", () => {
    const failure = (code: string, msg = "") => {
      try {
        parseBaiduResponse({ error_code: code, error_msg: msg })
      } catch (error) {
        return error
      }
    }
    expect(text(failure("54001", "Invalid Sign"))).toBe(`${ENGLISH.t("errKeyRejected", ["Baidu"])} - Invalid Sign\n${ENGLISH.t("hintAuth")}`)
    expect(text(failure("52003"))).toContain(ENGLISH.t("errKeyRejected", ["Baidu"]))
    expect(() => parseBaiduResponse({ error_code: 52003 })).toThrow(ENGLISH.t("errKeyRejected", ["Baidu"]))
    expect(text(failure("54004"))).toBe(ENGLISH.t("errQuotaExceeded", ["Baidu"]))
    expect(text(failure("58001"))).toBe(ENGLISH.t("errUnsupportedPair", ["Baidu"]))
    expect(text(failure("58003"))).toBe(ENGLISH.t("errIpBlocked", ["Baidu"]))
    expect(text(failure("54000", "PARAM_FROM_TO_OR_Q_IS_EMPTY"))).toBe(`${ENGLISH.t("errServiceCode", ["Baidu", "54000"])} - PARAM_FROM_TO_OR_Q_IS_EMPTY`)
    expect([isRetryableError(failure("54003")), isRetryableError(failure("52001")), isRetryableError(failure("54001")), isRetryableError(failure("54000"))]).toEqual([true, true, false, false])
    expect(text(failure("54003"))).toBe(`${ENGLISH.t("errServiceCode", ["Baidu", "54003"])}\n${ENGLISH.t("hintRateLimit")}`)
    // 52000 is success.
    expect(parseBaiduResponse({ error_code: "52000", trans_result: [{ dst: "好" }] })).toEqual(["好"])
    expect(text(failure("52000"))).toBe(ENGLISH.t("errUnexpectedResponse", ["Baidu"]))
    expect(() => parseBaiduResponse({ trans_result: [{ src: "a" }] })).toThrow(ENGLISH.t("errMissingTranslation", ["Baidu", "1"]))
    expect(() => parseBaiduResponse(null)).toThrow(ENGLISH.t("errUnexpectedResponse", ["Baidu"]))
  })

  it("needs app ID and key, and sends nothing for a language the edition lacks", async () => {
    const fetchFn = vi.fn()
    const run = (over: Partial<typeof provider>, target = "zh-CN", source = "en") => fails(baiduTranslateBatch(["a"], target, source, { ...provider, ...over }, { fetchFn: asFetch(fetchFn) }))
    expect(await run({ appId: "" })).toBe(ENGLISH.t("errAppIdRequired", ["Baidu"]))
    expect(await run({ apiKey: "" })).toBe(ENGLISH.t("errApiKeyRequired", ["Baidu"]))
    expect(await run({}, "uk")).toBe(ENGLISH.t("errUnsupportedPair", ["Baidu"]))
    expect(await run({ edition: "advanced" }, "zh-CN", "hi")).toBe(ENGLISH.t("errUnsupportedPair", ["Baidu"]))
    expect(await run({}, "xx")).toBe(ENGLISH.t("errUnsupportedPair", ["Baidu"]))
    expect(fetchFn).not.toHaveBeenCalled()
    const premium = stub(() => ({ trans_result: [{ dst: "Так" }] }))
    expect(await baiduTranslateBatch(["Yes"], "uk", "auto", { ...provider, edition: "premium" }, { fetchFn: asFetch(premium) })).toEqual(["Так"])
    expect(form(premium.mock.calls[0][1].body).get("from")).toBe("auto")
  })

  it("keeps within the request size and the requests per second of the edition", async () => {
    const { settings, service } = createService(createDefaultSettings("en"), {})
    settings.providers.baidu = { ...emptyProviderConfig(), enabled: true, appId: "id", apiKey: "key" }
    const sleep = vi.fn(async (_ms: number) => {})
    const fetchFn = stub((_url, init) => ({ trans_result: form(init.body).get("q")!.split("\n").map((line) => ({ dst: `B(${line.length})` })) }))
    const run = createService(settings, { fetchFn: asFetch(fetchFn), sleep }).service
    const two = () => Promise.all(["a".repeat(600), "b".repeat(600)].map((t) => translateOne(run, { providerId: "baidu", text: t, sourceLang: "en" })))
    expect(await two()).toEqual(["B(600)", "B(600)"])
    // Standard edition: 950 characters per request, so two requests, the second about 1.1 s after the first.
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sleep.mock.calls.some(([ms]) => ms > 1000 && ms <= BAIDU_LIMITS.standard.intervalMs)).toBe(true)
    settings.providers.baidu.edition = "advanced"
    settings.cache.enabled = false
    fetchFn.mockClear()
    expect(await Promise.all(["c".repeat(600), "d".repeat(600)].map((t) => translateOne(run, { providerId: "baidu", text: t, sourceLang: "en" })))).toEqual(["B(600)", "B(600)"])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(service).toBeDefined()
  })

  it("translates one paragraph per request when the batch does not line up", async () => {
    const settings = createDefaultSettings("en")
    settings.providers.baidu = { ...emptyProviderConfig(), enabled: true, appId: "id", apiKey: "key", edition: "premium" }
    // The service drops the ⁂ of a batch, and answers single paragraphs line by line.
    const fetchFn = stub((_url, init) => {
      const q = form(init.body).get("q")!
      return { trans_result: (q.includes("⁂") ? [q.replace("⁂", " ")] : q.split("\n")).map((dst) => ({ dst })) }
    })
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) })
    expect(await Promise.all(["x\ny", "z"].map((t) => translateOne(service, { providerId: "baidu", text: t })))).toEqual(["x\ny", "z"])
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })
})

describe("Youdao", () => {
  const provider = { appId: "app-key", apiKey: "app-secret", baseURL: "https://openapi.youdao.com/v2/api" }
  const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex")

  it("signs the input: the text up to 20 code points, else its first 10, its length and its last 10", () => {
    expect(youdaoInput("Hello world")).toBe("Hello world")
    expect(youdaoInput("abcdefghijklmnopqrst")).toBe("abcdefghijklmnopqrst")
    expect(youdaoInput("abcdefghijklmnopqrstu")).toBe("abcdefghij21lmnopqrstu")
    // An emoji is one code point, two UTF-16 units.
    expect(youdaoInput("😀".repeat(25))).toBe(`${"😀".repeat(10)}25${"😀".repeat(10)}`)
    expect(youdaoInput("😀".repeat(20))).toBe("😀".repeat(20))
  })

  it("sends every paragraph as a q field and signs them joined, with SHA-256 (v3)", async () => {
    const texts = ["Good morning, everyone.", "See you"]
    const { url, init } = await buildYoudaoRequest(texts, "en", "zh-CHS", provider, "salt-1", 1700000000)
    expect(url).toBe(provider.baseURL)
    const body = form(init.body)
    expect(body.getAll("q")).toEqual(texts)
    expect([body.get("from"), body.get("to"), body.get("appKey"), body.get("salt"), body.get("curtime"), body.get("signType")]).toEqual(["en", "zh-CHS", "app-key", "salt-1", "1700000000", "v3"])
    expect(body.get("sign")).toBe(sha256(`app-key${youdaoInput(texts.join(""))}salt-11700000000app-secret`))
    expect(youdaoInput(texts.join(""))).toBe("Good morni30ne.See you")
  })

  it("maps the languages: Chinese by script, the others by their own code, automatic detection as auto", async () => {
    expect([youdaoLang("zh-CN"), youdaoLang("zh-TW"), youdaoLang("ja"), youdaoLang("pt")]).toEqual(["zh-CHS", "zh-CHT", "ja", "pt"])
    const fetchFn = stub(() => ({ errorCode: "0", translateResults: [{ translation: "你好" }] }))
    expect(await youdaoTranslateBatch(["Hi"], "zh-CN", "auto", provider, { fetchFn: asFetch(fetchFn) })).toEqual([{ status: "fulfilled", value: "你好" }])
    const body = form(fetchFn.mock.calls[0][1].body)
    expect([body.get("from"), body.get("to")]).toEqual(["auto", "zh-CHS"])
    expect(body.get("salt")).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number(body.get("curtime"))).toBeCloseTo(Date.now() / 1000, -2)
    await youdaoTranslateBatch(["Hi"], "ja", "zh-TW", provider, { fetchFn: asFetch(fetchFn) })
    expect(form(fetchFn.mock.calls[1][1].body).get("from")).toBe("zh-CHT")
  })

  it("lets a paragraph of errorIndex fail on its own, whether the answer lists it or leaves it out", () => {
    const ok = (value: string) => ({ status: "fulfilled", value })
    const failed = { status: "rejected", reason: new LocalizedError("errMissingTranslation", ["Youdao", "2"]) }
    expect(parseYoudaoResponse({ errorCode: "0", translateResults: [{ translation: "A" }, { translation: "B" }] }, 2)).toEqual([ok("A"), ok("B")])
    expect(parseYoudaoResponse({ errorCode: "0", errorIndex: [1], translateResults: [{ translation: "A" }, { query: "b" }, { translation: "C" }] }, 3)).toEqual([ok("A"), failed, ok("C")])
    expect(parseYoudaoResponse({ errorCode: "0", errorIndex: [1], translateResults: [{ translation: "A" }, { translation: "C" }] }, 3)).toEqual([ok("A"), failed, ok("C")])
    expect(() => parseYoudaoResponse({ errorCode: "0", translateResults: [{ translation: "A" }] }, 3)).toThrow(ENGLISH.t("errResultCount", ["Youdao", "3", "1"]))
    expect(() => parseYoudaoResponse({ errorCode: "0" }, 1)).toThrow(ENGLISH.t("errResultCount", ["Youdao", "1", "0"]))
    expect(() => parseYoudaoResponse({}, 1)).toThrow(ENGLISH.t("errUnexpectedResponse", ["Youdao"]))
  })

  it("names the meaning of its error codes", () => {
    const failure = (code: string) => {
      try {
        parseYoudaoResponse({ errorCode: code }, 1)
      } catch (error) {
        return error
      }
    }
    for (const code of ["108", "110", "202"]) expect(text(failure(code))).toContain(ENGLISH.t("errKeyRejected", ["Youdao"]))
    expect(text(failure("401"))).toBe(ENGLISH.t("errQuotaExceeded", ["Youdao"]))
    expect(text(failure("206"))).toBe(ENGLISH.t("errClockSkew", ["Youdao"]))
    expect(text(failure("102"))).toBe(ENGLISH.t("errUnsupportedPair", ["Youdao"]))
    expect([isRetryableError(failure("411")), isRetryableError(failure("412")), isRetryableError(failure("207")), isRetryableError(failure("113"))]).toEqual([true, true, true, false])
    expect(text(failure("113"))).toBe(ENGLISH.t("errServiceCode", ["Youdao", "113"]))
  })

  it("needs app ID and secret", async () => {
    expect(await fails(youdaoTranslateBatch(["a"], "zh-CN", "en", { ...provider, appId: "" }))).toBe(ENGLISH.t("errAppIdRequired", ["Youdao"]))
    expect(await fails(youdaoTranslateBatch(["a"], "zh-CN", "en", { ...provider, apiKey: "" }))).toBe(ENGLISH.t("errApiKeyRequired", ["Youdao"]))
  })

  it("gives each paragraph of a batch its own result in the translation service", async () => {
    const settings = createDefaultSettings("en")
    settings.providers.youdao = { ...emptyProviderConfig(), enabled: true, appId: "app", apiKey: "secret" }
    const fetchFn = stub((_url, init) => {
      const qs = form(init.body).getAll("q")
      return { errorCode: "0", errorIndex: qs.flatMap((q, i) => (q === "bad" ? [i] : [])), translateResults: qs.map((q) => (q === "bad" ? {} : { translation: `Y(${q})` })) }
    })
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) })
    const results = await Promise.allSettled(["good", "bad"].map((t) => translateOne(service, { providerId: "youdao", text: t })))
    expect(results[0]).toEqual({ status: "fulfilled", value: "Y(good)" })
    expect(results[1].status).toBe("rejected")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe("DeepL API", () => {
  const provider = { apiKey: "key:fx", baseURL: DEEPL_FREE_URL, deepl: DEFAULT_DEEPL }

  it("picks the host by the key: api-free for a key of the free plan, api for any other, the user's endpoint over both", () => {
    const cfg = (apiKey: string, baseURL = "") => resolveProviderConfig("deepl", { ...emptyProviderConfig(), apiKey, baseURL }).baseURL
    expect([cfg("abc:fx"), cfg("abc"), cfg(""), cfg("abc:fx", "https://proxy.example/deepl/")]).toEqual(["https://api-free.deepl.com", "https://api.deepl.com", "https://api.deepl.com", "https://proxy.example/deepl"])
  })

  it("writes Chinese by script and English and Portuguese in the variant of the settings; source languages without variants", () => {
    expect([deeplTarget("zh-CN", DEFAULT_DEEPL), deeplTarget("zh-TW", DEFAULT_DEEPL), deeplTarget("ja", DEFAULT_DEEPL), deeplTarget("en", DEFAULT_DEEPL), deeplTarget("pt", DEFAULT_DEEPL)]).toEqual(["ZH-HANS", "ZH-HANT", "JA", "EN-US", "PT-BR"])
    const other = { formality: "default" as const, english: "EN-GB" as const, portuguese: "PT-PT" as const }
    expect([deeplTarget("en", other), deeplTarget("pt", other)]).toEqual(["EN-GB", "PT-PT"])
    expect([deeplSource("auto"), deeplSource("zh-TW"), deeplSource("zh-CN"), deeplSource("en")]).toEqual([undefined, "ZH", "ZH", "EN"])
  })

  it("sends the key in the header, the paragraphs as an array, and formality as a preference the language may ignore", () => {
    const { url, init } = buildDeeplRequest(["Hello", "World"], "DE", { ...provider, deepl: { ...DEFAULT_DEEPL, formality: "more" } }, "EN")
    expect(url).toBe("https://api-free.deepl.com/v2/translate")
    expect(init.headers).toEqual({ Authorization: "DeepL-Auth-Key key:fx", "Content-Type": "application/json" })
    expect(JSON.parse(init.body!)).toEqual({ text: ["Hello", "World"], target_lang: "DE", source_lang: "EN", formality: "prefer_more" })
    expect(JSON.parse(buildDeeplRequest(["Hi"], "JA", provider).init.body!)).toEqual({ text: ["Hi"], target_lang: "JA" })
    expect(() => buildDeeplRequest(["Hi"], "JA", { ...provider, apiKey: "" })).toThrow(ENGLISH.t("errApiKeyRequired", ["DeepL"]))
  })

  it("reads the translations in order and checks their number", async () => {
    const fetchFn = stub(() => ({ translations: [{ detected_source_language: "EN", text: "Hallo" }, { text: "Welt" }] }))
    expect(await deeplTranslateBatch(["Hello", "World"], "de", "auto", provider, { fetchFn: asFetch(fetchFn) })).toEqual(["Hallo", "Welt"])
    expect(JSON.parse(fetchFn.mock.calls[0][1].body as string).target_lang).toBe("DE")
    expect(() => parseDeeplResponse({ translations: [] }, 1)).toThrow(ENGLISH.t("errResultCount", ["DeepL", "1", "0"]))
    expect(() => parseDeeplResponse({ translations: [{}] }, 1)).toThrow(ENGLISH.t("errMissingTranslation", ["DeepL", "1"]))
    expect(() => parseDeeplResponse({ message: "x" }, 1)).toThrow(ENGLISH.t("errUnexpectedResponse", ["DeepL"]))
  })

  it("tells a refused key and a used-up quota apart from other HTTP errors", async () => {
    const status = (code: number, message: string) => asFetch(vi.fn(async () => jsonResponse({ message }, code)))
    expect(await fails(deeplTranslateBatch(["a"], "de", "auto", provider, { fetchFn: status(403, "Wrong auth") }))).toBe(`${ENGLISH.t("errKeyRejected", ["DeepL"])} - Wrong auth\n${ENGLISH.t("hintAuth")}`)
    expect(await fails(deeplTranslateBatch(["a"], "de", "auto", provider, { fetchFn: status(456, "Quota exceeded") }))).toBe(`${ENGLISH.t("errQuotaExceeded", ["DeepL"])} - Quota exceeded`)
    expect(await fails(deeplTranslateBatch(["a"], "de", "auto", provider, { fetchFn: asFetch(vi.fn(async () => new Response("", { status: 403 }))) }))).toBe(`${ENGLISH.t("errKeyRejected", ["DeepL"])}\n${ENGLISH.t("hintAuth")}`)
    const busy = await deeplTranslateBatch(["a"], "de", "auto", provider, { fetchFn: status(429, "Too many requests") }).catch((error: unknown) => error)
    expect(busy).toBeInstanceOf(HttpError)
    expect(isRetryableError(busy)).toBe(true)
    expect(httpCodeError(new Error("x"), "DeepL", { 403: "key" })).toBeInstanceOf(Error)
  })

  it("tests the connection with the usage, which costs no characters", async () => {
    const fetchFn = stub(() => ({ character_count: 1000, character_limit: 500000 }))
    expect(await deeplUsage(provider, { fetchFn: asFetch(fetchFn) })).toEqual({ used: 1000, limit: 500000 })
    expect(fetchFn.mock.calls[0][0]).toBe("https://api-free.deepl.com/v2/usage")
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: "GET", headers: { Authorization: "DeepL-Auth-Key key:fx" } })
    await expect(deeplUsage(provider, { fetchFn: asFetch(stub(() => ({}))) })).rejects.toThrow(ENGLISH.t("errUnexpectedResponse", ["DeepL"]))
    const { service } = createService(createDefaultSettings("en"), { fetchFn: asFetch(fetchFn), i18n: () => ENGLISH })
    expect(await service.testProvider("deepl", { ...emptyProviderConfig(), apiKey: "k:fx" }, "de")).toBe(ENGLISH.t("testDeeplUsage", [1000, 500000]))
    expect(ENGLISH.t("testDeeplUsage", [1000, 500000])).toBe("1,000 of 500,000 characters used in this billing period")
  })

  it("makes formality and the variants part of the result inputs, and leaves the inputs of the other services as they were", () => {
    const s = createDefaultSettings("en")
    s.tiers.machine = "deepl"
    s.providers.deepl = { ...emptyProviderConfig(), enabled: true, apiKey: "k" }
    expect(resultInputs(s, "deepl").parts).toEqual(["https://api.deepl.com", "free", "default", "EN-US", "PT-BR"])
    const before = toPublicSettings(s).signatures.machine
    s.providers.deepl.deepl = { ...DEFAULT_DEEPL, english: "EN-GB" }
    expect(toPublicSettings(s).signatures.machine).not.toBe(before)
    expect(resultInputs(s, "google-free").parts).toEqual(["https://translate.googleapis.com", "free"])
  })

  it("translates a batch in one request in the translation service", async () => {
    const settings = createDefaultSettings("en")
    settings.providers.deepl = { ...emptyProviderConfig(), enabled: true, apiKey: "k" }
    const fetchFn = stub((_url, init) => ({ translations: (JSON.parse(init.body as string).text as string[]).map((t) => ({ text: `D:${t}` })) }))
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) })
    expect(await Promise.all(["a", "b"].map((t) => translateOne(service, { providerId: "deepl", text: t, sourceLang: "zh-TW" })))).toEqual(["D:a", "D:b"])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchFn.mock.calls[0][1].body as string)).toMatchObject({ source_lang: "ZH", target_lang: "ZH-HANS" })
  })
})

describe("Caiyun", () => {
  const provider = { apiKey: "token-1", baseURL: "https://api.interpreter.caiyunai.com/v1/translator" }

  it("knows its directions: Chinese with English, Japanese and Korean both ways, eight more languages into Chinese only", () => {
    const directions = [
      ["auto", "zh-CN"],
      ["auto", "ja"],
      ["auto", "de"],
      ["en", "zh-TW"],
      ["zh-CN", "ja"],
      ["zh-TW", "en"],
      ["zh-CN", "zh-TW"],
      ["de", "zh-CN"],
      ["vi", "zh-TW"],
      ["ja", "ko"],
      ["de", "en"],
      ["uk", "zh-CN"],
      ["zh-CN", "zh-CN"],
      ["zh-CN", "fr"],
    ].map(([source, target]) => caiyunDirection(source, target))
    expect(directions).toEqual(["auto2zh", "auto2ja", null, "en2zh-Hant", "zh2ja", "zh-Hant2en", "zh2zh-Hant", "de2zh", "vi2zh-Hant", null, null, null, null, null])
  })

  it("sends the token in its header and the paragraphs as an array; detection only for automatic source language", () => {
    const { url, init } = buildCaiyunRequest(["Hi", "there"], "auto2zh", provider, "r1")
    expect(url).toBe(provider.baseURL)
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-Authorization": "token token-1" })
    expect(JSON.parse(init.body!)).toEqual({ source: ["Hi", "there"], trans_type: "auto2zh", request_id: "r1", detect: true })
    expect(JSON.parse(buildCaiyunRequest(["Hi"], "en2zh", provider, "r2").init.body!).detect).toBe(false)
    expect(() => buildCaiyunRequest(["Hi"], "en2zh", { ...provider, apiKey: "" }, "r")).toThrow(ENGLISH.t("errApiKeyRequired", ["Caiyun"]))
  })

  it("sends nothing for a pair it does not translate, and checks the answer", async () => {
    const fetchFn = stub(() => ({ target: ["你好", "那里"] }))
    expect(await fails(caiyunTranslateBatch(["Hallo"], "en", "de", provider, { fetchFn: asFetch(fetchFn) }))).toBe(ENGLISH.t("errUnsupportedPair", ["Caiyun"]))
    expect(fetchFn).not.toHaveBeenCalled()
    expect(await caiyunTranslateBatch(["Hi", "there"], "zh-CN", "en", provider, { fetchFn: asFetch(fetchFn) })).toEqual(["你好", "那里"])
    expect(JSON.parse(fetchFn.mock.calls[0][1].body as string).request_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(() => parseCaiyunResponse({ rc: 1 }, 1)).toThrow(ENGLISH.t("errUnexpectedResponse", ["Caiyun"]))
    expect(() => parseCaiyunResponse({ target: ["a"] }, 2)).toThrow(ENGLISH.t("errResultCount", ["Caiyun", "2", "1"]))
    expect(() => parseCaiyunResponse({ target: [1] }, 1)).toThrow(ENGLISH.t("errMissingTranslation", ["Caiyun", "1"]))
  })

  it("translates a batch in one request in the translation service", async () => {
    const settings = createDefaultSettings("en")
    settings.providers.caiyun = { ...emptyProviderConfig(), enabled: true, apiKey: "t" }
    const fetchFn = stub((_url, init) => ({ target: (JSON.parse(init.body as string).source as string[]).map((t) => `C:${t}`) }))
    const { service } = createService(settings, { fetchFn: asFetch(fetchFn) })
    expect(await Promise.all(["a", "b"].map((t) => translateOne(service, { providerId: "caiyun", text: t })))).toEqual(["C:a", "C:b"])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe("settings of the four services", () => {
  it("count as added once they have a key", () => {
    for (const id of ["deepl", "baidu", "youdao", "caiyun"]) {
      const preset = getPreset(id)!
      expect([id, addedByDefault(preset, emptyProviderConfig()), addedByDefault(preset, { ...emptyProviderConfig(), apiKey: "k" })]).toEqual([id, false, true])
    }
  })

  it("keep app ID, edition and the DeepL options, and drop what is not one of their values", () => {
    const s = normalizeSettings({
      providers: {
        baidu: { apiKey: "k", appId: "123", edition: "advanced" },
        youdao: { apiKey: "k", appId: "", edition: "gold" },
        deepl: { apiKey: "k", deepl: { formality: "less", english: "EN-AU", portuguese: "PT-PT" } },
      },
    })
    expect(s.providers.baidu).toMatchObject({ enabled: true, appId: "123", edition: "advanced" })
    expect(s.providers.youdao.appId).toBeUndefined()
    expect(s.providers.youdao.edition).toBeUndefined()
    expect(s.providers.deepl.deepl).toEqual({ formality: "less", english: "EN-US", portuguese: "PT-PT" })
    expect(resolveProviderConfig("baidu", { ...emptyProviderConfig(), appId: " 9 " })).toMatchObject({ appId: "9", edition: "standard", deepl: DEFAULT_DEEPL })
  })

  it("make every message of their codes readable", () => {
    expect(text(codeError("X", "1", "clock"))).toBe(ENGLISH.t("errClockSkew", ["X"]))
    expect(text(codeError("X", "2", "retry", "busy"))).toBe(`${ENGLISH.t("errServiceCode", ["X", "2"])} - busy\n${ENGLISH.t("hintServerError")}`)
  })
})
