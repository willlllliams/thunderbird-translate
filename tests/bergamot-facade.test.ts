/** The public functions of the offline engine, built from the browser APIs (fake ones here), and its error texts. */
import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BERGAMOT_MESSAGES, BergamotError, errorText } from "../src/offline/bergamot/errors"
import {
  bergamotTranslate,
  configureBergamot,
  getBergamot,
  installBergamotPair,
  listBergamotPairs,
  missingBergamotPairs,
  removeBergamotPair,
} from "../src/offline/bergamot/index"
import { EN_MESSAGES } from "../src/shared/i18n"
import { type FakeFile, FakeWorker, fakeServer, SERVER, triple } from "./fixtures/bergamot"

/** Stub indexedDB, fetch, Worker and browser as the background page has them. */
function browserApis(files: FakeFile[], detectLanguage?: () => Promise<unknown>) {
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
  // Only the server address differs from the defaults.
  configureBergamot({ serverUrl: SERVER })
  return { server, workers }
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => configureBergamot({}))

describe("offline engine functions", () => {
  it("lists, installs, translates through the worker script and removes", async () => {
    const detect = vi.fn(async () => ({ isReliable: true, languages: [{ language: "de", percentage: 97 }] }))
    const { workers } = browserApis([...triple("de", "en"), ...triple("en", "zh-Hans")], detect)
    expect((await listBergamotPairs()).map((p) => `${p.src}>${p.tgt}:${p.installed}`)).toEqual(["de>en:false", "en>zh-Hans:false"])

    const progress: number[] = []
    await installBergamotPair("de", "en", (done) => progress.push(done))
    expect(progress[0]).toBe(0)
    expect(await missingBergamotPairs("de", "zh-CN")).toEqual([["en", "zh-Hans"]])

    const text = "Sehr geehrte Damen und Herren, anbei die Rechnung."
    expect(await bergamotTranslate([text], "auto", "en")).toEqual([`[de>en]${text}`])
    expect(detect).toHaveBeenCalledWith(text)
    expect(workers.map((w) => w.url)).toEqual(["moz-extension://id/bergamot-worker.js"])

    await removeBergamotPair("de", "en")
    expect(await missingBergamotPairs("de", "en")).toEqual([["de", "en"]])
    expect((await listBergamotPairs(true)).every((p) => !p.installed)).toBe(true)
  })

  it("uses the fallback source without a detector, and asks for the source without one", async () => {
    browserApis(triple("de", "en"))
    await installBergamotPair("de", "en")
    expect(await bergamotTranslate(["Guten Morgen zusammen, wie geht es euch?"], "auto", "en", { fallbackSource: "de" })).toEqual([
      "[de>en]Guten Morgen zusammen, wie geht es euch?",
    ])
    await expect(bergamotTranslate(["Guten Morgen zusammen, wie geht es euch?"], "auto", "en")).rejects.toMatchObject({ i18nText: { key: "bergamotDetectFailed" } })
  })

  it("falls back when the detector fails or is unsure", async () => {
    const detect = vi.fn().mockRejectedValueOnce(new Error("no CLD")).mockResolvedValueOnce({ isReliable: false, languages: [{ language: "fr", percentage: 99 }] })
    browserApis(triple("de", "en"), detect)
    await installBergamotPair("de", "en")
    const text = "Vielen Dank für die schnelle Antwort auf meine Frage."
    for (let i = 0; i < 2; i++) expect(await bergamotTranslate([text], "auto", "en", { fallbackSource: "de" })).toEqual([`[de>en]${text}`])
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it("translates between two languages through English", async () => {
    browserApis([...triple("ja", "en"), ...triple("en", "zh-Hant")])
    await expect(bergamotTranslate(["こんにちは"], "ja", "zh-TW")).rejects.toMatchObject({
      i18nText: { key: "bergamotModelMissing", args: ["ja", "zh-Hant", "ja → en, en → zh-Hant"] },
    })
    await installBergamotPair("ja", "en")
    await installBergamotPair("en", "zh-TW")
    expect(await bergamotTranslate(["こんにちは"], "ja", "zh-TW")).toEqual(["[ja>en+en>zh-Hant]こんにちは"])
  })

  it("stops the running engine when reconfigured", async () => {
    const { workers } = browserApis(triple("de", "en"))
    await installBergamotPair("de", "en")
    await bergamotTranslate(["Hallo"], "de", "en")
    const before = getBergamot()
    expect(getBergamot()).toBe(before)
    configureBergamot({ serverUrl: SERVER })
    expect(workers[0]!.worker.terminated).toBe(true)
    expect(getBergamot()).not.toBe(before)
    // The models stay installed.
    expect(await bergamotTranslate(["Hallo"], "de", "en")).toEqual(["[de>en]Hallo"])
    expect(workers).toHaveLength(2)
  })
})

describe("offline engine errors", () => {
  it("has the English text of every key in the locale", () => {
    for (const [key, text] of Object.entries(BERGAMOT_MESSAGES)) expect(EN_MESSAGES[key as keyof typeof EN_MESSAGES], key).toBe(text)
  })

  it("is a localized error with its key, arguments and detail", () => {
    const error = new BergamotError("bergamotDownloadFailed", ["lex.bin"], "HTTP 500")
    expect(error.bergamotKey).toBe("bergamotDownloadFailed")
    expect(error.i18nText).toEqual({ key: "bergamotDownloadFailed", args: ["lex.bin"], detail: "HTTP 500", hint: undefined })
    expect(error.message).toContain("lex.bin")
  })

  it.each([
    [new Error("disk"), "disk"],
    [new TypeError(), "TypeError"],
    ["plain", "plain"],
    [42, "42"],
  ])("errorText(%o) is %j", (error, text) => {
    expect(errorText(error)).toBe(text)
  })
})
