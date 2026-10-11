/** Offline engine: the branches of the manager, the engine, the store and the helpers that the main suite does not reach. */
import { IDBFactory } from "fake-indexeddb"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BergamotEngine, EngineError } from "../src/offline/bergamot/engine"
import { normalizeBergamotLang } from "../src/offline/bergamot/languages"
import type { WorkerRequest } from "../src/offline/bergamot/protocol"
import { compareVersions, type ModelRecord, selectPairs } from "../src/offline/bergamot/records"
import { BergamotStore, DB_NAME } from "../src/offline/bergamot/store"
import { prepareTexts } from "../src/offline/bergamot/text"
import { CDN, FakeWorker, makeManager, modelFile, RECORDS_URL, SERVER, triple } from "./fixtures/bergamot"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const key = (e: unknown) => (e as { i18nText?: { key: string } }).i18nText?.key
const fileUrls = (calls: string[]) => calls.filter((u) => u !== SERVER && u !== RECORDS_URL)

/* ---------- manager: model list ---------- */

describe("model list", () => {
  it("uses a fixed attachments base, else the server's, else the default CDN", async () => {
    const files = triple("en", "fr")
    const fixed = makeManager(files, { attachmentsBase: CDN.slice(0, -1) })
    await fixed.manager.install("en", "fr")
    expect(fileUrls(fixed.server.calls)[0]).toBe(`${CDN}${files[0]!.record.attachment.location}`)
    expect(fixed.server.calls).not.toContain(SERVER)

    for (const root of [new Response("", { status: 500 }), Response.json({ capabilities: {} })]) {
      const { manager, server } = makeManager(files)
      const real = server.mock.getMockImplementation()!
      server.mock.mockImplementation(async (input, init) => (String(input) === SERVER ? root : real(input, init)))
      expect((await manager.getRecords()).attachmentsBase).toBe("https://firefox-settings-attachments.cdn.mozilla.net/")
    }
  })

  it("rejects a list without a data array", async () => {
    const { manager, server } = makeManager([])
    server.mock.mockImplementation(async (input) => (String(input) === RECORDS_URL ? Response.json({ records: [] }) : Response.json({})))
    const error = await manager.listPairs().catch((e) => e)
    expect(key(error)).toBe("bergamotRecordsFailed")
    expect(error.i18nText.detail).toBe("the model list has no data array")
  })

  it("keeps the list for the session when it cannot be saved", async () => {
    const { manager, store } = makeManager(triple("en", "fr"))
    vi.spyOn(store, "setMeta").mockRejectedValue(new Error("quota"))
    expect((await manager.listPairs()).map((p) => p.tgt)).toEqual(["fr"])
  })

  it("shares one download between callers and asks again after six hours", async () => {
    let now = 0
    const { manager, server } = makeManager(triple("en", "fr"), { now: () => now })
    await Promise.all([manager.listPairs(), manager.listPairs()])
    const count = () => server.calls.filter((u) => u === RECORDS_URL).length
    expect(count()).toBe(1)
    now = 6 * 60 * 60 * 1000 - 1
    await manager.listPairs()
    expect(count()).toBe(1)
    now += 1
    await manager.listPairs()
    expect(count()).toBe(2)
  })

  it("fails a forced refresh without the network, keeping the list in memory for later", async () => {
    const { manager, server } = makeManager(triple("en", "fr"))
    await manager.listPairs()
    server.setOffline(true)
    await expect(manager.listPairs(true)).rejects.toMatchObject({ i18nText: { key: "bergamotRecordsFailed" } })
    expect((await manager.listPairs()).map((p) => p.tgt)).toEqual(["fr"])
  })

  it("fails offline when the saved list cannot be read either", async () => {
    const { manager, server, store } = makeManager(triple("en", "fr"))
    server.setOffline(true)
    vi.spyOn(store, "getMeta").mockRejectedValue(new Error("db gone"))
    await expect(manager.listPairs()).rejects.toMatchObject({ i18nText: { key: "bergamotRecordsFailed" } })
  })

  it("lists installed pairs Mozilla no longer offers, and updates", async () => {
    const files = triple("en", "fr")
    const { manager } = makeManager(files)
    await manager.install("en", "fr")
    files.splice(0, 3, ...triple("en", "fr", "3.1"), ...triple("de", "en"))
    await manager.getRecords(true)
    expect(await manager.listPairs()).toEqual([
      expect.objectContaining({ src: "de", tgt: "en", installed: false }),
      expect.objectContaining({ src: "en", tgt: "fr", version: "3.1", installed: true, installedVersion: "3.0" }),
    ])
    files.length = 0
    await manager.getRecords(true)
    expect(await manager.listPairs()).toEqual([expect.objectContaining({ src: "en", tgt: "fr", version: "3.0", installed: true })])
  })

  it("reports a storage failure while listing", async () => {
    const { manager, store } = makeManager(triple("en", "fr"))
    vi.spyOn(store, "listPairs").mockRejectedValue(new Error("db gone"))
    await expect(manager.listPairs()).rejects.toMatchObject({ i18nText: { key: "bergamotStorageFailed", detail: "db gone" } })
    await expect(manager.translate(["Hello"], "en", "fr")).rejects.toMatchObject({ i18nText: { key: "bergamotStorageFailed" } })
  })
})

/* ---------- manager: install and remove ---------- */

describe("installation", () => {
  it("skips the download when the version is installed, and replaces an older one", async () => {
    const files = triple("en", "fr")
    const { manager, server, store } = makeManager(files)
    await manager.install("en", "fr")
    const progress: [number, number][] = []
    await manager.install("en", "fr", (d, t) => progress.push([d, t]))
    const total = files.reduce((n, f) => n + f.record.attachment.size, 0)
    expect(progress).toEqual([[total, total]])
    expect(fileUrls(server.calls)).toHaveLength(3)

    await manager.translate(["x"], "en", "fr")
    expect(manager.engine.loadedPairs).toEqual(["en>fr"])
    files.splice(0, 3, ...triple("en", "fr", "3.1"))
    await manager.getRecords(true)
    await manager.install("en", "fr")
    expect((await store.getPair("en>fr"))?.version).toBe("3.1")
    // The engine drops the old model so the next translation loads the new one.
    expect(manager.engine.loadedPairs).toEqual([])
    expect(await store.fileHashes()).toHaveLength(3)
    manager.engine.shutdown()
  })

  it("treats an unreadable installed pair as not installed", async () => {
    const { manager, store } = makeManager(triple("en", "fr"))
    vi.spyOn(store, "getPair").mockRejectedValueOnce(new Error("broken row"))
    await manager.install("en", "fr")
    expect((await store.listPairs()).map((p) => p.key)).toEqual(["en>fr"])
  })

  it("describes network failures with the file name", async () => {
    const { manager, server } = makeManager(triple("en", "fr"))
    await manager.getRecords()
    server.setOffline(true)
    const error = await manager.install("en", "fr").catch((e) => e)
    expect(error.i18nText).toMatchObject({ key: "bergamotDownloadFailed", args: ["model.enfr.bin"], detail: "NetworkError when attempting to fetch resource." })
  })

  it("stops when cancelled, before or during a download", async () => {
    const { manager, server, store } = makeManager(triple("en", "fr"))
    await manager.getRecords()
    const before = new AbortController()
    before.abort()
    await expect(manager.install("en", "fr", undefined, before.signal)).rejects.toMatchObject({ name: "AbortError" })

    const during = new AbortController()
    const real = server.mock.getMockImplementation()!
    server.mock.mockImplementation(async (input, init) => {
      if (fileUrls([String(input)]).length) {
        during.abort()
        throw new DOMException("The operation was aborted.", "AbortError")
      }
      return real(input, init)
    })
    const error = await manager.install("en", "fr", undefined, during.signal).catch((e) => e)
    expect(error).toBeInstanceOf(DOMException)
    expect(await store.listPairs()).toEqual([])
  })

  it("reads responses without a stream", async () => {
    const files = triple("en", "fr")
    const { manager, server, store } = makeManager(files)
    const real = server.mock.getMockImplementation()!
    server.mock.mockImplementation(async (input, init) => {
      const res = await real(input, init)
      if (!fileUrls([String(input)]).length) return res
      const bytes = await res.arrayBuffer()
      return { ok: true, status: 200, body: null, arrayBuffer: async () => bytes } as unknown as Response
    })
    const progress: number[] = []
    await manager.install("en", "fr", (d) => progress.push(d))
    const sizes = files.map((f) => f.record.attachment.size)
    // Start, one step per file, end.
    expect(progress).toEqual([0, sizes[0], sizes[0]! + sizes[1]!, sizes[0]! + sizes[1]! + sizes[2]!, sizes[0]! + sizes[1]! + sizes[2]!])
    expect((await store.getPair("en>fr"))?.files).toHaveLength(3)
  })

  it("reports storage failures when saving and removing", async () => {
    const { manager, store } = makeManager(triple("en", "fr"))
    vi.spyOn(store, "putPair").mockRejectedValueOnce(new Error("quota exceeded"))
    await expect(manager.install("en", "fr")).rejects.toMatchObject({ i18nText: { key: "bergamotStorageFailed", detail: "quota exceeded" } })
    vi.spyOn(store, "deletePair").mockRejectedValueOnce(new Error("locked"))
    await expect(manager.remove("en", "fr")).rejects.toMatchObject({ i18nText: { key: "bergamotStorageFailed", detail: "locked" } })
  })
})

/* ---------- manager: translation ---------- */

describe("translation", () => {
  it.each(["auto", ""])("rejects the target %j", async (tgt) => {
    const { manager } = makeManager([])
    await expect(manager.translate(["x"], "en", tgt)).rejects.toMatchObject({ i18nText: { key: "bergamotUnsupportedPair" } })
  })

  it("returns empty and blank texts without starting the engine", async () => {
    const { manager, workers } = makeManager(triple("de", "en"))
    await manager.install("de", "en")
    expect(await manager.translate([], "de", "en")).toEqual([])
    expect(await manager.translate(["", "  \n"], "de", "en")).toEqual(["", "  \n"])
    expect(workers).toHaveLength(0)
  })

  it("reports a pair that disappeared from storage after the check", async () => {
    const { manager, store } = makeManager(triple("de", "en"))
    await manager.install("de", "en")
    vi.spyOn(store, "getPair").mockResolvedValueOnce(undefined)
    await expect(manager.translate(["Hallo"], "de", "en")).rejects.toMatchObject({ i18nText: { key: "bergamotStorageFailed", detail: "de>en is not installed" } })
    const pair = (await store.getPair("de>en"))!
    vi.spyOn(store, "readFiles").mockRejectedValueOnce(new Error(`model file x of ${pair.key} is missing from storage`))
    await expect(manager.translate(["Hallo"], "de", "en")).rejects.toMatchObject({ i18nText: { detail: "model file x of de>en is missing from storage" } })
  })

  it("wraps failures of the worker channel", async () => {
    const { manager, workers } = makeManager(triple("de", "en"))
    await manager.install("de", "en")
    await manager.translate(["a"], "de", "en")
    workers[0]!.postMessage = () => {
      throw new Error("DataCloneError")
    }
    await expect(manager.translate(["b"], "de", "en")).rejects.toMatchObject({ i18nText: { key: "bergamotEngineFailed", detail: "DataCloneError" } })
    manager.engine.shutdown()
  })
})

/* ---------- engine ---------- */

function engineWith(worker: () => FakeWorker, options: Partial<ConstructorParameters<typeof BergamotEngine>[0]> = {}) {
  return new BergamotEngine({
    createWorker: worker,
    loadPair: async (k) => ({ src: k.split(">")[0]!, tgt: k.split(">")[1]!, files: [] }),
    ...options,
  })
}

describe("BergamotEngine edge cases", () => {
  it("terminates a worker that does not answer in time, and starts a fresh one for the next request", async () => {
    const stuck = new FakeWorker()
    stuck.postMessage = () => {}
    const created: FakeWorker[] = []
    const engine = engineWith(() => {
      const worker = created.length === 0 ? stuck : new FakeWorker()
      created.push(worker)
      return worker
    }, { timeoutMs: 30 })
    await expect(engine.translate(["de>en"], ["x"])).rejects.toThrow(/did not answer within/)
    expect(stuck.terminated).toBe(true)
    expect(engine.running).toBe(false)
    expect(await engine.translate(["de>en"], ["y"])).toEqual(["[de>en]y"])
    expect(created).toHaveLength(2)
    engine.shutdown()
  })

  it("rejects a request the worker cannot receive, without killing it", async () => {
    const w = new FakeWorker()
    const engine = engineWith(() => w)
    await engine.translate(["de>en"], ["x"])
    w.postMessage = () => {
      throw "detached buffer"
    }
    await expect(engine.translate(["de>en"], ["y"])).rejects.toThrow("detached buffer")
    expect(engine.running).toBe(true)
    engine.shutdown()
  })

  it("restarts after a wrong number of translations", async () => {
    const w = new FakeWorker()
    const post = w.postMessage.bind(w)
    w.postMessage = (m: WorkerRequest, t?: Transferable[]) => post(m.type === "translate" ? { ...m, texts: [] } : m, t)
    const engine = engineWith(() => w)
    const error = await engine.translate(["de>en"], ["a", "b"]).catch((e) => e)
    expect(error).toBeInstanceOf(EngineError)
    expect(error.message).toBe("engine returned 0 translations for 2 texts")
    expect(w.terminated).toBe(true)

    // An answer without a result counts as none.
    const silent = new FakeWorker()
    silent.postMessage = (m: WorkerRequest) => queueMicrotask(() => silent.onmessage?.({ data: { id: m.id, ok: true } }))
    await expect(engineWith(() => silent).translate(["de>en"], ["a"])).rejects.toThrow("engine returned 0 translations for 1 texts")
  })

  it("names a worker error without a message, and ignores answers to unknown requests", async () => {
    const w = new FakeWorker()
    const engine = engineWith(() => w)
    await engine.translate(["de>en"], ["x"])
    w.onmessage?.({ data: { id: 999, ok: true } })
    w.postMessage = () => queueMicrotask(() => w.onerror?.(new Event("error")))
    await expect(engine.translate(["de>en"], ["y"])).rejects.toThrow(/^worker error$/)
  })

  it("uses the given timers and clears the idle timer on shutdown", async () => {
    const setTimer = vi.fn(() => "handle")
    const clearTimer = vi.fn()
    const engine = engineWith(() => new FakeWorker(), { setTimer, clearTimer, idleMs: 42, maxModels: 1 })
    await engine.translate(["de>en"], ["x"])
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 42)
    await engine.translate(["it>en", "en>fr"], ["x"])
    // maxModels is at least 2: a pivot translation fits.
    expect(engine.loadedPairs).toEqual(["it>en", "en>fr"])
    engine.shutdown()
    expect(clearTimer).toHaveBeenLastCalledWith("handle")
  })
})

/* ---------- store ---------- */

/** IndexedDB whose first open() fails with `event`. */
function failingFactory(event: "error" | "blocked"): IDBFactory {
  const real = new IDBFactory()
  let first = true
  return {
    open(name: string, version?: number) {
      if (!first) return real.open(name, version)
      first = false
      const req = { error: new DOMException("denied", "UnknownError") } as unknown as IDBOpenDBRequest
      queueMicrotask(() => (event === "error" ? req.onerror : req.onblocked)?.call(req, new Event(event) as never))
      return req
    },
  } as IDBFactory
}

describe("BergamotStore edge cases", () => {
  it.each([
    ["error", "denied"],
    ["blocked", "IndexedDB open blocked"],
  ] as const)("opens again after an open %s", async (event, message) => {
    const store = new BergamotStore(failingFactory(event))
    await expect(store.listPairs()).rejects.toThrow(message)
    expect(await store.listPairs()).toEqual([])
  })

  it("closes for another page's upgrade", async () => {
    const factory = new IDBFactory()
    const store = new BergamotStore(factory)
    await store.setMeta("k", 1)
    expect(await store.getMeta("k")).toBe(1)
    // An upgrade elsewhere is not blocked by this connection.
    await new Promise<void>((resolve, reject) => {
      const req = factory.open(DB_NAME, 2)
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
      req.onblocked = () => reject(new Error("blocked"))
    })
  })

  it("names a model file missing from storage", async () => {
    const store = new BergamotStore(new IDBFactory())
    const pair = {
      key: "de>en",
      src: "de",
      tgt: "en",
      version: "3.0",
      architecture: "",
      files: [{ fileType: "model" as const, name: "model.deen.bin", hash: "h1", decompressedHash: "", size: 1, decompressedSize: 1 }],
      bytes: 1,
      rawBytes: 1,
      installedAt: 0,
    }
    await expect(store.readFiles(pair)).rejects.toThrow("model file model.deen.bin of de>en is missing from storage")
  })
})

/* ---------- records, languages, text, detection ---------- */

describe("helpers", () => {
  it.each([
    ["3", "3.0", 0],
    ["3.0.1", "3.0", 1],
    ["3.x", "3.0", 0],
    ["2.9", "3", -1],
  ])("compareVersions(%s, %s) has the sign %i", (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign)
  })

  it("skips records without an attachment and fills missing architecture and sizes", () => {
    const [model, vocab] = [modelFile("en", "fr", "model").record, modelFile("en", "fr", "vocab").record]
    const bare = { ...model, architecture: undefined, attachment: { ...model.attachment, size: undefined as unknown as number }, decompressedSize: 0 }
    const broken = { ...vocab, name: "other", attachment: undefined } as unknown as ModelRecord
    const p = selectPairs([bare, vocab, broken]).get("en>fr")!
    expect(p.architecture).toBe("")
    expect(p.files.map((f) => f.name)).toEqual([model.name, vocab.name])
    expect(p.bytes).toBe(vocab.attachment.size)
    expect(p.rawBytes).toBe(vocab.decompressedSize)
  })

  it("maps empty codes and Yiddish", () => {
    expect(["", "  ", "ji", "fil-PH"].map(normalizeBergamotLang)).toEqual(["", "", "yi", "tl"])
  })

  it("rebuilds texts when the engine returns fewer outputs", () => {
    expect(prepareTexts([" a ", "b"], "en").rebuild(["A"])).toEqual([" A ", ""])
    expect(prepareTexts(["。“x"], "ja").inputs).toEqual(["。 “x"])
  })
})
