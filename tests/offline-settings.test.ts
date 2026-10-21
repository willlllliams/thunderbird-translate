// @vitest-environment jsdom
/** The "Dictionaries" and "Offline models" lists of the settings and welcome pages, driven directly with a fake background script. */
import { Blob as NodeBlob } from "node:buffer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BergamotSection } from "../src/options/bergamot"
import { DictionarySection } from "../src/options/dictionaries"
import { loadSystemLanguages, recommendedFor } from "../src/options/offline-list"
import { describeError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest, BergamotPairInfo } from "../src/shared/messages"
import { languageTag } from "../src/shared/languages"
import type { SourcedLanguage } from "../src/shared/offline-needs"
import { gz, packEntry, releaseServer, tsv } from "./fixtures/dictionary"
import { bergamotStandIn, offlineBackground, type OfflineBackground } from "./fixtures/offline"
import { jsonResponse, nextTask, until, useFakeTimers } from "./helpers"

const sendMessage = vi.fn<(req: unknown) => Promise<unknown>>()
type Install = Extract<BackgroundRequest, { type: "offlineInstall" }>
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

const EN_DE = tsv("en", "de", { hello: "hallo" })
const FR_EN = tsv("fr", "en", { bonjour: "hello" })
const EN_FR = tsv("en", "fr", { hello: "bonjour" })
const EN_JA = tsv("en", "ja", { hello: "こんにちは" })
const DE_EN = tsv("de", "en", { hallo: "hello" })

/** The dictionary list over the offline handlers of the background script, whose dictionary manager reads the release from `fetchUrl` (`texts` by default). */
function dictionaries(texts: string[], options: ListOptions & { fetchUrl?: (url: string) => Promise<Response>; tag?: string; bg?: OfflineBackground } = {}) {
  const p = panel()
  // The notices of the background script reach the section, as the page forwards them.
  let section: DictionarySection | undefined
  const bg = options.bg ?? offlineBackground({ fetchUrl: options.fetchUrl ?? (async (url) => releaseServer(texts)(url)), toPages: (notice) => section?.receive(notice) })
  sendMessage.mockImplementation(async (req) => bg.respond(req as BackgroundRequest))
  section = new DictionarySection({
    tag: () => options.tag ?? "dicts-v1",
    list: p.list,
    status: p.status,
    common: p.common,
    filter: p.filter,
    languages: () => options.languages ?? { source: "de", target: "en" },
    recommended: () => options.recommended ?? [],
    pick: options.pick,
  })
  return { ...p, bg, store: bg.store, section }
}

describe("dictionary list", () => {
  it("says while loading, and when the release has no packs", async () => {
    const d = dictionaries([])
    const loading = d.section.load()
    expect(d.status.textContent).toBe(ENGLISH.t("dictLoading"))
    await loading
    expect(d.status.textContent).toBe(ENGLISH.t("dictNone"))
  })

  it("asks the background script for the list of the page's release tag, and again from the network when reloaded", async () => {
    const d = dictionaries([EN_DE], { tag: "dicts-v2" })
    await d.section.load()
    await d.section.load()
    expect(d.bg.requests.filter((r) => r.type === "offlineList")).toEqual([
      { type: "offlineList", service: "dictionary", refresh: false, tag: "dicts-v2" },
      { type: "offlineList", service: "dictionary", refresh: false, tag: "dicts-v2" },
    ])
    expect(d.bg.fetch.mock.calls.map(([url]) => url)).toEqual([expect.stringContaining("/dicts-v2/dict-index.json")])
    await d.section.load(true)
    expect(d.bg.fetch).toHaveBeenCalledTimes(2)
  })

  it("shows the list of the latest release tag: an answer for an earlier tag that comes last is ignored", async () => {
    useFakeTimers()
    const answers = new Map<string | undefined, (r: unknown) => void>()
    background({
      offlineList: (req) => new Promise((r) => answers.set((req as { tag?: string }).tag, r)),
      offlineProgress: () => ({}),
    })
    const p = panel()
    let tag = "dicts-v1"
    const section = new DictionarySection({ tag: () => tag, list: p.list, status: p.status, common: p.common, filter: p.filter, languages: () => ({ source: "de", target: "en" }), recommended: () => [] })
    const v1 = section.load()
    tag = "dicts-v2"
    const v2 = section.load()
    await nextTask()
    answers.get("dicts-v2")!({ ok: true, items: [packEntry(DE_EN)] })
    await v2
    expect(p.names()).toEqual(["German (Deutsch) → English"])
    answers.get("dicts-v1")!({ ok: true, items: [packEntry(EN_DE), packEntry(FR_EN)] })
    await v1
    expect(p.names()).toEqual(["German (Deutsch) → English"])
    expect(p.status.textContent).toBe("")
  })

  it("shows why the list could not be loaded, and the installed packs", async () => {
    const d = dictionaries([], { fetchUrl: async () => new Response("Not Found", { status: 404 }) })
    await d.section.load()
    expect(d.status.textContent!.startsWith(ENGLISH.t("dictIndexFailed", [""]).trim())).toBe(true)
    expect(d.status.textContent).toContain("HTTP 404")
    sendMessage.mockRejectedValueOnce(new Error("Could not establish connection"))
    await d.section.load()
    expect(d.status.textContent).toBe(describeError(new Error("Could not establish connection"), ENGLISH))
    sendMessage.mockResolvedValueOnce(undefined)
    await d.section.load()
    expect(d.status.textContent).toBe(ENGLISH.t("dictNone"))
  })

  it("downloads a pack in the background script with progress, then offers Delete", async () => {
    const data = gz(EN_DE)
    let push!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start: (c) => void (push = c) })
    const d = dictionaries([], {
      fetchUrl: async (url) => (url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [packEntry(EN_DE)] }) : new Response(stream, { headers: { "content-length": String(data.byteLength) } })),
    })
    await d.section.load()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await until(() => expect(d.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [0])))
    expect(button(d.rows()[0]!, ENGLISH.t("buttonDownload"))).toBeUndefined()
    const half = data.byteLength >> 1
    push.enqueue(data.slice(0, half))
    await until(() => expect(d.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [Math.round((half / data.byteLength) * 100)])))
    push.enqueue(data.slice(half))
    push.close()
    await until(() => expect(button(d.rows()[0]!, ENGLISH.t("buttonDelete"))).toBeDefined())
    expect(d.rows()[0]!.textContent).toContain(ENGLISH.t("dictInstalled"))
    expect([d.bg.contentScripts.mock.calls.length, d.bg.dataNotices()]).toEqual([1, 1])
    expect((await d.store.list()).map((p) => p.id)).toEqual(["en>de"])
  })

  it("L1: cancels a running download from its row", async () => {
    const stream = new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(gz(EN_DE).slice(0, 10)) })
    const d = dictionaries([], { fetchUrl: async (url) => (url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [packEntry(EN_DE)] }) : new Response(stream)) })
    await d.section.load()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await until(() => expect(button(d.rows()[0]!, ENGLISH.t("buttonCancel"))).toBeDefined())
    button(d.rows()[0]!, ENGLISH.t("buttonCancel"))!.click()
    await until(() => expect(button(d.rows()[0]!, ENGLISH.t("buttonDownload"))).toBeDefined())
    expect(d.rows()[0]!.querySelector(".test-result")).toBeNull()
    expect(d.bg.requests).toContainEqual({ type: "offlineCancel", service: "dictionary", src: "en", tgt: "de" })
    expect(await d.store.list()).toEqual([])
  })

  it("shows a failed download in its row and offers the download again", async () => {
    const d = dictionaries([], { fetchUrl: async (url) => (url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [packEntry(EN_DE, { sha256: "0".repeat(64) })] }) : new Response(gz(EN_DE))) })
    await d.section.load()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await until(() => expect(d.rows()[0]!.querySelector(".test-result.fail")?.textContent).toBe(ENGLISH.t("errDictionaryChecksum", ["dict-en-de.tsv.gz"])))
    expect(button(d.rows()[0]!, ENGLISH.t("buttonDownload"))).toBeDefined()
  })

  it.each([
    ["no answer", () => sendMessage.mockResolvedValueOnce(undefined), unknownError],
    ["a lost connection", () => sendMessage.mockRejectedValueOnce(new Error("port closed")), describeError(new Error("port closed"), ENGLISH)],
  ])("describes an installation that ends with %s", async (_, answer, text) => {
    const d = dictionaries([EN_DE])
    await d.section.load()
    answer()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await until(() => expect(d.rows()[0]?.querySelector(".test-result")?.textContent).toBe(text))
  })

  it("deletes a pack, also one the release no longer has, and shows a failed deletion in the words of the interface", async () => {
    const bg = offlineBackground({ fetchUrl: async (url) => releaseServer(url.includes("/other/") ? [FR_EN] : [EN_DE])(url) })
    const d = dictionaries([], { bg })
    await d.section.load()
    button(d.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await until(() => expect(button(d.rows()[0]!, ENGLISH.t("buttonDelete"))).toBeDefined())

    // Another release tag without the pack: the installed pack is still listed.
    const other = dictionaries([], { bg, tag: "other" })
    await other.section.load()
    expect(other.names()).toEqual(["English → German (Deutsch)", "French (Français) → English"])
    // The database refuses the deletion once.
    const store = bg.store as unknown as { open: () => Promise<IDBDatabase> }
    const open = store.open
    store.open = () => {
      store.open = open
      return Promise.reject(new Error("database locked"))
    }
    button(other.row("English"), ENGLISH.t("buttonDelete"))!.click()
    await until(() => expect(other.row("English").querySelector(".test-result")?.textContent).toBe(`${ENGLISH.t("dictionaryStorageFailed")} - database locked`))
    button(other.row("English"), ENGLISH.t("buttonDelete"))!.click()
    await until(() => expect(other.rows()).toHaveLength(1))
    expect([bg.contentScripts.mock.calls.length, bg.dataNotices()]).toEqual([3, 3])
  })

  it("on the welcome page lists every pack with a check box, ticks those the language pair needs and downloads the ticked ones", async () => {
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
    const d = dictionaries([], {
      languages: { source: "en", target: "de" },
      pick: true,
      fetchUrl: async (url) => (url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [packEntry(EN_DE, { sha256: "0".repeat(64) })] }) : new Response(gz(EN_DE))),
    })
    await d.section.load()
    expect(await d.section.downloadPicked()).toBe(1)
    expect(d.row("English").querySelector(".test-result.fail")).not.toBeNull()
  })

  it("with automatic detection puts the packs of the recommended languages first, labelled, and ticks them", async () => {
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
    const d = dictionaries([EN_DE, DE_EN, FR_EN, EN_JA, tsv("en", "vi", { hello: "xin chào" })])
    await d.section.load()
    button(d.row("German"), ENGLISH.t("buttonDownload"))!.click()
    await until(() => expect(d.row("German").textContent).toContain(ENGLISH.t("dictInstalled")))
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
    await until(() => expect(d.common.textContent).toContain(ENGLISH.t("commonAllInstalled")))
    expect(d.commonButton().disabled).toBe(true)
    expect((await d.store.list()).map((p) => p.id).sort()).toEqual(["de>en", "en>de", "en>ja", "fr>en"])
  })

  /** A release whose pack downloads wait until released; `files` names every pack requested. */
  function heldRelease(texts: string[]) {
    const server = releaseServer(texts)
    const waiting: (() => void)[] = []
    const files: string[] = []
    const fetchUrl = async (url: string) => {
      if (!url.endsWith("dict-index.json")) {
        files.push(url.split("/").pop()!)
        await new Promise<void>((resolve) => waiting.push(resolve))
      }
      return server(url)
    }
    return { fetchUrl, waiting, files }
  }

  it("M3: downloads the common languages two at a time in the background script, reads the list after each one and tells the content scripts once", async () => {
    const release = heldRelease([EN_DE, DE_EN, FR_EN, EN_JA])
    const d = dictionaries([], { fetchUrl: release.fetchUrl })
    await d.section.load()
    d.commonButton().click()
    button(d.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await until(() => expect(release.waiting).toHaveLength(2))
    await nextTask()
    expect(release.waiting).toHaveLength(2)
    release.waiting.shift()!()
    await until(() => expect(release.waiting).toHaveLength(2))
    await until(() => {
      release.waiting.splice(0).forEach((resolve) => resolve())
      expect(d.common.textContent).toContain(ENGLISH.t("commonAllInstalled"))
    })
    // When the section loads, after each of the four installations (offlineDataChanged), and at the end.
    expect(d.bg.requests.filter((r) => r.type === "offlineList")).toHaveLength(6)
    expect([d.bg.contentScripts.mock.calls.length, d.bg.dataNotices()]).toEqual([1, 4])
  })

  it("M1: shows a queued pack as waiting with Cancel, downloads it once and leaves it out of a second download", async () => {
    const release = heldRelease([EN_DE, DE_EN, FR_EN, EN_JA])
    const d = dictionaries([], { fetchUrl: release.fetchUrl })
    await d.section.load()
    d.commonButton().click()
    button(d.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await until(() => expect(release.waiting).toHaveLength(2))
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
    await until(() => {
      release.waiting.splice(0).forEach((resolve) => resolve())
      expect(d.rows().filter((li) => li.textContent!.includes(ENGLISH.t("dictInstalled")))).toHaveLength(3)
    })
    expect(release.files.sort()).toEqual(["dict-de-en.tsv.gz", "dict-en-de.tsv.gz", "dict-en-ja.tsv.gz"])
    expect((await d.store.list()).map((p) => p.id).sort()).toEqual(["de>en", "en>de", "en>ja"])
  })

  it("M1: on the welcome page disables the check box of a queued pack", async () => {
    const release = heldRelease([EN_DE, FR_EN, EN_JA])
    const d = dictionaries([], { fetchUrl: release.fetchUrl, languages: { source: "auto", target: "de" }, recommended: [{ tag: "de", sources: ["target"] }, { tag: "fr", sources: ["system"] }, { tag: "ja", sources: ["system"] }], pick: true })
    await d.section.load()
    expect(d.ticked()).toHaveLength(3)
    const done = d.section.downloadPicked()
    await until(() => expect(release.waiting).toHaveLength(2))
    // The progress of the background script tells the running packs from the queued one.
    const queued = () => d.rows().filter((li) => li.textContent!.includes(ENGLISH.t("dictQueued")))
    await until(() => expect(queued()).toHaveLength(1))
    expect(d.rows().every((li) => li.querySelector<HTMLInputElement>("input[type=checkbox]")!.disabled)).toBe(true)
    expect(d.section.picked()).toEqual([])
    await until(() => {
      release.waiting.splice(0).forEach((resolve) => resolve())
      expect(release.files).toHaveLength(3)
    })
    release.waiting.splice(0).forEach((resolve) => resolve())
    expect(await done).toBe(0)
  })

  it("shows the downloads a closed page started, running and queued, when it opens again, and follows them to the end", async () => {
    const release = heldRelease([EN_DE, DE_EN, FR_EN])
    let page: DictionarySection | undefined
    const bg = offlineBackground({ fetchUrl: release.fetchUrl, toPages: (notice) => page?.receive(notice) })
    // A page asked for three packs and was closed.
    void bg.respond({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "de" }, { src: "de", tgt: "en" }, { src: "fr", tgt: "en" }], tag: "dicts-v1" })
    await until(() => expect(release.waiting).toHaveLength(2))
    const d = dictionaries([], { bg })
    page = d.section
    await d.section.load()
    expect(d.row("English").textContent).toContain(ENGLISH.t("dictDownloading", [0]))
    expect(d.row("German").textContent).toContain(ENGLISH.t("dictDownloading", [0]))
    expect(d.row("French").textContent).toContain(ENGLISH.t("dictQueued"))
    button(d.row("French"), ENGLISH.t("buttonCancel"))!.click()
    expect(button(d.row("French"), ENGLISH.t("buttonDownload"))).toBeDefined()
    await until(() => {
      release.waiting.splice(0).forEach((resolve) => resolve())
      expect(d.rows().filter((li) => li.textContent!.includes(ENGLISH.t("dictInstalled")))).toHaveLength(2)
    })
    expect(release.files.sort()).toEqual(["dict-de-en.tsv.gz", "dict-en-de.tsv.gz"])
    expect(button(d.row("French"), ENGLISH.t("buttonDownload"))).toBeDefined()
  })

  it("L2: with automatic detection ticks a direct pack only between a recommended language and the target", async () => {
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
  })
  return { ...p, section }
}
describe("offline model list", () => {
  // Fake timers: the progress notices of the offline handlers go with the clock instead of reaching the next test.
  // The dictionary list stays on real time: its downloads give up after 30 s without data, which until() would pass on fake timers.
  beforeEach(() => useFakeTimers())

  it("shows why the list could not be loaded", async () => {
    background({ offlineList: () => ({ ok: false, error: "Mozilla is unreachable" }) })
    const m = models()
    await m.section.load()
    expect(m.status.textContent).toBe("Mozilla is unreachable")

    sendMessage.mockRejectedValueOnce(new Error("Could not establish connection"))
    await m.section.load()
    expect(m.status.textContent).toBe(describeError(new Error("Could not establish connection"), ENGLISH))
    expect(m.rows()).toEqual([])
  })

  it("names the directions the languages need: from English with automatic detection, through English between two other languages", async () => {
    background({ offlineList: () => ({ ok: true, items: [pair("en", "de"), pair("ja", "en")] }) })
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
    expect(m.needed.textContent).toBe(ENGLISH.t("bergamotNeeded", ["Japanese (日本語)", "German (Deutsch)", "Japanese (日本語) → English and English → German (Deutsch)"]))
    languages = { source: "de", target: "de" }
    section.render()
    expect(m.needed.textContent).toBe("")
  })

  it("names languages the interface does not list, and shows unknown tags as they are", async () => {
    background({ offlineList: () => ({ ok: true, items: [pair("be", "en"), pair("en", "x!y")] }) })
    const m = models()
    await m.section.load()
    expect(m.rows().map((li) => li.querySelector(".dict-name")!.textContent)).toEqual(["Belarusian → English", "English → x!y"])
  })

  it("shows the progress the background script reports, without asking for it, and why an installation failed", async () => {
    let finish!: (r: unknown) => void
    const requests = background({
      offlineList: () => ({ ok: true, items: [pair("de", "en")] }),
      offlineInstall: () => new Promise((r) => (finish = (result) => r([result]))),
    })
    const m = models()
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    // Asked for and not reported yet: waiting for its turn.
    expect(m.rows()[0]!.textContent).toContain(ENGLISH.t("dictQueued"))
    m.section.receive({ type: "offlineProgressChanged", progress: { bergamot: { "de>en": { state: "running", done: 3, total: 4 } } } })
    expect(m.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [75]))
    // U7: the rows are drawn anew; the focus stays on the Cancel of the row.
    button(m.rows()[0]!, ENGLISH.t("buttonCancel"))!.focus()
    m.section.receive({ type: "offlineProgressChanged", progress: { bergamot: { "de>en": { state: "running", done: 7, total: 8 } } } })
    expect(m.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [88]))
    expect(document.activeElement).toBe(button(m.rows()[0]!, ENGLISH.t("buttonCancel")))
    // Notices of other services and other messages leave the row as it is.
    m.section.receive({ type: "offlineProgressChanged", progress: { dictionary: {} } })
    expect(document.activeElement).toBe(button(m.rows()[0]!, ENGLISH.t("buttonCancel")))
    m.section.receive({ type: "somethingElse" })
    m.section.receive(undefined)
    expect(m.rows()[0]!.textContent).toContain(ENGLISH.t("dictQueued"))
    finish({ ok: false, error: "disk full" })
    await until(() => expect(m.rows()[0]!.querySelector(".test-result")?.textContent).toBe("disk full"))
    await vi.advanceTimersByTimeAsync(10_000)
    // The only request for the progress came with the list.
    expect(requests.filter((r) => r.type === "offlineProgress")).toHaveLength(2)
    expect(requests.filter((r) => r.type === "offlineList")).toHaveLength(2)
  })

  it("keeps the progress of a notice that came after the snapshot was asked for: a download that ended while the list loaded is not shown at 50%", async () => {
    let answerList!: (r: unknown) => void
    background({
      offlineList: () => new Promise((r) => (answerList = r)),
      offlineProgress: () => ({ bergamot: { "de>en": { state: "running", done: 1, total: 2 } } }),
    })
    const m = models()
    const loading = m.section.load()
    await nextTask()
    // The download ends while the list is still on its way.
    m.section.receive({ type: "offlineProgressChanged", progress: { bergamot: {} } })
    answerList({ ok: true, items: [pair("de", "en", { installed: true })] })
    await loading
    expect(m.row("German").textContent).toContain(ENGLISH.t("dictInstalled"))
    expect(m.row("German").textContent).not.toContain(ENGLISH.t("dictDownloading", [50]))
  })

  it("reads the list again when data changes while its own downloads run, and takes only the answer of the latest read", async () => {
    const answers: ((r: unknown) => void)[] = []
    let finish!: (r: unknown) => void
    const requests = background({
      offlineList: () => new Promise((r) => answers.push(r)),
      offlineProgress: () => ({}),
      offlineInstall: () => new Promise((r) => (finish = r)),
    })
    const m = models()
    const loading = m.section.load()
    await nextTask()
    answers.shift()!({ ok: true, items: [pair("de", "en"), pair("en", "fr")] })
    await loading
    button(m.row("German"), ENGLISH.t("buttonDownload"))!.click()
    // Another page installed a direction meanwhile: the list is read again although this page's download runs.
    m.section.receive({ type: "offlineDataChanged" })
    m.section.receive({ type: "offlineDataChanged" })
    await until(() => expect(requests.filter((r) => r.type === "offlineList")).toHaveLength(3))
    // The later read answers first; the earlier one, answering last, changes nothing.
    answers.pop()!({ ok: true, items: [pair("de", "en"), pair("en", "fr", { installed: true })] })
    await until(() => expect(m.row("English").textContent).toContain(ENGLISH.t("dictInstalled")))
    answers.pop()!({ ok: true, items: [pair("de", "en"), pair("en", "fr")] })
    await nextTask()
    expect(m.row("English").textContent).toContain(ENGLISH.t("dictInstalled"))
    finish([{ ok: true }])
    await until(() => expect(requests.filter((r) => r.type === "offlineList")).toHaveLength(4))
  })

  it("shows the downloads of another page when it opens, running and queued, and takes a queued one off the queue", async () => {
    const requests = background({
      offlineList: () => ({ ok: true, items: [pair("de", "en"), pair("en", "fr"), pair("ja", "en")] }),
      offlineProgress: () => ({ bergamot: { "de>en": { state: "running", done: 1, total: 2 }, "en>fr": { state: "queued", done: 0, total: 0 } } }),
    })
    const m = models({ pick: true })
    await m.section.load()
    expect(m.row("German").textContent).toContain(ENGLISH.t("dictDownloading", [50]))
    expect(m.row("English").textContent).toContain(ENGLISH.t("dictQueued"))
    expect(m.section.picked().map((p) => p.id)).toEqual([])
    expect(m.row("German").querySelector<HTMLInputElement>("input[type=checkbox]")!.disabled).toBe(true)
    button(m.row("German"), ENGLISH.t("buttonCancel"))!.click()
    expect(requests).toContainEqual({ type: "offlineCancel", service: "bergamot", src: "de", tgt: "en" })
    button(m.row("English"), ENGLISH.t("buttonCancel"))!.click()
    expect(requests).toContainEqual({ type: "offlineCancel", service: "bergamot", src: "en", tgt: "fr" })
    expect(m.row("English").textContent).not.toContain(ENGLISH.t("dictQueued"))
    expect(m.row("English").querySelector<HTMLInputElement>("input[type=checkbox]")!.disabled).toBe(false)
    // Installed or removed data: the list is read again.
    const lists = () => requests.filter((r) => r.type === "offlineList").length
    m.section.receive({ type: "offlineDataChanged" })
    await until(() => expect(lists()).toBe(2))
  })

  it.each([
    ["no answer", () => undefined, unknownError],
    ["a failure without text", () => [{ ok: false }], unknownError],
    ["a lost connection", () => Promise.reject(new Error("port closed")), describeError(new Error("port closed"), ENGLISH)],
  ])("describes an installation that ends with %s", async (_, answer, text) => {
    background({ offlineList: () => ({ ok: true, items: [pair("de", "en")] }), offlineInstall: answer })
    const m = models()
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await until(() => expect(m.rows()[0]?.querySelector(".test-result")?.textContent).toBe(text))
  })

  it("updates an installed pair", async () => {
    const requests = background({ offlineList: () => ({ ok: true, items: [pair("de", "en", { installed: true, installedVersion: "2.9" })] }), offlineInstall: () => [{ ok: true }] })
    const m = models()
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonUpdate"))!.click()
    await until(() => expect(requests).toContainEqual({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "de", tgt: "en" }] }))
  })

  it("keeps a needed pair when the deletion is cancelled, and shows why a deletion failed", async () => {
    let removeAnswer = (): unknown => ({ ok: false, error: "locked" })
    const requests = background({
      offlineList: () => ({ ok: true, items: [pair("de", "en", { installed: true }), pair("fr", "en", { installed: true })] }),
      offlineRemove: () => removeAnswer(),
    })
    const m = models()
    await m.section.load()
    expect(m.needed.textContent).toBe(ENGLISH.t("bergamotNeeded", ["German (Deutsch)", "English", "German (Deutsch) → English"]))
    button(m.row("German"), ENGLISH.t("buttonDelete"))!.click()
    button(m.row("German"), ENGLISH.t("buttonCancel"))!.click()
    expect(button(m.row("German"), ENGLISH.t("buttonDelete"))).toBeDefined()
    expect(requests.some((r) => r.type === "offlineRemove")).toBe(false)

    button(m.row("French"), ENGLISH.t("buttonDelete"))!.click()
    await until(() => expect(m.row("French").querySelector(".test-result")?.textContent).toBe("locked"))
    removeAnswer = () => undefined
    button(m.row("French"), ENGLISH.t("buttonDelete"))!.click()
    await until(() => expect(m.row("French").querySelector(".test-result")?.textContent).toBe(unknownError))
    removeAnswer = () => Promise.reject(new Error("port closed"))
    button(m.row("French"), ENGLISH.t("buttonDelete"))!.click()
    await until(() => expect(m.row("French").querySelector(".test-result")?.textContent).toBe(describeError(new Error("port closed"), ENGLISH)))
  })

  it("on the welcome page ticks the directions the language pair needs and downloads the ticked ones", async () => {
    const requests = background({
      offlineList: () => ({ ok: true, items: [pair("ja", "en"), pair("en", "zh-Hans"), pair("de", "en"), pair("en", "ko", { installed: true })] }),
      offlineInstall: () => [{ ok: true }],
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
    expect(requests.filter((r) => r.type === "offlineInstall")).toEqual([{ type: "offlineInstall", service: "bergamot", pairs: [{ src: "ja", tgt: "en" }] }])
    box.checked = true
    box.dispatchEvent(new Event("change"))
    await m.section.downloadPicked()
    expect(requests.filter((r) => r.type === "offlineInstall")).toHaveLength(3)
  })

  it("downloads the common languages that are not installed, after the confirmation", async () => {
    const installed = new Set(["en>de"])
    const requests = background({
      offlineList: () => ({ ok: true, items: [pair("en", "de"), pair("de", "en"), pair("en", "fr", { bytes: 2 * 1048576 }), pair("en", "vi")].map((p) => ({ ...p, installed: installed.has(`${p.src}>${p.tgt}`) })) }),
      offlineInstall: (r) => {
        const [{ src, tgt }] = (r as Install).pairs
        installed.add(`${src}>${tgt}`)
        return [{ ok: true }]
      },
    })
    const m = models()
    await m.section.load()
    m.commonButton().click()
    expect(m.common.querySelector(".common-confirm p")!.textContent).toBe(ENGLISH.t("commonConfirm", [2, "12.0"]))
    button(m.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await until(() => expect(m.common.textContent).toContain(ENGLISH.t("commonAllInstalled")))
    expect(requests.flatMap((r) => (r.type === "offlineInstall" ? r.pairs.map((p) => `${p.src}>${p.tgt}`) : [])).sort()).toEqual(["de>en", "en>fr"])
  })

  /** The offline handlers of the background script over a Bergamot manager that offers `keys` and whose installations wait for the test. */
  function heldModels(keys: string[]) {
    const installed = new Set<string>()
    const waiting = new Map<string, () => void>()
    let page: BergamotSection | undefined
    const bergamot = bergamotStandIn([], {
      list: async () => ({ items: keys.map((key) => pair(key.split(">")[0]!, key.split(">")[1]!, { installed: installed.has(key) })) }),
      install: (src, tgt, _onProgress, signal) =>
        new Promise<void>((resolve, reject) => {
          waiting.set(`${src}>${tgt}`, () => {
            installed.add(`${src}>${tgt}`)
            resolve()
          })
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        }),
    })
    const bg = offlineBackground({ bergamot, toPages: (notice) => page?.receive(notice) })
    sendMessage.mockImplementation(async (req) => bg.respond(req as BackgroundRequest))
    const m = models()
    page = m.section
    const finish = () => {
      for (const [key, done] of [...waiting]) {
        waiting.delete(key)
        done()
      }
    }
    return { ...m, bg, waiting, installed, finish }
  }

  it("M3: downloads the common languages two at a time in the background script and reads the list after each one", async () => {
    const m = heldModels(["en>de", "de>en", "en>fr", "fr>en"])
    await m.section.load()
    m.commonButton().click()
    button(m.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await until(() => expect(m.waiting.size).toBe(2))
    await nextTask()
    expect(m.waiting.size).toBe(2)
    await until(() => {
      m.finish()
      expect(m.common.textContent).toContain(ENGLISH.t("commonAllInstalled"))
    })
    expect(m.bg.requests.filter((r) => r.type === "offlineInstall")).toHaveLength(4)
    // When the section loads, after each of the four installations (offlineDataChanged), and at the end.
    expect(m.bg.requests.filter((r) => r.type === "offlineList")).toHaveLength(6)
    expect([m.bg.contentScripts.mock.calls.length, m.bg.dataNotices()]).toEqual([1, 4])
  })

  it("M1: shows a queued pair as waiting with Cancel, never installs it, and installs the others once", async () => {
    const m = heldModels(["en>de", "de>en", "en>fr", "fr>en"])
    await m.section.load()
    m.commonButton().click()
    button(m.common.querySelector(".common-confirm")!, ENGLISH.t("buttonConfirmDownload"))!.click()
    await until(() => expect(m.waiting.size).toBe(2))
    expect([...m.waiting.keys()].sort()).toEqual(["de>en", "en>de"])
    const [toFrench, fromFrench] = [m.row("English → French"), m.row("French")]
    button(toFrench, ENGLISH.t("buttonDownload"))?.click()
    expect(toFrench.textContent).toContain(ENGLISH.t("dictQueued"))
    expect(button(toFrench, ENGLISH.t("buttonDownload"))).toBeUndefined()
    button(fromFrench, ENGLISH.t("buttonCancel"))!.click()
    expect(button(m.row("French"), ENGLISH.t("buttonDownload"))).toBeDefined()
    await until(() => {
      m.finish()
      expect(m.installed.size).toBe(3)
    })
    await until(() => expect(m.rows().filter((li) => li.textContent!.includes(ENGLISH.t("dictInstalled")))).toHaveLength(3))
    expect(m.installed.has("fr>en")).toBe(false)
    expect(m.bg.requests.filter((r) => r.type === "offlineInstall")).toHaveLength(4)
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
