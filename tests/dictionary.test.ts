/** Dictionary packs: format, word-by-word translation, storage, download and the dictionary tier. */
import { IDBFactory } from "fake-indexeddb"
import { describe, expect, it, vi } from "vitest"
import { type IndexedPack, fetchDictionaryIndex, installPack, releaseUrl } from "../src/background/dictionary/download"
import { TimeoutError } from "../src/shared/errors"
import { dictKey, dictLang, parsePack } from "../src/background/dictionary/format"
import { Dictionary, translateText } from "../src/background/dictionary"
import { DictionaryStore } from "../src/background/dictionary/store"
import { appLang, pairKey } from "../src/shared/languages"
import { describeError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { gz, packEntry, releaseServer, tsv } from "./fixtures/dictionary"
import { asFetch, jsonResponse } from "./helpers"

const EN_ZH = tsv(
  "en",
  "zh-Hans",
  { hello: "你好", world: "世界", i: "我", go: "去", to: "到", "new york": "纽约", "ice cream": "冰淇淋", "look up": "查阅", look: "看", up: "向上", report: "报告" },
  { went: "go", reports: "report" },
)
const FR_EN = tsv("fr", "en", { bonjour: "hello", monde: "world" })
const EN_DE = tsv("en", "de", { hello: "hallo", world: "Welt" })
const ZH_EN = tsv("zh-Hans", "en", { 你好: "hello", 世界: "world" })
const ZH_HANT_EN = tsv("zh-Hant", "en", { 我們: "we", 明天: "tomorrow", 開會: "hold a meeting" })
const EN_ZH_MEETING = tsv("en", "zh-Hans", { we: "我们", tomorrow: "明天", "hold a meeting": "持有一个会议" })

const pack = (text: string) => parsePack(text)

describe("pack format", () => {
  it("reads the header, entries and forms", () => {
    const p = pack(EN_ZH)
    expect([p.src, p.tgt, p.version, p.source, p.license]).toEqual(["en", "zh-Hans", "20261011", "Test source", "MIT"])
    expect(p.entries.get("new york")).toBe("纽约")
    expect(p.forms.get("went")).toBe("go")
  })

  it.each([
    ["no header", "w\thello\tx\n"],
    ["an empty file", ""],
    ["a short header", "#dict\ten\tde\t1\tsource\n"],
    ["another marker", "#dictionary\ten\tde\t1\tsource\tMIT\n"],
  ])("rejects a file with %s", (_, text) => {
    expect(() => parsePack(text)).toThrow(/damaged/)
  })

  it("skips malformed lines and keeps tabs inside a translation", () => {
    const p = pack(["#dict\ten\tde\t1\ts\tMIT", "w\tok\tgut", "w\tnotab", "wx\tbad\tline", "x\tk\tv", "", "f\tforms\tform", "w\ttab\ta\tb", "w\t\tempty key"].join("\n"))
    expect(Object.fromEntries(p.entries)).toEqual({ ok: "gut", tab: "a\tb", "": "empty key" })
    expect(Object.fromEntries(p.forms)).toEqual({ forms: "form" })
  })

  it("normalizes keys: NFC, lower case of the source language, trimmed", () => {
    expect(dictKey("  Café ", "fr")).toBe("café")
    expect(dictKey("İstanbul", "tr")).toBe("istanbul")
  })

  it("maps language codes to pack languages and back", () => {
    expect(["zh-CN", "zh-TW", "zh", "zh-HK", "pt-BR", "en", "it", "auto", "ja"].map(dictLang)).toEqual(["zh-Hans", "zh-Hant", "zh-Hans", "zh-Hant", "pt", "en", null, null, "ja"])
    expect(["zh-Hans", "zh-Hant", "ko"].map(appLang)).toEqual(["zh-CN", "zh-TW", "ko"])
  })
})

describe("word by word translation", () => {
  it("prefers the longest phrase of up to three words, and keeps unknown words", () => {
    expect(translateText("I went to New York.", pack(EN_ZH))).toBe("我去到纽约.")
    expect(translateText("Look up the report", pack(EN_ZH))).toBe("查阅the报告")
    expect(translateText("a b c d", pack(tsv("en", "de", { "a b c": "drei", "a b c d": "vier", "c d": "zwei" })))).toBe("drei d")
  })

  it("finds inflected forms through their lemma, and keeps forms whose lemma has no entry", () => {
    expect(translateText("reports", pack(EN_ZH))).toBe("报告")
    expect(translateText("geese", pack(tsv("en", "de", {}, { geese: "goose" })))).toBe("geese")
  })

  it("keeps punctuation, numbers and line breaks; spaces go only next to Chinese text", () => {
    expect(translateText("Hello, world! 42\nIce cream", pack(EN_ZH))).toBe("你好,世界! 42\n冰淇淋")
  })

  it("does not build phrases across numbers or punctuation", () => {
    expect(translateText("look, up", pack(EN_ZH))).toBe("看,向上")
    expect(translateText("go 2 york", pack(tsv("en", "de", { "go 2 york": "x", go: "geh", york: "York" })))).toBe("geh 2 York")
  })

  it("puts spaces between words for a target language written with spaces", () => {
    expect(translateText("hello world", pack(EN_DE))).toBe("hallo Welt")
    expect(translateText("你好世界。", pack(ZH_EN))).toBe("hello world。")
  })

  it("joins phrases of a language without spaces, and drops spaces for one", () => {
    expect(translateText("你好世界", pack(tsv("zh-Hans", "en", { 你好: "hello", 世界: "world", 你好世界: "hello, world" })))).toBe("hello, world")
    expect(translateText("good morning, Tokyo", pack(tsv("en", "ja", { good: "良い", morning: "朝", tokyo: "東京" })))).toBe("良い朝,東京")
  })
})

const FILES: Record<string, string> = { "dict-en-zh-Hans.tsv.gz": EN_ZH, "dict-fr-en.tsv.gz": FR_EN, "dict-en-de.tsv.gz": EN_DE }
const indexEntry = (file: string, over: Partial<IndexedPack> = {}) => packEntry(FILES[file], over)
/** GitHub Releases stand-in serving the fixture packs and their index. */
const releases = releaseServer(Object.values(FILES))

const newStore = () => new DictionaryStore(() => new IDBFactory())
async function installed(...files: string[]) {
  const store = newStore()
  for (const file of files) await installPack(indexEntry(file), "dicts-v1", store, { fetchFn: asFetch(releases) })
  return store
}

describe("storage, download and the dictionary tier", () => {
  it("reads the index of a release", async () => {
    const packs = await fetchDictionaryIndex("dicts-v1", asFetch(releases))
    expect(packs.map((p) => `${p.src}>${p.tgt}`)).toEqual(["en>zh-Hans", "fr>en", "en>de"])
    expect(releases).toHaveBeenCalledWith(releaseUrl("dicts-v1", "dict-index.json"), expect.anything())
    expect(releaseUrl("dicts-v1", "x.gz")).toBe("https://github.com/willlllliams/thunderbird-translate/releases/download/dicts-v1/x.gz")
  })

  it("explains why the index could not be loaded", async () => {
    const missing = await fetchDictionaryIndex("nope", asFetch(async () => new Response("Not Found", { status: 404 }))).catch((e) => e)
    expect(describeError(missing, ENGLISH)).toMatch(/HTTP 404/)
    const garbage = await fetchDictionaryIndex("x", asFetch(async () => jsonResponse({ version: 9 }))).catch((e) => e)
    expect(describeError(garbage, ENGLISH)).toBe(ENGLISH.t("errUnexpectedResponse", ["dict-index.json"]))
  })

  it.each([
    ["text that is not JSON", "<html>"],
    ["packs that are not a list", { version: 1, packs: {} }],
    ["no packs", { version: 1 }],
  ])("rejects an index with %s", async (_, body) => {
    await expect(fetchDictionaryIndex("x", asFetch(async () => jsonResponse(body)))).rejects.toThrow(ENGLISH.t("errUnexpectedResponse", ["dict-index.json"]))
  })

  it("L1: gives up on an index that does not arrive in time", async () => {
    const hanging = (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))
    const error = await fetchDictionaryIndex("dicts-v1", asFetch(hanging), 50).catch((e) => e)
    expect(error).toBeInstanceOf(TimeoutError)
  })

  it("L1: stops a pack download that receives nothing for a while, and lets a slow one finish", async () => {
    const entry = indexEntry("dict-en-de.tsv.gz")
    const data = gz(EN_DE)
    /** A response that sends the file in `chunks` pieces, one every `everyMs`, and stops after `stopAfter` pieces. */
    const trickle = (everyMs: number, chunks: number, stopAfter = chunks) =>
      asFetch(async () => {
        const size = Math.ceil(data.byteLength / chunks)
        let sent = 0
        return new Response(
          new ReadableStream<Uint8Array>({
            async pull(c) {
              if (sent === stopAfter) return new Promise<void>(() => {})
              await new Promise((r) => setTimeout(r, everyMs))
              c.enqueue(data.slice(sent * size, (sent + 1) * size))
              if (++sent === chunks) c.close()
            },
          }),
        )
      })
    const stalled = await installPack(entry, "dicts-v1", newStore(), { fetchFn: trickle(5, 4, 2), idleMs: 60 }).catch((e) => e)
    expect(stalled.i18nText).toMatchObject({ key: "errDownloadStalled", args: ["GitHub", "0"] })
    // Six pieces, 40 ms apart: longer than the idle time in total, never between two pieces.
    const store = newStore()
    await installPack(entry, "dicts-v1", store, { fetchFn: trickle(40, 6), idleMs: 60 })
    expect((await store.list()).map((p) => p.id)).toEqual(["en>de"])
  })

  it("leaves out index entries with missing or mistyped fields", async () => {
    const good = indexEntry("dict-fr-en.tsv.gz")
    const { attribution: _, ...noAttribution } = good
    const packs = [null, "dict-x.tsv.gz", 3, { ...good, bytes: "100" }, { ...good, src: 1 }, noAttribution, good]
    expect(await fetchDictionaryIndex("x", asFetch(async () => jsonResponse({ version: 1, packs })))).toEqual([good])
  })

  it("downloads with progress, checks the checksum and stores the pack", async () => {
    const store = newStore()
    const progress: number[] = []
    await installPack(indexEntry("dict-en-zh-Hans.tsv.gz"), "dicts-v1", store, { fetchFn: asFetch(releases), onProgress: (loaded) => progress.push(loaded) })
    expect(progress.at(-1)).toBe(indexEntry("dict-en-zh-Hans.tsv.gz").bytes)
    expect(await store.list()).toEqual([expect.objectContaining({ id: "en>zh-Hans", entries: 11, forms: 2, license: "MIT", attribution: "Test contributors; MIT" })])

    const bad = indexEntry("dict-en-de.tsv.gz", { sha256: "0".repeat(64) })
    await expect(installPack(bad, "dicts-v1", store, { fetchFn: asFetch(releases) })).rejects.toThrow(/checksum/)
    expect((await store.list()).map((p) => p.id)).toEqual(["en>zh-Hans"])
  })

  it("reports progress per chunk against the index size when the length is unknown, and accepts an upper-case checksum", async () => {
    const data = gz(EN_DE)
    const half = data.byteLength >> 1
    const body = new ReadableStream({
      start(c) {
        c.enqueue(data.slice(0, half))
        c.enqueue(data.slice(half))
        c.close()
      },
    })
    const entry = indexEntry("dict-en-de.tsv.gz", { bytes: 999 })
    const progress: [number, number][] = []
    const store = newStore()
    await installPack({ ...entry, sha256: entry.sha256.toUpperCase() }, "t", store, { fetchFn: asFetch(async () => new Response(body)), onProgress: (l, t) => progress.push([l, t]) })
    expect(progress).toEqual([
      [half, 999],
      [data.byteLength, 999],
    ])
    expect(await store.list()).toEqual([expect.objectContaining({ id: "en>de", bytes: data.byteLength, version: "20261011" })])
  })

  it("rejects a missing file, and a file of another language pair", async () => {
    const store = newStore()
    const missing = await installPack(indexEntry("dict-en-de.tsv.gz", { file: "gone.tsv.gz" }), "t", store, { fetchFn: asFetch(releases) }).catch((e) => e)
    expect(describeError(missing, ENGLISH)).toMatch(/HTTP 404/)
    // The checksum matches, but the file holds en → de.
    const swapped = indexEntry("dict-en-de.tsv.gz", { src: "fr", tgt: "en" })
    await expect(installPack(swapped, "t", store, { fetchFn: asFetch(releases) })).rejects.toThrow(ENGLISH.t("errDictionaryFormat"))
    expect(await store.list()).toEqual([])
  })

  it("stores and deletes packs, and opens the database again after a failure", async () => {
    const idb = new IDBFactory()
    const factory = vi.fn(() => idb).mockImplementationOnce(() => {
      throw new Error("IndexedDB is disabled")
    })
    const store = new DictionaryStore(factory)
    await expect(store.list()).rejects.toThrow("IndexedDB is disabled")
    expect(await store.list()).toEqual([])
    expect(await store.data("en>de")).toBeUndefined()
    const meta = { id: "en>de", src: "en", tgt: "de", version: "1", source: "s", license: "MIT", attribution: "a", bytes: 3, entries: 1, forms: 0 }
    await store.put(meta, new Uint8Array([1, 2, 3]).buffer)
    expect(await store.list()).toEqual([meta])
    expect(new Uint8Array((await store.data("en>de"))!)).toEqual(new Uint8Array([1, 2, 3]))
    await store.remove("en>de")
    await store.remove("never>installed")
    expect(await store.list()).toEqual([])
    expect(await store.data("en>de")).toBeUndefined()
  })

  it("reports a refused database and tries again next time", async () => {
    const idb = new IDBFactory()
    const refused = {
      open: () => {
        const req = { error: new DOMException("refused", "UnknownError") } as unknown as IDBOpenDBRequest
        queueMicrotask(() => req.onerror?.(new Event("error") as never))
        return req
      },
    } as unknown as IDBFactory
    const store = new DictionaryStore(vi.fn(() => idb).mockReturnValueOnce(refused))
    await expect(store.data("en>de")).rejects.toThrow("refused")
    expect(await store.data("en>de")).toBeUndefined()
  })

  /** The translations of Dictionary.translate(), or the first paragraph's error. */
  const texts = async (dictionary: Dictionary, input: string[], source: string, target: string) =>
    (await dictionary.translate(input, source, target)).map((r) => {
      if (r.status === "rejected") throw r.reason
      return r.value
    })

  it("fails only the paragraph that cannot be translated", async () => {
    // French has no pack here.
    const detect = async (text: string) => (text.startsWith("Bonjour") ? "fr" : "en")
    const dictionary = new Dictionary(await installed("dict-en-zh-Hans.tsv.gz"), { detect })
    const results = await dictionary.translate(["Hello world", "Bonjour monde", "这是中文"], "auto", "zh-CN")
    expect(results[0]).toEqual({ status: "fulfilled", value: "你好世界" })
    expect(results[1]).toMatchObject({ status: "rejected", reason: { i18nText: { key: "errDictionaryMissing" } } })
    expect(results[2]).toEqual({ status: "fulfilled", value: "这是中文" })
  })

  it("translates with an installed pack and detects the source language", async () => {
    const dictionary = new Dictionary(await installed("dict-en-zh-Hans.tsv.gz"))
    expect(await texts(dictionary, ["Hello world", "I went to New York"], "auto", "zh-CN")).toEqual(["你好世界", "我去到纽约"])
    expect(await texts(dictionary, ["Hello"], "en", "zh-CN")).toEqual(["你好"])
  })

  it("asks the detector for the source language, and takes English when nothing is recognised", async () => {
    const detect = vi.fn(async () => "fr")
    const dictionary = new Dictionary(await installed("dict-fr-en.tsv.gz", "dict-en-zh-Hans.tsv.gz"), { detect })
    expect(await texts(dictionary, ["Bonjour monde"], "auto", "zh-CN")).toEqual(["你好世界"])
    expect(detect).toHaveBeenCalledWith("Bonjour monde")
    const plain = new Dictionary(await installed("dict-en-zh-Hans.tsv.gz"))
    expect(await texts(plain, ["hello qqq zzz"], "auto", "zh-CN")).toEqual(["你好qqq zzz"])
    expect(await texts(plain, ["2026"], "auto", "zh-CN")).toEqual(["2026"])
  })

  it("names an unsupported language", async () => {
    const dictionary = new Dictionary(newStore())
    const error = await texts(dictionary, ["Hallo"], "de", "it").catch((e) => e)
    expect(describeError(error, ENGLISH)).toBe(ENGLISH.t("errDictionaryUnsupported", ["it"]))
    await expect(texts(dictionary, ["Ciao"], "it", "en")).rejects.toThrow(/language it/)
  })

  it("returns text in the target language unchanged", async () => {
    const dictionary = new Dictionary(newStore())
    expect(await texts(dictionary, ["这是中文"], "auto", "zh-CN")).toEqual(["这是中文"])
  })

  it("goes through English when there is no direct pack", async () => {
    const dictionary = new Dictionary(await installed("dict-fr-en.tsv.gz", "dict-en-zh-Hans.tsv.gz"))
    expect(await texts(dictionary, ["Bonjour monde"], "fr", "zh-CN")).toEqual(["你好世界"])
  })

  it("names the missing pair and where to download it", async () => {
    const dictionary = new Dictionary(await installed("dict-fr-en.tsv.gz"))
    const error = await texts(dictionary, ["Bonjour"], "fr", "de").catch((e) => e)
    const text = describeError(error, ENGLISH)
    expect(text.split("\n")).toEqual([ENGLISH.t("errDictionaryMissing", ["fr → de"]), ENGLISH.t("hintDictionaryDownload")])
  })

  it("goes through English only between two other languages, and only with both packs", async () => {
    const store = await installed("dict-fr-en.tsv.gz")
    const data = vi.spyOn(store, "data")
    const dictionary = new Dictionary(store)
    await expect(texts(dictionary, ["Bonjour"], "fr", "zh-CN")).rejects.toThrow(ENGLISH.t("errDictionaryMissing", ["fr → zh-Hans"]))
    expect(data.mock.calls.map(([id]) => id)).toEqual(["fr>zh-Hans", "fr>en", "en>zh-Hans"])
    data.mockClear()
    await expect(texts(dictionary, ["Hello"], "en", "ja")).rejects.toThrow(ENGLISH.t("errDictionaryMissing", ["en → ja"]))
    expect(data.mock.calls.map(([id]) => id)).toEqual(["en>ja"])
  })

  it("M2: does not translate between Simplified and Traditional Chinese through English", async () => {
    const store = await installed("dict-fr-en.tsv.gz")
    const meta = (await store.list())[0]
    for (const [src, tgt, text] of [["zh-Hant", "en", ZH_HANT_EN], ["en", "zh-Hans", EN_ZH_MEETING]]) await store.put({ ...meta, id: pairKey(src, tgt), src, tgt }, gz(text).buffer)
    const data = vi.spyOn(store, "data")
    const detect = vi.fn(async () => "zh-TW")
    const dictionary = new Dictionary(store, { detect })
    for (const source of ["zh-TW", "auto"]) {
      const [result] = await dictionary.translate(["我們明天開會，請準時參加這個會議"], source, "zh-CN")
      expect(result).toMatchObject({ status: "rejected", reason: { i18nText: { key: "errChineseVariants" } } })
      expect(describeError((result as PromiseRejectedResult).reason, ENGLISH)).toBe(ENGLISH.t("errChineseVariants"))
    }
    expect((await dictionary.translate(["我們"], "zh-CN", "zh-TW"))[0]).toMatchObject({ status: "rejected" })
    expect(data).not.toHaveBeenCalled()
  })

  it("reads a pack again after a read failure", async () => {
    const store = await installed("dict-en-de.tsv.gz")
    vi.spyOn(store, "data").mockRejectedValueOnce(new Error("read failed"))
    const dictionary = new Dictionary(store)
    await expect(texts(dictionary, ["hello"], "en", "de")).rejects.toThrow("read failed")
    expect(await texts(dictionary, ["hello"], "en", "de")).toEqual(["hallo"])
  })

  it("reads the packs again after a change, and releases them when idle", async () => {
    const store = await installed("dict-en-zh-Hans.tsv.gz")
    const data = vi.spyOn(store, "data")
    const dictionary = new Dictionary(store, { idleMs: 30 })
    await texts(dictionary, ["hello"], "en", "zh-CN")
    await texts(dictionary, ["world"], "en", "zh-CN")
    expect(data).toHaveBeenCalledTimes(1)
    await store.remove(pairKey("en", "zh-Hans"))
    dictionary.invalidate()
    await expect(texts(dictionary, ["hello"], "en", "zh-CN")).rejects.toThrow(/not installed/)
    await installPack(indexEntry("dict-en-zh-Hans.tsv.gz"), "dicts-v1", store, { fetchFn: asFetch(releases) })
    dictionary.invalidate()
    await texts(dictionary, ["hello"], "en", "zh-CN")
    const reads = data.mock.calls.length
    await new Promise((r) => setTimeout(r, 80))
    await texts(dictionary, ["hello"], "en", "zh-CN")
    expect(data.mock.calls.length).toBe(reads + 1)
  })
})
