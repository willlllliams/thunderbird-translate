// @vitest-environment jsdom
/** The "Dictionaries" and "Offline models" lists of the settings and welcome pages, driven directly with a fake background script. */
import { Blob as NodeBlob } from "node:buffer"
import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DictionaryStore } from "../src/offline/dictionary/store"
import { BergamotSection } from "../src/options/bergamot"
import { DictionarySection } from "../src/options/dictionaries"
import { loadSystemLanguages, recommendedFor } from "../src/options/offline-list"
import { describeError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest, BergamotPairInfo } from "../src/shared/messages"
import { languageTag } from "../src/shared/languages"
import type { SourcedLanguage } from "../src/shared/offline-needs"
import { gz, packEntry, releaseServer, tsv } from "./fixtures/dictionary"
import { asFetch, jsonResponse, nextTask, useFakeTimers } from "./helpers"

const sendMessage = vi.fn<(req: unknown) => Promise<unknown>>()
/** The extension API of the lists: runtime.sendMessage, and i18n for the recommended languages. */
const api: Record<string, unknown> = { runtime: { sendMessage } }

/** Background script stand-in: `answers` by request type; records every request. */
function background(answers: Partial<Record<BackgroundRequest["type"], (req: BackgroundRequest) => unknown>>) {
  const requests: BackgroundRequest[] = []
  sendMessage.mockImplementation(async (req) => {
    const r = req as BackgroundRequest
    requests.push(r)
    return answers[r.type]?.(r)
  })
  return requests
}

function panel() {
  const list = document.createElement("ul")
  const status = document.createElement("div")
  const needed = document.createElement("div")
  const filter = document.createElement("input")
  const common = document.createElement("div")
  document.body.replaceChildren(list, status, needed, filter, common)
  const rows = () => Array.from(list.querySelectorAll("li"))
  const row = (start: string) => rows().find((li) => li.textContent!.startsWith(start))!
  const names = () => rows().map((li) => li.querySelector(".dict-name")!.textContent)
  /** Names of the rows whose check box is ticked. */
  const ticked = () => rows().filter((li) => li.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked).map((li) => li.querySelector(".dict-name")!.textContent)
  const labels = (start: string) => Array.from(row(start).querySelectorAll(".lang-sources .tag"), (el) => el.textContent)
  const commonButton = () => Array.from(common.querySelectorAll("button")).find((b) => b.textContent === ENGLISH.t("buttonDownloadCommon"))!
  return { list, status, needed, filter, common, rows, row, names, ticked, labels, commonButton }
}

/** Options shared by both lists: languages of the settings, recommended languages, welcome page. */
interface ListOptions {
  languages?: { source: string; target: string }
  recommended?: SourcedLanguage[]
  pick?: boolean
}
const button = (li: Element, text: string) => Array.from(li.querySelectorAll("button")).find((b) => b.textContent === text)
const unknownError = describeError(undefined, ENGLISH)

beforeEach(() => {
  sendMessage.mockReset()
  vi.stubGlobal("browser", api)
  // jsdom's Blob has no stream(), which gunzip() uses; Thunderbird's has. Stubs are undone before every test (vitest.config.ts).
  vi.stubGlobal("Blob", NodeBlob)
})
afterEach(() => vi.useRealTimers())

/* ---------- dictionaries ---------- */

/* ---------- dictionaries ---------- */

const EN_DE = tsv("en", "de", { hello: "hallo" })
const FR_EN = tsv("fr", "en", { bonjour: "hello" })
const EN_FR = tsv("en", "fr", { hello: "bonjour" })
const EN_JA = tsv("en", "ja", { hello: "こんにちは" })
const DE_EN = tsv("de", "en", { hallo: "hello" })

function dictionaries(texts: string[], options: ListOptions & { fetchFn?: typeof fetch } = {}) {
  const p = panel()
  const store = new DictionaryStore(() => new IDBFactory())
  const section = new DictionarySection({
    tag: () => "dicts-v1",
    list: p.list,
    status: p.status,
    common: p.common,
    filter: p.filter,
    store,
    fetchFn: options.fetchFn ?? asFetch(releaseServer(texts)),
    languages: () => options.languages ?? { source: "de", target: "en" },
    recommended: () => options.recommended ?? [],
    pick: options.pick,
  })
  return { ...p, store, section }
}

describe("dictionary list", () => {
  it("says while loading, and when the release has no packs", async () => {
    const d = dictionaries([])
    const loading = d.section.load()
    expect(d.status.textContent).toBe(ENGLISH.t("dictLoading"))
    await loading
    expect(d.status.textContent).toBe(ENGLISH.t("dictNone"))
  })

  it("downloads a pack with progress, then tells the background script and offers Delete", async () => {
    const data = gz(EN_DE)
    let push!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start: (c) => void (push = c) })
    const fetchFn = asFetch(async (url: string) =>
      url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [packEntry(EN_DE)] }) : new Response(stream, { headers: { "content-length": String(data.byteLength) } }),
    )
    const requests = background({})
    const d = dictionaries([], { fetchFn })
    await d.section.load()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await vi.waitFor(() => expect(d.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [0])))
    expect(button(d.rows()[0]!, ENGLISH.t("buttonDownload"))).toBeUndefined()
    const half = data.byteLength >> 1
    push.enqueue(data.slice(0, half))
    await vi.waitFor(() => expect(d.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [Math.round((half / data.byteLength) * 100)])))
    push.enqueue(data.slice(half))
    push.close()
    await vi.waitFor(() => expect(button(d.rows()[0]!, ENGLISH.t("buttonDelete"))).toBeDefined())
    expect(d.rows()[0]!.textContent).toContain(ENGLISH.t("dictInstalled"))
    expect(requests).toEqual([{ type: "dictionaryChanged" }])
    expect((await d.store.list()).map((p) => p.id)).toEqual(["en>de"])
  })

  it("L1: cancels a running download from its row", async () => {
    const stream = new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(gz(EN_DE).slice(0, 10)) })
    const fetchFn = asFetch(async (url: string) => (url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [packEntry(EN_DE)] }) : new Response(stream)))
    const requests = background({})
    const d = dictionaries([], { fetchFn })
    await d.section.load()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await vi.waitFor(() => expect(button(d.rows()[0]!, ENGLISH.t("buttonCancel"))).toBeDefined())
    button(d.rows()[0]!, ENGLISH.t("buttonCancel"))!.click()
    await vi.waitFor(() => expect(button(d.rows()[0]!, ENGLISH.t("buttonDownload"))).toBeDefined())
    expect(d.rows()[0]!.querySelector(".test-result")).toBeNull()
    expect(requests).toEqual([])
    expect(await d.store.list()).toEqual([])
  })

  it("shows a failed download in its row and offers the download again", async () => {
    const d = dictionaries([EN_DE], { fetchFn: asFetch(async (url: string) => (url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [packEntry(EN_DE, { sha256: "0".repeat(64) })] }) : new Response(gz(EN_DE)))) })
    background({})
    await d.section.load()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await vi.waitFor(() => expect(d.rows()[0]!.querySelector(".test-result.fail")?.textContent).toBe(ENGLISH.t("errDictionaryChecksum", ["dict-en-de.tsv.gz"])))
    expect(button(d.rows()[0]!, ENGLISH.t("buttonDownload"))).toBeDefined()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it("deletes a pack, also one the release no longer has, and shows a failed deletion", async () => {
    const requests = background({})
    const d = dictionaries([EN_DE])
    await d.section.load()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await vi.waitFor(() => expect(button(d.rows()[0]!, ENGLISH.t("buttonDelete"))).toBeDefined())

    // Another release tag without the pack: the installed pack is still listed.
    const other = dictionaries([FR_EN])
    await other.store.put({ ...(await d.store.list())[0]! }, gz(EN_DE).buffer)
    await other.section.load()
    expect(other.names()).toEqual(["English → German (Deutsch)", "French (Français) → English"])
    const remove = vi.spyOn(other.store, "remove").mockRejectedValueOnce(new Error("database locked"))
    button(other.row("English"), ENGLISH.t("buttonDelete"))!.click()
    await vi.waitFor(() => expect(other.row("English").querySelector(".test-result")?.textContent).toBe("database locked"))
    requests.length = 0
    button(other.row("English"), ENGLISH.t("buttonDelete"))!.click()
    await vi.waitFor(() => expect(other.rows()).toHaveLength(1))
    expect(remove).toHaveBeenCalledTimes(2)
    expect(requests).toEqual([{ type: "dictionaryChanged" }])
  })

  it("on the welcome page lists every pack with a check box, ticks those the language pair needs and downloads the ticked ones", async () => {
    background({})
    const d = dictionaries([EN_DE, FR_EN, EN_JA], { languages: { source: "fr", target: "de" }, pick: true })
    await d.section.load()
    expect(d.names()).toEqual(["English → German (Deutsch)", "English → Japanese (日本語)", "French (Français) → English"])
    expect(d.rows().every((li) => li.querySelector("input[type=checkbox]") && !li.querySelector("button"))).toBe(true)
    expect(d.ticked()).toEqual(["English → German (Deutsch)", "French (Français) → English"])
    const fr = d.row("French").querySelector<HTMLInputElement>("input")!
    fr.checked = false
    fr.dispatchEvent(new Event("change"))
    expect(d.section.picked().map((p) => p.id)).toEqual(["en>de"])
    expect(await d.section.downloadPicked()).toBe(0)
    expect((await d.store.list()).map((p) => p.id)).toEqual(["en>de"])
    expect(d.row("English → German").querySelector("input")).toBeNull()
    expect(d.row("English → German").textContent).toContain(ENGLISH.t("dictInstalled"))
    // New languages: the check boxes start from the new recommendation.
    fr.checked = false
    d.section.resetChoice()
    d.section.render()
    expect(d.ticked()).toEqual(["French (Français) → English"])
  })

  it("counts the ticked packs that fail to download", async () => {
    background({})
    const fetchFn = asFetch(async (url: string) => (url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [packEntry(EN_DE, { sha256: "0".repeat(64) })] }) : new Response(gz(EN_DE))))
    const d = dictionaries([], { languages: { source: "en", target: "de" }, pick: true, fetchFn })
    await d.section.load()
    expect(await d.section.downloadPicked()).toBe(1)
    expect(d.row("English").querySelector(".test-result.fail")).not.toBeNull()
  })

  it("with automatic detection puts the packs of the recommended languages first, labelled, and ticks them", async () => {
    background({})
    const recommended: SourcedLanguage[] = [
      { tag: "de", sources: ["target"] },
      { tag: "fr", sources: ["thunderbird", "system"] },
      { tag: "en", sources: ["addon"] },
    ]
    const d = dictionaries([EN_JA, FR_EN, EN_FR, EN_DE, DE_EN], { languages: { source: "auto", target: "de" }, recommended, pick: true })
    await d.section.load()
    expect(d.names()).toEqual(["English → German (Deutsch)", "German (Deutsch) → English", "English → French (Français)", "French (Français) → English", "English → Japanese (日本語)"])
    expect(d.labels("English → German")).toEqual([ENGLISH.t("langSourceTarget"), ENGLISH.t("routeDirect")])
    expect(d.labels("French")).toEqual([ENGLISH.t("langSourceThunderbird"), ENGLISH.t("langSourceSystem"), ENGLISH.t("routeViaEnglish")])
    expect(d.labels("English → Japanese")).toEqual([])
    expect(d.ticked()).toEqual(d.names().slice(0, 4))
  })

  it("filters by language name or direction, several terms separated by commas", async () => {
    background({})
    const d = dictionaries([EN_JA, FR_EN, EN_DE])
    await d.section.load()
    d.filter.value = "japanese"
    d.section.render()
    expect(d.names()).toEqual(["English → Japanese (日本語)"])
    d.filter.value = "fr>en, EN>DE"
    d.section.render()
    expect(d.names()).toEqual(["English → German (Deutsch)", "French (Français) → English"])
    d.filter.value = "klingon"
    d.section.render()
    expect(d.rows()).toEqual([])
    expect(d.status.textContent).toBe(ENGLISH.t("offlineNoMatch"))
  })

  it("downloads the common languages after showing what and how much, leaving out the installed packs", async () => {
    const requests = background({})
    const d = dictionaries([EN_DE, DE_EN, FR_EN, EN_JA, tsv("en", "vi", { hello: "xin chào" })])
    await d.section.load()
    button(d.row("German"), ENGLISH.t("buttonDownload"))!.click()
    await vi.waitFor(() => expect(d.row("German").textContent).toContain(ENGLISH.t("dictInstalled")))
    d.commonButton().click()
    const confirm = d.common.querySelector(".common-confirm")!
    const total = ([EN_DE, FR_EN, EN_JA].map((t) => packEntry(t).bytes).reduce((a, b) => a + b) / 1048576).toFixed(1)
    expect(confirm.querySelector("p")!.textContent).toBe(ENGLISH.t("commonConfirm", [3, total]))
    // Vietnamese is not a common language.
    expect(Array.from(confirm.querySelectorAll("li"), (li) => li.textContent!.split(" · ")[0]).sort()).toEqual(["English → German (Deutsch)", "English → Japanese (日本語)", "French (Français) → English"])
    button(confirm, ENGLISH.t("buttonCancel"))!.click()
    expect(d.common.querySelector(".common-confirm")).toBeNull()
    d.commonButton().click()
    button(d.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await vi.waitFor(() => expect(d.common.textContent).toContain(ENGLISH.t("commonAllInstalled")))
    expect(d.commonButton().disabled).toBe(true)
    expect((await d.store.list()).map((p) => p.id).sort()).toEqual(["de>en", "en>de", "en>ja", "fr>en"])
    expect(requests.filter((r) => r.type === "dictionaryChanged")).toHaveLength(2)
  })

  it("M3: downloads the common languages two at a time and tells the background script once at the end", async () => {
    const requests = background({})
    const server = releaseServer([EN_DE, DE_EN, FR_EN, EN_JA])
    const waiting: (() => void)[] = []
    const fetchFn = asFetch(async (url: string) => {
      if (!url.endsWith("dict-index.json")) await new Promise<void>((resolve) => waiting.push(resolve))
      return server(url)
    })
    const d = dictionaries([], { fetchFn })
    await d.section.load()
    d.commonButton().click()
    button(d.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await vi.waitFor(() => expect(waiting).toHaveLength(2))
    await nextTask()
    expect(waiting).toHaveLength(2)
    waiting.shift()!()
    // A finished pack shows as installed while the others are still running, without a word to the background script yet.
    await vi.waitFor(() => expect(waiting).toHaveLength(2))
    expect(d.rows().filter((li) => li.textContent!.includes(ENGLISH.t("dictInstalled")))).toHaveLength(1)
    expect(requests).toEqual([])
    await vi.waitFor(() => {
      waiting.splice(0).forEach((resolve) => resolve())
      expect(d.common.textContent).toContain(ENGLISH.t("commonAllInstalled"))
    })
    expect(requests).toEqual([{ type: "dictionaryChanged" }])
  })

  /** A release whose pack downloads wait until released; `files` names every pack requested. */
  function heldRelease(texts: string[]) {
    const server = releaseServer(texts)
    const waiting: (() => void)[] = []
    const files: string[] = []
    const fetchFn = asFetch(async (url: string) => {
      if (!url.endsWith("dict-index.json")) {
        files.push(url.split("/").pop()!)
        await new Promise<void>((resolve) => waiting.push(resolve))
      }
      return server(url)
    })
    return { fetchFn, waiting, files }
  }

  it("M1: shows a queued pack as waiting with Cancel, downloads it once and leaves it out of a second download", async () => {
    background({})
    const release = heldRelease([EN_DE, DE_EN, FR_EN, EN_JA])
    const d = dictionaries([], { fetchFn: release.fetchFn })
    await d.section.load()
    d.commonButton().click()
    button(d.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await vi.waitFor(() => expect(release.waiting).toHaveLength(2))
    expect(release.files).toEqual(["dict-en-de.tsv.gz", "dict-de-en.tsv.gz"])
    const [japanese, french] = [d.row("English → Japanese"), d.row("French")]
    // Before the fix the queued row offered "Download", and clicking it requested the pack a second time.
    button(japanese, ENGLISH.t("buttonDownload"))?.click()
    expect(japanese.textContent).toContain(ENGLISH.t("dictQueued"))
    expect(button(japanese, ENGLISH.t("buttonDownload"))).toBeUndefined()
    // Cancel takes French off the queue: it offers "Download" again and is the only common pack left to confirm.
    button(french, ENGLISH.t("buttonCancel"))!.click()
    expect(button(d.row("French"), ENGLISH.t("buttonDownload"))).toBeDefined()
    d.commonButton().click()
    expect(Array.from(d.common.querySelectorAll(".common-confirm li"), (li) => li.textContent!.split(" · ")[0])).toEqual(["French (Français) → English"])
    button(d.common.querySelector(".common-confirm")!, ENGLISH.t("buttonCancel"))!.click()
    await vi.waitFor(() => {
      release.waiting.splice(0).forEach((resolve) => resolve())
      expect(d.rows().filter((li) => li.textContent!.includes(ENGLISH.t("dictInstalled")))).toHaveLength(3)
    })
    expect(release.files.sort()).toEqual(["dict-de-en.tsv.gz", "dict-en-de.tsv.gz", "dict-en-ja.tsv.gz"])
    expect((await d.store.list()).map((p) => p.id).sort()).toEqual(["de>en", "en>de", "en>ja"])
  })

  it("M1: on the welcome page disables the check box of a queued pack", async () => {
    background({})
    const release = heldRelease([EN_DE, FR_EN, EN_JA])
    const d = dictionaries([], { fetchFn: release.fetchFn, languages: { source: "auto", target: "de" }, recommended: [{ tag: "de", sources: ["target"] }, { tag: "fr", sources: ["system"] }, { tag: "ja", sources: ["system"] }], pick: true })
    await d.section.load()
    expect(d.ticked()).toHaveLength(3)
    const done = d.section.downloadPicked()
    await vi.waitFor(() => expect(release.waiting).toHaveLength(2))
    const queued = d.rows().filter((li) => li.textContent!.includes(ENGLISH.t("dictQueued")))
    expect(queued).toHaveLength(1)
    expect(queued[0]!.querySelector<HTMLInputElement>("input[type=checkbox]")!.disabled).toBe(true)
    expect(d.section.picked()).toEqual([])
    await vi.waitFor(() => {
      release.waiting.splice(0).forEach((resolve) => resolve())
      expect(release.files).toHaveLength(3)
    })
    release.waiting.splice(0).forEach((resolve) => resolve())
    expect(await done).toBe(0)
  })

  it("keeps the downloaded packs of the welcome page when the background script cannot be told", async () => {
    background({
      dictionaryChanged: () => {
        throw new Error("no background page")
      },
    })
    const d = dictionaries([EN_DE, FR_EN], { languages: { source: "fr", target: "de" }, pick: true })
    await d.section.load()
    expect(await d.section.downloadPicked()).toBe(0)
    expect(d.rows().every((li) => li.textContent!.includes(ENGLISH.t("dictInstalled")))).toBe(true)
  })

  it("L2: with automatic detection ticks a direct pack only between a recommended language and the target", async () => {
    background({})
    const FR_DE = tsv("fr", "de", { bonjour: "hallo" })
    const FR_JA = tsv("fr", "ja", { bonjour: "こんにちは" })
    const recommended: SourcedLanguage[] = [
      { tag: "de", sources: ["target"] },
      { tag: "fr", sources: ["system"] },
      { tag: "ja", sources: ["system"] },
    ]
    const d = dictionaries([FR_DE, FR_JA, EN_DE], { languages: { source: "auto", target: "de" }, recommended, pick: true })
    await d.section.load()
    expect(d.ticked()).toEqual(["English → German (Deutsch)", "French (Français) → German (Deutsch)"])
    expect(d.labels("French (Français) → Japanese")).toEqual([])
  })
})

/* ---------- offline models ---------- */

const pair = (src: string, tgt: string, over: Partial<BergamotPairInfo> = {}): BergamotPairInfo => ({
  src,
  tgt,
  version: "3.0",
  architecture: "base",
  bytes: 10_485_760,
  rawBytes: 1,
  installed: false,
  ...over,
})

function models(options: ListOptions = {}) {
  const p = panel()
  const section = new BergamotSection({
    languages: () => options.languages ?? { source: "de", target: "en" },
    recommended: () => options.recommended ?? [],
    list: p.list,
    status: p.status,
    common: p.common,
    needed: p.needed,
    filter: p.filter,
    pick: options.pick,
    pollMs: 5,
  })
  return { ...p, section }
}
describe("offline model list", () => {
  it("shows why the list could not be loaded", async () => {
    background({ bergamotList: () => ({ ok: false, error: "Mozilla is unreachable" }) })
    const m = models()
    await m.section.load()
    expect(m.status.textContent).toBe("Mozilla is unreachable")

    sendMessage.mockRejectedValueOnce(new Error("Could not establish connection"))
    await m.section.load()
    expect(m.status.textContent).toBe(describeError(new Error("Could not establish connection"), ENGLISH))
    expect(m.rows()).toEqual([])
  })

  it("names the directions the languages need: from English with automatic detection, through English between two other languages", async () => {
    background({ bergamotList: () => ({ ok: true, pairs: [pair("en", "de"), pair("ja", "en")] }) })
    let languages = { source: "auto", target: "de" }
    const m = panel()
    const section = new BergamotSection({ languages: () => languages, recommended: () => [], list: m.list, status: m.status, common: m.common, needed: m.needed })
    await section.load()
    expect(m.needed.textContent).toBe(ENGLISH.t("bergamotNeededAuto", ["English → German (Deutsch)"]))
    languages = { source: "auto", target: "en" }
    section.render()
    expect(m.needed.textContent).toBe(ENGLISH.t("bergamotNeededAutoEnglish"))
    languages = { source: "ja", target: "de" }
    section.render()
    expect(m.needed.textContent).toBe(ENGLISH.t("bergamotNeeded", ["Japanese (日本語)", "German (Deutsch)", "Japanese (日本語) → English, English → German (Deutsch)"]))
    languages = { source: "de", target: "de" }
    section.render()
    expect(m.needed.textContent).toBe("")
  })

  it("names languages the interface does not list, and shows unknown tags as they are", async () => {
    background({ bergamotList: () => ({ ok: true, pairs: [pair("be", "en"), pair("en", "x!y")] }) })
    const m = models()
    await m.section.load()
    expect(m.rows().map((li) => li.querySelector(".dict-name")!.textContent)).toEqual(["Belarusian → English", "English → x!y"])
  })

  it("installs with progress and stops asking for it afterwards; shows why an installation failed", async () => {
    let finish!: (r: unknown) => void
    let progress = (): unknown => Promise.reject(new Error("busy"))
    const requests = background({
      bergamotList: () => ({ ok: true, pairs: [pair("de", "en")] }),
      bergamotInstall: () => new Promise((r) => (finish = r)),
      bergamotProgress: () => progress(),
    })
    useFakeTimers()
    const m = models()
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    // A failed poll counts as no progress.
    await vi.waitFor(() => expect(requests.filter((r) => r.type === "bergamotProgress").length).toBeGreaterThan(1))
    expect(m.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [0]))
    progress = () => ({ "de>en": { done: 3, total: 4 } })
    await vi.waitFor(() => expect(m.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [75])))
    finish({ ok: false, error: "disk full" })
    await vi.waitFor(() => expect(m.rows()[0]!.querySelector(".test-result")?.textContent).toBe("disk full"))
    // The poll after the end of the installation is the last one (pollMs 5).
    await vi.advanceTimersByTimeAsync(30)
    const polls = requests.filter((r) => r.type === "bergamotProgress").length
    await vi.advanceTimersByTimeAsync(30)
    expect(requests.filter((r) => r.type === "bergamotProgress").length).toBe(polls)
  })

  it.each([
    ["no answer", () => undefined, unknownError],
    ["a failure without text", () => ({ ok: false }), unknownError],
    ["a lost connection", () => Promise.reject(new Error("port closed")), describeError(new Error("port closed"), ENGLISH)],
  ])("describes an installation that ends with %s", async (_, answer, text) => {
    background({ bergamotList: () => ({ ok: true, pairs: [pair("de", "en")] }), bergamotInstall: answer })
    const m = models()
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await vi.waitFor(() => expect(m.rows()[0]?.querySelector(".test-result")?.textContent).toBe(text))
  })

  it("updates an installed pair", async () => {
    const requests = background({ bergamotList: () => ({ ok: true, pairs: [pair("de", "en", { installed: true, installedVersion: "2.9" })] }), bergamotInstall: () => ({ ok: true }) })
    const m = models()
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonUpdate"))!.click()
    await vi.waitFor(() => expect(requests).toContainEqual({ type: "bergamotInstall", src: "de", tgt: "en" }))
  })

  it("keeps a needed pair when the deletion is cancelled, and shows why a deletion failed", async () => {
    let removeAnswer = (): unknown => ({ ok: false, error: "locked" })
    const requests = background({
      bergamotList: () => ({ ok: true, pairs: [pair("de", "en", { installed: true }), pair("fr", "en", { installed: true })] }),
      bergamotRemove: () => removeAnswer(),
    })
    const m = models()
    await m.section.load()
    expect(m.needed.textContent).toBe(ENGLISH.t("bergamotNeeded", ["German (Deutsch)", "English", "German (Deutsch) → English"]))
    button(m.row("German"), ENGLISH.t("buttonDelete"))!.click()
    button(m.row("German"), ENGLISH.t("buttonCancel"))!.click()
    expect(button(m.row("German"), ENGLISH.t("buttonDelete"))).toBeDefined()
    expect(requests.some((r) => r.type === "bergamotRemove")).toBe(false)

    button(m.row("French"), ENGLISH.t("buttonDelete"))!.click()
    await vi.waitFor(() => expect(m.row("French").querySelector(".test-result")?.textContent).toBe("locked"))
    removeAnswer = () => undefined
    button(m.row("French"), ENGLISH.t("buttonDelete"))!.click()
    await vi.waitFor(() => expect(m.row("French").querySelector(".test-result")?.textContent).toBe(unknownError))
    removeAnswer = () => Promise.reject(new Error("port closed"))
    button(m.row("French"), ENGLISH.t("buttonDelete"))!.click()
    await vi.waitFor(() => expect(m.row("French").querySelector(".test-result")?.textContent).toBe(describeError(new Error("port closed"), ENGLISH)))
  })

  it("on the welcome page ticks the directions the language pair needs and downloads the ticked ones", async () => {
    const requests = background({
      bergamotList: () => ({ ok: true, pairs: [pair("ja", "en"), pair("en", "zh-Hans"), pair("de", "en"), pair("en", "ko", { installed: true })] }),
      bergamotInstall: () => ({ ok: true }),
    })
    const recommended: SourcedLanguage[] = [
      { tag: "zh-CN", sources: ["target"] },
      { tag: "ja", sources: ["source"] },
    ]
    const m = models({ languages: { source: "ja", target: "zh-CN" }, recommended, pick: true })
    await m.section.load()
    expect(m.names()).toEqual(["English → Simplified Chinese (简体中文)", "Japanese (日本語) → English", "English → Korean (한국어)", "German (Deutsch) → English"])
    expect(m.labels("Japanese")).toEqual([ENGLISH.t("langSourceSource"), ENGLISH.t("routeViaEnglish")])
    expect(m.ticked()).toEqual(["English → Simplified Chinese (简体中文)", "Japanese (日本語) → English"])
    expect(m.rows().every((li) => !li.querySelector("button"))).toBe(true)
    const box = m.row("English → Simplified").querySelector<HTMLInputElement>("input")!
    box.checked = false
    box.dispatchEvent(new Event("change"))
    await m.section.downloadPicked()
    expect(requests.filter((r) => r.type === "bergamotInstall")).toEqual([{ type: "bergamotInstall", src: "ja", tgt: "en" }])
    box.checked = true
    box.dispatchEvent(new Event("change"))
    await m.section.downloadPicked()
    expect(requests.filter((r) => r.type === "bergamotInstall")).toHaveLength(3)
  })

  it("downloads the common languages that are not installed, after the confirmation", async () => {
    const installed = new Set(["en>de"])
    const requests = background({
      bergamotList: () => ({ ok: true, pairs: [pair("en", "de"), pair("de", "en"), pair("en", "fr", { bytes: 2 * 1048576 }), pair("en", "vi")].map((p) => ({ ...p, installed: installed.has(`${p.src}>${p.tgt}`) })) }),
      bergamotInstall: (r) => {
        const { src, tgt } = r as { src: string; tgt: string }
        installed.add(`${src}>${tgt}`)
        return { ok: true }
      },
    })
    const m = models()
    await m.section.load()
    m.commonButton().click()
    expect(m.common.querySelector(".common-confirm p")!.textContent).toBe(ENGLISH.t("commonConfirm", [2, "12.0"]))
    button(m.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await vi.waitFor(() => expect(m.common.textContent).toContain(ENGLISH.t("commonAllInstalled")))
    expect(requests.filter((r) => r.type === "bergamotInstall").map((r) => r.type === "bergamotInstall" && `${r.src}>${r.tgt}`).sort()).toEqual(["de>en", "en>fr"])
  })

  it("M3: downloads the common languages two at a time and reads the list once at the end", async () => {
    const installed = new Set<string>()
    const waiting: (() => void)[] = []
    const requests = background({
      bergamotList: () => ({ ok: true, pairs: [pair("en", "de"), pair("de", "en"), pair("en", "fr"), pair("fr", "en")].map((p) => ({ ...p, installed: installed.has(`${p.src}>${p.tgt}`) })) }),
      bergamotInstall: (r) =>
        new Promise((resolve) =>
          waiting.push(() => {
            installed.add(`${(r as { src: string }).src}>${(r as { tgt: string }).tgt}`)
            resolve({ ok: true })
          }),
        ),
      bergamotProgress: () => ({}),
    })
    const m = models()
    await m.section.load()
    m.commonButton().click()
    button(m.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await vi.waitFor(() => expect(waiting).toHaveLength(2))
    await nextTask()
    expect(waiting).toHaveLength(2)
    await vi.waitFor(() => {
      waiting.splice(0).forEach((resolve) => resolve())
      expect(m.common.textContent).toContain(ENGLISH.t("commonAllInstalled"))
    })
    expect(requests.filter((r) => r.type === "bergamotInstall")).toHaveLength(4)
    expect(requests.filter((r) => r.type === "bergamotList")).toHaveLength(2)
  })

  it("M1: shows a queued pair as waiting with Cancel and installs it once", async () => {
    const installed = new Set<string>()
    const waiting: (() => void)[] = []
    const requests = background({
      bergamotList: () => ({ ok: true, pairs: [pair("en", "de"), pair("de", "en"), pair("en", "fr"), pair("fr", "en")].map((p) => ({ ...p, installed: installed.has(`${p.src}>${p.tgt}`) })) }),
      bergamotInstall: (r) =>
        new Promise((resolve) =>
          waiting.push(() => {
            installed.add(`${(r as { src: string }).src}>${(r as { tgt: string }).tgt}`)
            resolve({ ok: true })
          }),
        ),
      bergamotProgress: () => ({}),
    })
    const installs = () => requests.flatMap((r) => (r.type === "bergamotInstall" ? [`${r.src}>${r.tgt}`] : []))
    const m = models()
    await m.section.load()
    m.commonButton().click()
    button(m.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await vi.waitFor(() => expect(waiting).toHaveLength(2))
    expect(installs().sort()).toEqual(["de>en", "en>de"])
    const [toFrench, fromFrench] = [m.row("English → French"), m.row("French")]
    button(toFrench, ENGLISH.t("buttonDownload"))?.click()
    expect(toFrench.textContent).toContain(ENGLISH.t("dictQueued"))
    expect(button(toFrench, ENGLISH.t("buttonDownload"))).toBeUndefined()
    button(fromFrench, ENGLISH.t("buttonCancel"))!.click()
    expect(button(m.row("French"), ENGLISH.t("buttonDownload"))).toBeDefined()
    await vi.waitFor(() => {
      waiting.splice(0).forEach((resolve) => resolve())
      expect(installed.size).toBe(3)
    })
    await vi.waitFor(() => expect(requests.filter((r) => r.type === "bergamotList")).toHaveLength(2))
    expect(installs().sort()).toEqual(["de>en", "en>de", "en>fr"])
  })
})

/* ---------- recommended languages of a page ---------- */

describe("recommended languages of a page", () => {
  const tags = (s: Parameters<typeof recommendedFor>[0]) => recommendedFor(s).map((l) => `${l.tag}:${l.sources.join("+")}`)

  it("come from the settings, the interface languages and the system", async () => {
    api.i18n = { getUILanguage: () => "de-DE", getPreferredSystemLanguages: async () => ["fr-FR", "en-US"] }
    await loadSystemLanguages()
    expect(tags({ sourceLang: "auto", targetLang: "zh-CN", uiLanguage: "auto" })).toEqual(["zh-Hans:target", "de:addon+thunderbird", "fr:system", "en:system"])
    expect(tags({ sourceLang: "ja", targetLang: "zh-CN", uiLanguage: "ko" })).toEqual(["zh-Hans:target", "ja:source", "ko:addon", "de:thunderbird", "fr:system", "en:system"])
  })

  it("take the locale of the Intl formats for the system's languages in a Thunderbird without getPreferredSystemLanguages", async () => {
    api.i18n = { getUILanguage: () => "de-DE" }
    await loadSystemLanguages()
    const system = languageTag(Intl.DateTimeFormat().resolvedOptions().locale)
    expect(recommendedFor({ sourceLang: "auto", targetLang: "ja", uiLanguage: "auto" }).find((l) => l.sources.includes("system"))?.tag).toBe(system)
  })

  it("take the locale of the Intl formats when getPreferredSystemLanguages fails or answers nothing", async () => {
    const system = languageTag(Intl.DateTimeFormat().resolvedOptions().locale)
    for (const answer of [() => Promise.reject(new Error("unavailable")), async () => []]) {
      api.i18n = { getUILanguage: () => "de-DE", getPreferredSystemLanguages: answer }
      await loadSystemLanguages()
      expect(recommendedFor({ sourceLang: "auto", targetLang: "ja", uiLanguage: "auto" }).find((l) => l.sources.includes("system"))?.tag).toBe(system)
    }
  })

  it("read a POSIX locale such as en-US-posix (Thunderbird 153 on Linux) as English", async () => {
    api.i18n = { getUILanguage: () => "de-DE", getPreferredSystemLanguages: async () => ["en-US-posix"] }
    await loadSystemLanguages()
    expect(tags({ sourceLang: "auto", targetLang: "ja", uiLanguage: "auto" })).toEqual(["ja:target", "de:addon+thunderbird", "en:system"])
  })
})
