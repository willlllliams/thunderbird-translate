/** The manager of the background page, built from the browser APIs (fake ones here). */
import { IDBFactory } from "fake-indexeddb"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type FakeFile, FakeWorker, fakeServer, triple } from "./fixtures/bergamot"

/** Stub indexedDB, fetch, Worker and browser as the background page has them; a fresh module holds a fresh manager. */
async function browserApis(files: FakeFile[], detectLanguage?: () => Promise<unknown>) {
  const server = fakeServer(files)
  const workers: { url: string; worker: FakeWorker }[] = []
  vi.stubGlobal("indexedDB", new IDBFactory())
  vi.stubGlobal("fetch", server.fetch)
  vi.stubGlobal(
    "Worker",
    class extends FakeWorker {
      constructor(url: string) {
        super()
        workers.push({ url, worker: this })
      }
    },
  )
  vi.stubGlobal("browser", { runtime: { getURL: (p: string) => `moz-extension://id/${p}` }, i18n: { detectLanguage } })
  vi.resetModules()
  const { getBergamot } = await import("../src/offline/bergamot/index")
  return { bergamot: getBergamot(), getBergamot, server, workers }
}

beforeEach(() => vi.unstubAllGlobals())

describe("offline engine of the background page", () => {
  it("lists, installs, translates through the worker script and removes", async () => {
    const detect = vi.fn(async () => ({ isReliable: true, languages: [{ language: "de", percentage: 97 }] }))
    const { bergamot, getBergamot, workers } = await browserApis([...triple("de", "en"), ...triple("en", "zh-Hans")], detect)
    expect(getBergamot()).toBe(bergamot)
    expect((await bergamot.listPairs()).map((p) => `${p.src}>${p.tgt}:${p.installed}`)).toEqual(["de>en:false", "en>zh-Hans:false"])

    const progress: number[] = []
    await bergamot.install("de", "en", (done) => progress.push(done))
    expect(progress[0]).toBe(0)
    expect(await bergamot.missingPairs([["de", "en"], ["en", "zh-Hans"]])).toEqual([["en", "zh-Hans"]])

    const text = "Sehr geehrte Damen und Herren, anbei die Rechnung."
    expect(await bergamot.translate([text], "auto", "en")).toEqual([`[de>en]${text}`])
    expect(detect).toHaveBeenCalledWith(text)
    expect(workers.map((w) => w.url)).toEqual(["moz-extension://id/bergamot-worker.js"])

    await bergamot.remove("de", "en")
    expect(await bergamot.missingPairs([["de", "en"]])).toEqual([["de", "en"]])
    expect((await bergamot.listPairs(true)).every((p) => !p.installed)).toBe(true)
  })

  it("uses the fallback source without a detector, and asks for the source without one", async () => {
    const { bergamot } = await browserApis(triple("de", "en"))
    await bergamot.install("de", "en")
    expect(await bergamot.translate(["Guten Morgen zusammen, wie geht es euch?"], "auto", "en", { fallbackSource: "de" })).toEqual([
      "[de>en]Guten Morgen zusammen, wie geht es euch?",
    ])
    await expect(bergamot.translate(["Guten Morgen zusammen, wie geht es euch?"], "auto", "en")).rejects.toMatchObject({ i18nText: { key: "bergamotDetectFailed" } })
  })

  it("falls back when the detector fails or is unsure", async () => {
    const detect = vi.fn().mockRejectedValueOnce(new Error("no CLD")).mockResolvedValueOnce({ isReliable: false, languages: [{ language: "fr", percentage: 99 }] })
    const { bergamot } = await browserApis(triple("de", "en"), detect)
    await bergamot.install("de", "en")
    const text = "Vielen Dank für die schnelle Antwort auf meine Frage."
    for (let i = 0; i < 2; i++) expect(await bergamot.translate([text], "auto", "en", { fallbackSource: "de" })).toEqual([`[de>en]${text}`])
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it("translates between two languages through English", async () => {
    const { bergamot } = await browserApis([...triple("ja", "en"), ...triple("en", "zh-Hant")])
    await expect(bergamot.translate(["こんにちは"], "ja", "zh-TW")).rejects.toMatchObject({
      i18nText: { key: "bergamotModelMissing", args: ["ja", "zh-Hant", "ja → en, en → zh-Hant"] },
    })
    await bergamot.install("ja", "en")
    await bergamot.install("en", "zh-TW")
    expect(await bergamot.translate(["こんにちは"], "ja", "zh-TW")).toEqual(["[ja>en+en>zh-Hant]こんにちは"])
  })
})
