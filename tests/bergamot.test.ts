import { zstdCompressSync } from "node:zlib"
import { IDBFactory } from "fake-indexeddb"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalizedError } from "../src/shared/errors"
import { detectSourceLanguage, mapDetectedLanguage } from "../src/offline/bergamot/detect"
import { BergamotEngine } from "../src/offline/bergamot/engine"
import { BergamotError } from "../src/offline/bergamot/errors"
import { normalizeBergamotLang, requiredPairs } from "../src/offline/bergamot/languages"
import { BergamotManager } from "../src/offline/bergamot/manager"
import { compareVersions, type ModelRecord, modelConfig, selectPairs } from "../src/offline/bergamot/records"
import { BergamotStore, type StoredPair } from "../src/offline/bergamot/store"
import { prepareTexts } from "../src/offline/bergamot/text"
import { verifyModelFile } from "../src/offline/bergamot/verify"
import { FakeWorker, makeManager, triple } from "./fixtures/bergamot"
import { sha256Hex } from "./helpers"

let recordId = 0
function rec(src: string, tgt: string, fileType: string, version = "3.0", extra: Partial<ModelRecord> = {}): ModelRecord {
  const name = `${fileType}.${src}${tgt}.${version}`
  return {
    id: `r${++recordId}`,
    name,
    sourceLanguage: src,
    targetLanguage: tgt,
    fileType,
    version,
    architecture: "base-memory",
    filter_expression: "",
    attachment: { location: `loc/${name}.zst`, hash: `h-${name}`, size: 10 },
    decompressedHash: `d-${name}`,
    decompressedSize: 20,
    ...extra,
  }
}
const fullSet = (src: string, tgt: string, version = "3.0", extra: Partial<ModelRecord> = {}) =>
  ["model", "lex", "vocab"].map((t) => rec(src, tgt, t, version, extra))

/* ---------- record selection ---------- */

describe("selectPairs", () => {
  it("keeps 3.x releases and drops pre-releases and other majors", () => {
    const pairs = selectPairs([...fullSet("de", "en", "3.0a1"), ...fullSet("fr", "en", "2.1"), ...fullSet("es", "en", "4.0"), ...fullSet("it", "en", "3.1")])
    expect([...pairs.keys()]).toEqual(["it>en"])
    expect(pairs.get("it>en")?.version).toBe("3.1")
  })

  it("accepts only desktop filter expressions", () => {
    const pairs = selectPairs([
      ...fullSet("a1", "en", "3.0", { filter_expression: "env.appinfo.OS == 'Android'" }),
      ...fullSet("a2", "en", "3.0", { filter_expression: "env.appinfo.OS != 'Android'" }),
      ...fullSet("a3", "en", "3.0", { filter_expression: "env.channel == 'default' || env.channel == 'nightly'" }),
      ...fullSet("a4", "en", "3.0", { filter_expression: undefined }),
    ])
    expect([...pairs.keys()].sort()).toEqual(["a2>en", "a4>en"])
  })

  it("takes the highest version per name and keeps only files at the model's version", () => {
    const records = [
      rec("en", "ko", "model", "3.0", { name: "model.enko" }),
      rec("en", "ko", "model", "3.1", { name: "model.enko" }),
      rec("en", "ko", "lex", "3.1", { name: "lex.enko" }),
      // vocab only at 3.0: not usable with the 3.1 model
      rec("en", "ko", "vocab", "3.0", { name: "vocab.enko" }),
      rec("en", "ko", "srcvocab", "3.1", { name: "srcvocab.enko" }),
      rec("en", "ko", "trgvocab", "3.1", { name: "trgvocab.enko" }),
    ]
    const p = selectPairs(records).get("en>ko")!
    expect(p.version).toBe("3.1")
    expect(p.files.map((f) => `${f.fileType}@${f.version}`)).toEqual(["model@3.1", "lex@3.1", "srcvocab@3.1", "trgvocab@3.1"])
    expect(p.bytes).toBe(40)
    expect(p.rawBytes).toBe(80)
  })

  it("drops the Android set when the desktop set has another version", () => {
    const android = { filter_expression: "env.appinfo.OS == 'Android'" }
    const desktop = { filter_expression: "env.appinfo.OS != 'Android'" }
    const records = [
      rec("zh-Hans", "en", "model", "3.1", { ...android, name: "model.zhen" }),
      rec("zh-Hans", "en", "vocab", "3.1", { ...android, name: "vocab.zhen" }),
      rec("zh-Hans", "en", "model", "3.0", { ...desktop, name: "model.zhen", architecture: "base" }),
      rec("zh-Hans", "en", "lex", "3.0", { ...desktop, name: "lex.zhen" }),
      rec("zh-Hans", "en", "vocab", "3.0", { ...desktop, name: "vocab.zhen" }),
    ]
    const p = selectPairs(records).get("zh-Hans>en")!
    expect(p.version).toBe("3.0")
    expect(p.architecture).toBe("base")
    expect(p.files.every((f) => f.filter_expression === desktop.filter_expression)).toBe(true)
  })

  it("skips qualityModel and unknown file types, needs a model and a vocabulary, lex is optional", () => {
    const pairs = selectPairs([
      ...fullSet("cs", "en"),
      rec("cs", "en", "qualityModel"),
      rec("cs", "en", "something"),
      rec("nl", "en", "model"),
      rec("nl", "en", "vocab"),
      rec("pl", "en", "lex"),
      rec("pl", "en", "vocab"),
      rec("sv", "en", "model"),
      rec("sv", "en", "srcvocab"),
    ])
    expect(pairs.get("cs>en")?.files.map((f) => f.fileType)).toEqual(["model", "lex", "vocab"])
    expect(pairs.get("nl>en")?.files.map((f) => f.fileType)).toEqual(["model", "vocab"])
    expect(pairs.has("pl>en")).toBe(false)
    expect(pairs.has("sv>en")).toBe(false)
  })

  it("prefers a shared vocabulary over separate ones at the same version", () => {
    const p = selectPairs([...fullSet("en", "ja"), rec("en", "ja", "srcvocab"), rec("en", "ja", "trgvocab")]).get("en>ja")!
    expect(p.files.map((f) => f.fileType)).toEqual(["model", "lex", "vocab"])
  })

  it("compares versions numerically", () => {
    expect(compareVersions("3.10", "3.2")).toBeGreaterThan(0)
    expect(compareVersions("3.0", "3.0")).toBe(0)
  })

  it("builds the Marian configuration", () => {
    const alpha = modelConfig("model.enzh.intgemm.alphas.bin")
    expect(alpha.startsWith("\n") && alpha.endsWith("\n")).toBe(true)
    expect(alpha).toContain("\ngemm-precision: int8shiftAlphaAll\n")
    expect(alpha).toContain("\nbeam-size: 1\n")
    expect(alpha).toContain("\nalignment: soft\n")
    expect(modelConfig("model.xx.intgemm8.bin")).toContain("gemm-precision: int8shiftAll\n")
  })
})

/* ---------- languages ---------- */

describe("languages", () => {
  it("maps application and detector codes to model tags", () => {
    expect(["zh", "zh-CN", "zh_CN", "zh-SG", "zh-Hans"].map(normalizeBergamotLang)).toEqual(Array(5).fill("zh-Hans"))
    expect(["zh-TW", "zh-HK", "zh-Hant", "zh-Hant-TW"].map(normalizeBergamotLang)).toEqual(Array(4).fill("zh-Hant"))
    expect(["iw", "no", "pt-BR", "EN", "auto", "in", "fil"].map(normalizeBergamotLang)).toEqual(["he", "nb", "pt", "en", "auto", "id", "tl"])
  })

  it("routes non-English pairs through English", () => {
    expect(requiredPairs("en", "zh-CN")).toEqual([["en", "zh-Hans"]])
    expect(requiredPairs("de", "en")).toEqual([["de", "en"]])
    expect(requiredPairs("ja", "zh-TW")).toEqual([
      ["ja", "en"],
      ["en", "zh-Hant"],
    ])
    expect(requiredPairs("zh-CN", "zh-Hans")).toEqual([])
    expect(() => requiredPairs("auto", "en")).toThrow()
  })
})

/* ---------- text preparation and detection ---------- */

describe("prepareTexts", () => {
  it("keeps outer whitespace, skips empty texts and removes soft hyphens", () => {
    const p = prepareTexts(["  Hello\n", "", "   ", "co­operation"], "en")
    expect(p.inputs).toEqual(["Hello", "cooperation"])
    expect(p.rebuild(["你好", "合作"])).toEqual(["  你好\n", "", "   ", "合作"])
  })

  it("separates full-width punctuation from an opening quote for CJK sources", () => {
    expect(prepareTexts(["这是第一句话。“这是第二句话。”"], "zh-Hans").inputs).toEqual(["这是第一句话。 “这是第二句话。”"])
    expect(prepareTexts(["A。“B"], "de").inputs).toEqual(["A。“B"])
  })
})

describe("detectSourceLanguage", () => {
  const detector = (language: string, isReliable = true, percentage = 99) => vi.fn(async () => ({ isReliable, languages: [{ language, percentage }] }))
  const long = ["Guten Tag, ich schreibe Ihnen wegen der Rechnung vom letzten Monat."]

  it("maps the detector's codes", async () => {
    expect(await detectSourceLanguage(long, detector("zh"))).toBe("zh-Hans")
    expect(await detectSourceLanguage(long, detector("zh-TW"))).toBe("zh-Hant")
    expect(await detectSourceLanguage(long, detector("iw"))).toBe("he")
    expect(await detectSourceLanguage(long, detector("no"))).toBe("nb")
    expect(mapDetectedLanguage("und")).toBeUndefined()
  })

  it("falls back on short text, unreliable answers, low share and failures", async () => {
    const d = detector("de")
    expect(await detectSourceLanguage(["Hi!"], d, "en")).toBe("en")
    expect(d).not.toHaveBeenCalled()
    expect(await detectSourceLanguage(long, detector("de", false), "fr")).toBe("fr")
    expect(await detectSourceLanguage(long, detector("de", true, 40), "zh-CN")).toBe("zh-Hans")
    expect(await detectSourceLanguage(long, vi.fn().mockRejectedValue(new Error("x")), "ja")).toBe("ja")
    expect(await detectSourceLanguage(long, undefined)).toBeUndefined()
  })
})

/* ---------- verification ---------- */

describe("verifyModelFile", () => {
  const raw = new TextEncoder().encode("model bytes ".repeat(100))
  const compressed = new Uint8Array(zstdCompressSync(raw))
  const expected = { name: "model.bin", hash: sha256Hex(compressed), decompressedHash: sha256Hex(raw), decompressedSize: raw.byteLength }

  it("accepts matching hashes", async () => {
    expect(await verifyModelFile(compressed, expected)).toEqual({ ok: true })
  })

  it("rejects a wrong compressed hash, a wrong decompressed hash or size, and broken zstd", async () => {
    expect(await verifyModelFile(compressed, { ...expected, hash: "00" })).toMatchObject({ ok: false, stage: "compressed" })
    expect(await verifyModelFile(compressed, { ...expected, decompressedHash: "00" })).toMatchObject({ ok: false, stage: "decompressed" })
    expect(await verifyModelFile(compressed, { ...expected, decompressedSize: 5 })).toMatchObject({ ok: false, stage: "decompressed" })
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6])
    expect(await verifyModelFile(junk, { ...expected, hash: sha256Hex(junk) })).toMatchObject({ ok: false, stage: "zstd" })
  })
})

/* ---------- storage ---------- */

function storedPair(src: string, tgt: string, hashes: string[], version = "3.0"): StoredPair {
  return {
    key: `${src}>${tgt}`,
    src,
    tgt,
    version,
    architecture: "base",
    files: hashes.map((hash, i) => ({ fileType: i === 0 ? "model" : "vocab", name: `${hash}.bin`, hash, decompressedHash: "", size: 1, decompressedSize: 1 })),
    bytes: hashes.length,
    rawBytes: hashes.length,
    installedAt: 1,
  }
}
const fileRow = (hash: string) => ({ hash, bytes: new Uint8Array([hash.length]).buffer })

describe("BergamotStore", () => {
  it("stores pairs with their files and deletes only unshared files", async () => {
    const store = new BergamotStore(new IDBFactory())
    await store.putPair(storedPair("en", "de", ["a", "shared"]), [fileRow("a"), fileRow("shared")])
    await store.putPair(storedPair("de", "en", ["b", "shared"]), [fileRow("b"), fileRow("shared")])
    expect((await store.listPairs()).map((p) => p.key).sort()).toEqual(["de>en", "en>de"])
    const files = await store.readFiles((await store.getPair("en>de"))!)
    expect(files.map((f) => [f.hash, new Uint8Array(f.bytes)[0]])).toEqual([
      ["a", 1],
      ["shared", 6],
    ])

    expect(await store.deletePair("en>de")).toBe(true)
    expect((await store.fileHashes()).sort()).toEqual(["b", "shared"])
    expect(await store.deletePair("en>de")).toBe(false)
    expect(await store.deletePair("de>en")).toBe(true)
    expect(await store.fileHashes()).toEqual([])
  })

  it("replaces an older installation and drops its unused files", async () => {
    const store = new BergamotStore(new IDBFactory())
    await store.putPair(storedPair("en", "fr", ["old1", "old2"]), [fileRow("old1"), fileRow("old2")])
    await store.putPair(storedPair("en", "fr", ["new1", "old2"], "3.1"), [fileRow("new1"), fileRow("old2")])
    expect((await store.getPair("en>fr"))?.version).toBe("3.1")
    expect((await store.fileHashes()).sort()).toEqual(["new1", "old2"])
  })

  it("keeps metadata", async () => {
    const store = new BergamotStore(new IDBFactory())
    expect(await store.getMeta("records")).toBeUndefined()
    await store.setMeta("records", { n: 1 })
    expect(await store.getMeta("records")).toEqual({ n: 1 })
  })
})

/* ---------- worker protocol ---------- */

function fakeEngine(options: { idleMs?: number } = {}) {
  const workers: FakeWorker[] = []
  const loadPair = vi.fn(async (key: string) => {
    const [src, tgt] = key.split(">")
    return { src: src!, tgt: tgt!, files: [{ fileType: "model", name: "m", bytes: new ArrayBuffer(4) }] }
  })
  const engine = new BergamotEngine({
    createWorker: () => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    },
    loadPair,
    ...options,
  })
  return { engine, workers, loadPair }
}

describe("BergamotEngine", () => {
  afterEach(() => vi.useRealTimers())

  it("loads pairs once, transfers the model buffers and translates through two pairs", async () => {
    const { engine, workers, loadPair } = fakeEngine()
    expect(await engine.translate(["ja>en", "en>zh-Hans"], ["a", "b"])).toEqual(["[ja>en+en>zh-Hans]a", "[ja>en+en>zh-Hans]b"])
    expect(await engine.translate(["en>zh-Hans"], ["c"])).toEqual(["[en>zh-Hans]c"])
    expect(workers).toHaveLength(1)
    expect(loadPair).toHaveBeenCalledTimes(2)
    expect(workers[0]!.log).toEqual(["load:ja>en", "load:en>zh-Hans", "translate:ja>en+en>zh-Hans", "translate:en>zh-Hans"])
    expect(workers[0]!.transfers.slice(0, 2)).toEqual([1, 1])
    expect(engine.heapBytes).toBe(1234)
    engine.shutdown()
  })

  it("keeps at most two pairs and unloads the least recently used one", async () => {
    const { engine, workers } = fakeEngine()
    await engine.translate(["de>en"], ["x"])
    await engine.translate(["en>fr"], ["x"])
    await engine.translate(["de>en"], ["x"])
    await engine.translate(["en>es"], ["x"])
    expect(engine.loadedPairs).toEqual(["de>en", "en>es"])
    expect(workers[0]!.log).toContain("unload:en>fr")
    // A pivot translation never evicts one of its own two pairs.
    await engine.translate(["it>en", "en>es"], ["x"])
    expect(engine.loadedPairs).toEqual(["it>en", "en>es"])
    engine.shutdown()
  })

  it("serializes concurrent requests", async () => {
    const { engine, workers } = fakeEngine()
    const results = await Promise.all([engine.translate(["de>en"], ["1"]), engine.translate(["en>fr"], ["2"]), engine.translate(["de>en"], ["3"])])
    expect(results).toEqual([["[de>en]1"], ["[en>fr]2"], ["[de>en]3"]])
    expect(workers[0]!.log).toEqual(["load:de>en", "translate:de>en", "load:en>fr", "translate:en>fr", "translate:de>en"])
    engine.shutdown()
  })

  it("terminates the worker after the idle time and starts a new one on demand", async () => {
    vi.useFakeTimers()
    const { engine, workers } = fakeEngine({ idleMs: 1000 })
    await engine.translate(["de>en"], ["x"])
    vi.advanceTimersByTime(999)
    expect(workers[0]!.terminated).toBe(false)
    vi.advanceTimersByTime(1)
    expect(workers[0]!.terminated).toBe(true)
    expect(engine.running).toBe(false)
    expect(engine.loadedPairs).toEqual([])
    await engine.translate(["de>en"], ["y"])
    expect(workers).toHaveLength(2)
    expect(workers[1]!.log).toEqual(["load:de>en", "translate:de>en"])
    engine.shutdown()
  })

  it("restarts the worker after an engine error and rejects pending requests on a crash", async () => {
    const { engine, workers } = fakeEngine()
    await engine.translate(["de>en"], ["x"])
    workers[0]!.failNext = "abort"
    await expect(engine.translate(["de>en"], ["y"])).rejects.toThrow("abort")
    expect(workers[0]!.terminated).toBe(true)
    await engine.translate(["de>en"], ["z"])
    expect(workers).toHaveLength(2)

    // Crash while a request is pending.
    const w = workers[1]!
    w.postMessage = function (this: FakeWorker) {
      queueMicrotask(() => this.onerror?.({ message: "out of memory" }))
    }
    await expect(engine.translate(["en>fr"], ["q"])).rejects.toThrow("out of memory")
    expect(w.terminated).toBe(true)
    engine.shutdown()
  })

  it("forgets a pair", async () => {
    const { engine, workers } = fakeEngine()
    await engine.translate(["de>en"], ["x"])
    await engine.forget("de>en")
    await engine.forget("fr>en")
    expect(engine.loadedPairs).toEqual([])
    expect(workers[0]!.log.at(-1)).toBe("unload:de>en")
    engine.shutdown()
  })
})

/* ---------- manager: list, install, remove, translate ---------- */

describe("BergamotManager", () => {
  it("lists available pairs with sizes and the installed state", async () => {
    const files = [...triple("en", "zh-Hans"), ...triple("de", "en")]
    const { manager } = makeManager(files)
    await manager.install("en", "zh-CN")
    const pairs = await manager.listPairs()
    expect(pairs.map((p) => [p.src, p.tgt, p.installed])).toEqual([
      ["de", "en", false],
      ["en", "zh-Hans", true],
    ])
    const enzh = pairs[1]!
    expect(enzh.bytes).toBe(files.slice(0, 3).reduce((n, f) => n + f.record.attachment.size, 0))
    expect(enzh.rawBytes).toBe(files.slice(0, 3).reduce((n, f) => n + f.record.decompressedSize, 0))
    expect(enzh.version).toBe("3.0")
    manager.engine.shutdown()
  })

  it("reports progress in bytes and installs only verified files", async () => {
    const files = triple("en", "de")
    const { manager, store } = makeManager(files)
    const progress: Array<[number, number]> = []
    await manager.install("en", "de", (d, t) => progress.push([d, t]))
    const total = files.reduce((n, f) => n + f.record.attachment.size, 0)
    expect(progress[0]).toEqual([0, total])
    expect(progress.at(-1)).toEqual([total, total])
    expect(progress.every(([d], i) => i === 0 || d >= progress[i - 1]![0])).toBe(true)
    const pair = (await store.getPair("en>de"))!
    expect(pair.files.map((f) => f.fileType)).toEqual(["model", "lex", "vocab"])
    expect((await store.fileHashes()).length).toBe(3)
    manager.engine.shutdown()
  })

  it("rejects a file whose checksum does not match and stores nothing", async () => {
    const files = triple("en", "fr")
    files[1]!.body = new Uint8Array(zstdCompressSync(new TextEncoder().encode("tampered")))
    const { manager, store } = makeManager(files)
    const error = await manager.install("en", "fr").catch((e) => e)
    expect(error).toBeInstanceOf(BergamotError)
    expect(error).toBeInstanceOf(LocalizedError)
    expect(error.i18nText.key).toBe("bergamotChecksumMismatch")
    expect(error.message).toContain("lex.enfr.bin")
    expect(await store.listPairs()).toEqual([])
    expect(await store.fileHashes()).toEqual([])
  })

  it("rejects pairs Mozilla does not offer and reports download failures", async () => {
    const files = triple("en", "fr")
    const { manager, server } = makeManager(files)
    await expect(manager.install("en", "xx")).rejects.toMatchObject({ i18nText: { key: "bergamotUnsupportedPair" } })
    files[2]!.body = null
    await manager.getRecords(true)
    await expect(manager.install("en", "fr")).rejects.toMatchObject({ i18nText: { key: "bergamotDownloadFailed", args: ["vocab.enfr.bin"] } })
    expect(server.calls.at(-1)).toBe(`https://cdn.example/${files[2]!.record.attachment.location}`)
  })

  it("uses the saved model list offline and fails clearly without one", async () => {
    const files = triple("en", "fr")
    const a = makeManager(files)
    a.server.setOffline(true)
    await expect(a.manager.listPairs()).rejects.toMatchObject({ i18nText: { key: "bergamotRecordsFailed" } })

    const b = makeManager(files)
    await b.manager.listPairs()
    const offlineManager = new BergamotManager({ store: b.store, fetch: b.server.fetch, serverUrl: b.server.SERVER, createWorker: () => new FakeWorker() })
    b.server.setOffline(true)
    expect((await offlineManager.listPairs()).map((p) => p.tgt)).toEqual(["fr"])
  })

  it("removes a pair without touching the pairs that share English", async () => {
    const { manager, store } = makeManager([...triple("ja", "en"), ...triple("en", "zh-Hans")])
    await manager.install("ja", "en")
    await manager.install("en", "zh-Hans")
    expect(await manager.translate(["こんにちは"], "ja", "zh-CN")).toEqual(["[ja>en+en>zh-Hans]こんにちは"])
    await manager.remove("ja", "en")
    expect((await store.listPairs()).map((p) => p.key)).toEqual(["en>zh-Hans"])
    expect(manager.engine.loadedPairs).toEqual(["en>zh-Hans"])
    expect(await manager.translate(["Hello"], "en", "zh-Hans")).toEqual(["[en>zh-Hans]Hello"])
    manager.engine.shutdown()
  })

  it("names the missing pairs when a model is not installed", async () => {
    const { manager } = makeManager([...triple("ja", "en"), ...triple("en", "zh-Hans")])
    await manager.install("en", "zh-Hans")
    const error = await manager.translate(["今日は"], "ja", "zh-CN").catch((e) => e)
    expect(error).toBeInstanceOf(LocalizedError)
    expect(error.i18nText).toMatchObject({ key: "bergamotModelMissing", args: ["ja", "zh-Hans", "ja → en"] })
    expect(await manager.missingPairs(requiredPairs("ja", "zh-TW"))).toEqual([
      ["ja", "en"],
      ["en", "zh-Hant"],
    ])
  })

  it("detects the source for auto, returns same-language texts unchanged and keeps empty texts", async () => {
    const detector = vi.fn(async () => ({ isReliable: true, languages: [{ language: "de", percentage: 98 }] }))
    const { manager } = makeManager([...triple("de", "en")], detector)
    await manager.install("de", "en")
    const texts = ["Sehr geehrte Damen und Herren, vielen Dank für Ihre Nachricht.", "", " Gruß "]
    expect(await manager.translate(texts, "auto", "en")).toEqual(["[de>en]Sehr geehrte Damen und Herren, vielen Dank für Ihre Nachricht.", "", " [de>en]Gruß "])
    expect(await manager.translate(["Guten Tag, wie geht es Ihnen heute?"], "auto", "de")).toEqual(["Guten Tag, wie geht es Ihnen heute?"])
    detector.mockResolvedValueOnce({ isReliable: false, languages: [] })
    await expect(manager.translate(["Something long enough to detect"], "auto", "en")).rejects.toMatchObject({ i18nText: { key: "bergamotDetectFailed" } })
    manager.engine.shutdown()
  })

  it("wraps engine failures", async () => {
    const { manager, workers } = makeManager(triple("de", "en"))
    await manager.install("de", "en")
    await manager.translate(["a"], "de", "en")
    workers[0]!.failNext = "memory access out of bounds"
    await expect(manager.translate(["b"], "de", "en")).rejects.toMatchObject({ i18nText: { key: "bergamotEngineFailed", detail: "memory access out of bounds" } })
    manager.engine.shutdown()
  })
})
