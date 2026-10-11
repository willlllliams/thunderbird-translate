/** Dictionary packs: format, word-by-word translation, storage, download and the dictionary tier. */
import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { IDBFactory } from "fake-indexeddb"
import { describe, expect, it, vi } from "vitest"
import { type IndexedPack, fetchDictionaryIndex, installPack, releaseUrl } from "../src/background/dictionary/download"
import { dictKey, dictLang, parsePack } from "../src/background/dictionary/format"
import { Dictionary, translateText } from "../src/background/dictionary"
import { DictionaryStore, packId } from "../src/background/dictionary/store"
import { describeError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { asFetch, jsonResponse } from "./helpers"

/** A pack as the build tools write it. */
function tsv(src: string, tgt: string, entries: Record<string, string>, forms: Record<string, string> = {}): string {
  return [
    `#dict\t${src}\t${tgt}\t20261011\tTest source\tMIT`,
    ...Object.entries(entries).map(([k, v]) => `w\t${k}\t${v}`),
    ...Object.entries(forms).map(([k, v]) => `f\t${k}\t${v}`),
    "",
  ].join("\n")
}

const EN_ZH = tsv(
  "en",
  "zh-Hans",
  { hello: "你好", world: "世界", i: "我", go: "去", to: "到", "new york": "纽约", "ice cream": "冰淇淋", "look up": "查阅", look: "看", up: "向上", report: "报告" },
  { went: "go", reports: "report" },
)
const FR_EN = tsv("fr", "en", { bonjour: "hello", monde: "world" })
const EN_DE = tsv("en", "de", { hello: "hallo", world: "Welt" })
const ZH_EN = tsv("zh-Hans", "en", { 你好: "hello", 世界: "world" })

const pack = (text: string) => parsePack(text)

describe("pack format", () => {
  it("reads the header, entries and forms", () => {
    const p = pack(EN_ZH)
    expect([p.src, p.tgt, p.version, p.source, p.license]).toEqual(["en", "zh-Hans", "20261011", "Test source", "MIT"])
    expect(p.entries.get("new york")).toBe("纽约")
    expect(p.forms.get("went")).toBe("go")
  })

  it("rejects a file without the header", () => {
    expect(() => parsePack("w\thello\tx\n")).toThrow(/damaged/)
  })

  it("normalizes keys: NFC, lower case of the source language, trimmed", () => {
    expect(dictKey("  Café ", "fr")).toBe("café")
    expect(dictKey("İstanbul", "tr")).toBe("istanbul")
  })

  it("maps language codes to pack languages", () => {
    expect(["zh-CN", "zh-TW", "zh", "zh-HK", "pt-BR", "en", "it"].map(dictLang)).toEqual(["zh-Hans", "zh-Hant", "zh-Hans", "zh-Hant", "pt", "en", null])
  })
})

describe("word by word translation", () => {
  it("prefers the longest phrase of up to three words, and keeps unknown words", () => {
    expect(translateText("I went to New York.", pack(EN_ZH))).toBe("我去到纽约.")
    expect(translateText("Look up the report", pack(EN_ZH))).toBe("查阅the报告")
  })

  it("finds inflected forms through their lemma", () => {
    expect(translateText("reports", pack(EN_ZH))).toBe("报告")
  })

  it("keeps punctuation, numbers and line breaks; spaces go only next to Chinese text", () => {
    expect(translateText("Hello, world! 42\nIce cream", pack(EN_ZH))).toBe("你好,世界! 42\n冰淇淋")
  })

  it("matches phrases only across plain spaces", () => {
    expect(translateText("look, up", pack(EN_ZH))).toBe("看,向上")
  })

  it("puts spaces between words for a target language written with spaces", () => {
    expect(translateText("hello world", pack(EN_DE))).toBe("hallo Welt")
    expect(translateText("你好世界。", pack(ZH_EN))).toBe("hello world。")
  })
})

describe("storage, download and the dictionary tier", () => {
  const gz = (text: string) => new Uint8Array(gzipSync(Buffer.from(text, "utf8")))
  const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex")
  const FILES: Record<string, string> = { "dict-en-zh-Hans.tsv.gz": EN_ZH, "dict-fr-en.tsv.gz": FR_EN, "dict-en-de.tsv.gz": EN_DE }

  function indexEntry(file: string, over: Partial<IndexedPack> = {}): IndexedPack {
    const [, src, ...rest] = file.replace(".tsv.gz", "").split("-")
    const data = gz(FILES[file])
    return {
      src,
      tgt: rest.join("-"),
      file,
      bytes: data.byteLength,
      rawBytes: FILES[file].length,
      entries: 2,
      forms: 0,
      sha256: sha(data),
      source: "Test source",
      license: "MIT",
      attribution: "Test contributors; MIT",
      ...over,
    }
  }

  /** GitHub Releases stand-in serving the fixture packs and their index. */
  const releases = vi.fn(async (url: string) => {
    const file = decodeURIComponent(url.split("/").at(-1)!)
    if (file === "dict-index.json") return jsonResponse({ version: 1, packs: Object.keys(FILES).map((f) => indexEntry(f)) })
    if (FILES[file]) return new Response(gz(FILES[file]), { headers: { "content-length": String(gz(FILES[file]).byteLength) } })
    return new Response("Not Found", { status: 404 })
  })

  const newStore = () => new DictionaryStore(() => new IDBFactory())
  async function installed(...files: string[]) {
    const store = newStore()
    for (const file of files) await installPack(indexEntry(file), "dicts-v1", store, { fetchFn: asFetch(releases) })
    return store
  }

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

  it("translates with an installed pack and detects the source language", async () => {
    const dictionary = new Dictionary(await installed("dict-en-zh-Hans.tsv.gz"))
    expect(await dictionary.translate(["Hello world", "I went to New York"], "auto", "zh-CN")).toEqual(["你好世界", "我去到纽约"])
    expect(await dictionary.translate(["Hello"], "en", "zh-CN")).toEqual(["你好"])
  })

  it("returns text in the target language unchanged", async () => {
    const dictionary = new Dictionary(newStore())
    expect(await dictionary.translate(["这是中文"], "auto", "zh-CN")).toEqual(["这是中文"])
  })

  it("goes through English when there is no direct pack", async () => {
    const dictionary = new Dictionary(await installed("dict-fr-en.tsv.gz", "dict-en-zh-Hans.tsv.gz"))
    expect(await dictionary.translate(["Bonjour monde"], "fr", "zh-CN")).toEqual(["你好世界"])
  })

  it("names the missing pair and where to download it", async () => {
    const dictionary = new Dictionary(await installed("dict-fr-en.tsv.gz"))
    const error = await dictionary.translate(["Bonjour"], "fr", "de").catch((e) => e)
    const text = describeError(error, ENGLISH)
    expect(text.split("\n")).toEqual([ENGLISH.t("errDictionaryMissing", ["fr → de"]), ENGLISH.t("hintDictionaryDownload")])
    await expect(dictionary.translate(["Ciao"], "it", "en")).rejects.toThrow(/language it/)
  })

  it("reads the packs again after a change, and releases them when idle", async () => {
    {
      const store = await installed("dict-en-zh-Hans.tsv.gz")
      const data = vi.spyOn(store, "data")
      const dictionary = new Dictionary(store, { idleMs: 30 })
      await dictionary.translate(["hello"], "en", "zh-CN")
      await dictionary.translate(["world"], "en", "zh-CN")
      expect(data).toHaveBeenCalledTimes(1)
      await store.remove(packId("en", "zh-Hans"))
      dictionary.invalidate()
      await expect(dictionary.translate(["hello"], "en", "zh-CN")).rejects.toThrow(/not installed/)
      await installPack(indexEntry("dict-en-zh-Hans.tsv.gz"), "dicts-v1", store, { fetchFn: asFetch(releases) })
      dictionary.invalidate()
      await dictionary.translate(["hello"], "en", "zh-CN")
      const reads = data.mock.calls.length
      await new Promise((r) => setTimeout(r, 80))
      await dictionary.translate(["hello"], "en", "zh-CN")
      expect(data.mock.calls.length).toBe(reads + 1)
    }
  })
})
