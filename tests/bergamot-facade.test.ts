/** The manager of the background page and the offline tier's adapter, built from the browser APIs (fake ones here). */
import { IDBFactory } from "fake-indexeddb"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LocalizedError } from "../src/shared/errors"
import { sourceDetector } from "../src/shared/lang-detect"
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
  /** The offline tier as the service calls it, with the detector of the background script: one result or error key per text. */
  const detect = sourceDetector(detectLanguage ? { detectLanguage: detectLanguage as never } : undefined)
  const translate = async (texts: string[], source: string, target: string) =>
    (await bergamotTranslateBatch(texts, source, target, detect)).map((r) => (r.status === "fulfilled" ? r.value : `error:${(r.reason as LocalizedError).i18nText.key}`))
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
    expect([...(await bergamot.installedKeys())]).toEqual(["de>en"])

    const text = "Sehr geehrte Damen und Herren, anbei die Rechnung."
    expect(await translate([text], "auto", "en")).toEqual([`[de>en]${text}`])
    expect(detect).toHaveBeenCalledWith(text)
    expect(workers.map((w) => w.url)).toEqual(["moz-extension://id/bergamot-worker.js"])

    await bergamot.remove("de", "en")
    expect(await bergamot.installedKeys()).toEqual(new Set())
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

  it("names with the error the models to download, nothing for a pair Mozilla does not offer, and nothing for a guessed language", async () => {
    const detect = detectByStart({ Bonjour: "fr" })
    const { bergamot } = await browserApis([...triple("fr", "en"), ...triple("en", "zh-Hans")], detect)
    await bergamot.install("fr", "en")
    expect([...(await bergamot.installedKeys())]).toEqual(["fr>en"])
    expect([...((await bergamot.catalog()) ?? [])].sort()).toEqual(["en>zh-Hans", "fr>en"])
    await expect(bergamot.translate(["Bonjour"], "fr", "zh-CN")).rejects.toMatchObject({ missing: { service: "bergamot", pair: "fr>zh-Hans", models: ["en>zh-Hans"] } })
    // Mozilla has no Japanese model here: nothing to download.
    await expect(bergamot.translate(["こんにちは"], "ja", "zh-CN")).rejects.toMatchObject({ i18nText: { key: "bergamotUnsupportedPair" } })
    const results = await (await import("../src/background/translators/bergamot")).bergamotTranslateBatch(
      ["Bonjour à tous et merci pour votre message.", "Merci !"],
      "auto",
      "zh-CN",
      sourceDetector({ detectLanguage: detect as never }),
    )
    expect(results[0]).toMatchObject({ status: "rejected", reason: { missing: { pair: "fr>zh-Hans" } } })
    // "Merci !" is too short for the detector: its language is the batch's French, a guess.
    expect(results[1]).toMatchObject({ status: "rejected", reason: { i18nText: { key: "bergamotModelMissing" } } })
    expect((results[1] as PromiseRejectedResult).reason.missing).toBeUndefined()
  })

  it("M1: translates the paragraphs of an installed language at once while Mozilla's model list does not answer", async () => {
    const detect = detectByStart({ Sehr: "de", Bonjour: "fr" })
    const { bergamot } = await browserApis(triple("de", "en"), detect)
    await bergamot.install("de", "en")
    // A new background page: the models stay installed, the model list is not read yet, and Mozilla does not answer.
    vi.stubGlobal("fetch", () => new Promise<Response>(() => {}))
    vi.resetModules()
    const { bergamotTranslateBatch } = await import("../src/background/translators/bergamot")
    const texts = ["Sehr geehrte Frau Weber, vielen Dank für Ihre Nachricht.", "Bonjour Madame, merci beaucoup pour votre message."]
    const [german, french] = await bergamotTranslateBatch(texts, "auto", "en", sourceDetector({ detectLanguage: detect as never }))
    expect(german).toEqual({ status: "fulfilled", value: `[de>en]${texts[0]}` })
    expect(french).toMatchObject({ status: "rejected", reason: { i18nText: { key: "bergamotModelMissing", args: ["fr", "en", "fr → en"] } } })
    expect((french as PromiseRejectedResult).reason.missing).toBeUndefined()
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
