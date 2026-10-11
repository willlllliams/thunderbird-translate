/** The manager of the background page and the offline tier's adapter, built from the browser APIs (fake ones here). */
import { IDBFactory } from "fake-indexeddb"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LocalizedError } from "../src/shared/errors"
import { type FakeFile, FakeWorker, fakeServer, triple } from "./fixtures/bergamot"

/** Stub indexedDB, fetch, Worker and browser as the background page has them; a fresh module holds a fresh manager. */
async function browserApis(files: FakeFile[], detectLanguage?: (text: string) => Promise<unknown>) {
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
  const { bergamotTranslateBatch } = await import("../src/background/translators/bergamot")
  /** The offline tier as the service calls it: one result or error key per text. */
  const translate = async (texts: string[], source: string, target: string) =>
    (await bergamotTranslateBatch(texts, source, target)).map((r) => (r.status === "fulfilled" ? r.value : `error:${(r.reason as LocalizedError).i18nText.key}`))
  return { bergamot: getBergamot(), getBergamot, translate, server, workers }
}

/** Detector answering `language` for texts that start with one of the given words. */
const detectByStart = (languages: Record<string, string>, percentage = 95) =>
  vi.fn(async (text: string) => {
    const language = Object.entries(languages).find(([start]) => text.startsWith(start))?.[1]
    return { isReliable: Boolean(language), languages: language ? [{ language, percentage }] : [] }
  })

beforeEach(() => vi.unstubAllGlobals())

describe("offline engine of the background page", () => {
  it("lists, installs, translates through the worker script and removes", async () => {
    const detect = vi.fn(async () => ({ isReliable: true, languages: [{ language: "de", percentage: 97 }] }))
    const { bergamot, getBergamot, translate, workers } = await browserApis([...triple("de", "en"), ...triple("en", "zh-Hans")], detect)
    expect(getBergamot()).toBe(bergamot)
    expect((await bergamot.listPairs()).map((p) => `${p.src}>${p.tgt}:${p.installed}`)).toEqual(["de>en:false", "en>zh-Hans:false"])

    const progress: number[] = []
    await bergamot.install("de", "en", (done) => progress.push(done))
    expect(progress[0]).toBe(0)
    expect(await bergamot.missingPairs([["de", "en"], ["en", "zh-Hans"]])).toEqual([["en", "zh-Hans"]])

    const text = "Sehr geehrte Damen und Herren, anbei die Rechnung."
    expect(await translate([text], "auto", "en")).toEqual([`[de>en]${text}`])
    expect(detect).toHaveBeenCalledWith(text)
    expect(workers.map((w) => w.url)).toEqual(["moz-extension://id/bergamot-worker.js"])

    await bergamot.remove("de", "en")
    expect(await bergamot.missingPairs([["de", "en"]])).toEqual([["de", "en"]])
    expect((await bergamot.listPairs(true)).every((p) => !p.installed)).toBe(true)
  })

  it("detects every paragraph on its own, translates each language in one request and keeps the order", async () => {
    const detect = detectByStart({ Sehr: "de", Bonjour: "fr", Buongiorno: "it" })
    const { bergamot, translate, workers } = await browserApis([...triple("de", "en"), ...triple("fr", "en"), ...triple("it", "en")], detect)
    await bergamot.install("de", "en")
    await bergamot.install("fr", "en")
    const texts = ["Sehr geehrte Frau Weber, vielen Dank.", "Bonjour Madame, merci pour votre message.", "Sehr gerne helfen wir Ihnen weiter.", "Buongiorno, grazie per la risposta."]
    expect(await translate(texts, "auto", "en")).toEqual([`[de>en]${texts[0]}`, `[fr>en]${texts[1]}`, `[de>en]${texts[2]}`, "error:bergamotModelMissing"])
    // One translate request per installed language: German together, French alone; Italian has no model.
    expect(workers[0].worker.log.filter((line) => line.startsWith("translate"))).toEqual(["translate:de>en", "translate:fr>en"])
  })

  it("gives a paragraph the detector cannot place the language found most often in the batch, else English", async () => {
    // Too short for the detector, unreliable, and below 60 % of the text.
    const detect = vi.fn(async (text: string) =>
      text.startsWith("Vielen") ? { isReliable: true, languages: [{ language: "de", percentage: 97 }] } : text.startsWith("Bis") ? { isReliable: false, languages: [] } : { isReliable: true, languages: [{ language: "fr", percentage: 40 }] },
    )
    const { bergamot, translate } = await browserApis(triple("de", "en"), detect)
    await bergamot.install("de", "en")
    const texts = ["Vielen Dank für die schnelle Antwort auf meine Frage.", "Danke!", "Bis morgen um zehn Uhr im Büro.", "Mit freundlichen Grüßen aus Berlin"]
    expect(await translate(texts, "auto", "en")).toEqual(texts.map((t) => `[de>en]${t}`))
    expect(detect).not.toHaveBeenCalledWith("Danke!")
    // Without any language in the batch: English, here the target itself.
    const alone = ["Guten Morgen zusammen, wie geht es euch?"]
    const { translate: withoutDetector } = await browserApis(triple("de", "en"))
    expect(await withoutDetector(alone, "auto", "en")).toEqual(alone)
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
