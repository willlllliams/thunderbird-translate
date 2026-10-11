// @vitest-environment jsdom
/** The "Dictionaries" and "Offline models" panels of the settings and welcome pages, driven directly with a fake background script. */
import { Blob as NodeBlob } from "node:buffer"
import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DictionaryStore } from "../src/background/dictionary/store"
import type { BergamotPairInfo } from "../src/offline/bergamot"
import { describeError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest } from "../src/shared/messages"
import { gz, packEntry, releaseServer, tsv } from "./fixtures/dictionary"
import { asFetch, jsonResponse } from "./helpers"

// shared/ext reads the extension namespace when it is imported.
const sendMessage = vi.hoisted(() => {
  const fn = vi.fn<(req: unknown) => Promise<unknown>>()
  ;(globalThis as { browser?: unknown }).browser = { runtime: { sendMessage: fn } }
  return fn
})

// jsdom's Blob has no stream(), which gunzip() uses; Thunderbird's has.
vi.stubGlobal("Blob", NodeBlob)

const { BergamotSection } = await import("../src/options/bergamot")
const { DictionarySection, neededPackIds } = await import("../src/options/dictionaries")

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
  document.body.replaceChildren(list, status, needed, filter)
  const rows = () => Array.from(list.querySelectorAll("li"))
  const row = (start: string) => rows().find((li) => li.textContent!.startsWith(start))!
  return { list, status, needed, filter, rows, row }
}
const button = (li: Element, text: string) => Array.from(li.querySelectorAll("button")).find((b) => b.textContent === text)
const unknownError = describeError(undefined, ENGLISH)

beforeEach(() => {
  sendMessage.mockReset()
})
afterEach(() => vi.useRealTimers())

/* ---------- dictionaries ---------- */

const EN_DE = tsv("en", "de", { hello: "hallo" })
const FR_EN = tsv("fr", "en", { bonjour: "hello" })
const EN_JA = tsv("en", "ja", { hello: "こんにちは" })

function dictionaries(texts: string[], options: { needed?: { source: string; target: string }; fetchFn?: typeof fetch } = {}) {
  const p = panel()
  const store = new DictionaryStore(() => new IDBFactory())
  const section = new DictionarySection({
    tag: () => "dicts-v1",
    list: p.list,
    status: p.status,
    store,
    fetchFn: options.fetchFn ?? asFetch(releaseServer(texts)),
    needed: options.needed && (() => options.needed!),
  })
  return { ...p, store, section }
}

describe("dictionary panel", () => {
  it.each([
    ["auto", "zh-CN", [], ["en>zh-Hans"]],
    ["fr", "de", [], ["fr>en", "en>de"]],
    ["fr", "de", [{ src: "fr", tgt: "de" }], ["fr>de"]],
    ["de", "en", [], ["de>en"]],
    ["en", "en-GB", [], []],
    ["it", "en", [], []],
  ])("needs for %s → %s the packs %j → %j", (source, target, available, ids) => {
    expect(neededPackIds(source, target, available)).toEqual(ids)
  })

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
    expect(other.rows().map((li) => li.querySelector(".dict-name")!.textContent)).toEqual(["French (Français) → English", "English → German (Deutsch)"])
    const remove = vi.spyOn(other.store, "remove").mockRejectedValueOnce(new Error("database locked"))
    button(other.row("English"), ENGLISH.t("buttonDelete"))!.click()
    await vi.waitFor(() => expect(other.row("English").querySelector(".test-result")?.textContent).toBe("database locked"))
    requests.length = 0
    button(other.row("English"), ENGLISH.t("buttonDelete"))!.click()
    await vi.waitFor(() => expect(other.rows()).toHaveLength(1))
    expect(remove).toHaveBeenCalledTimes(2)
    expect(requests).toEqual([{ type: "dictionaryChanged" }])
  })

  it("on the welcome page lists only the needed packs, with check boxes, and downloads the picked ones", async () => {
    background({})
    const d = dictionaries([EN_DE, FR_EN, EN_JA], { needed: { source: "fr", target: "de" } })
    await d.section.load()
    expect(d.rows().map((li) => li.querySelector(".dict-name")!.textContent)).toEqual(["French (Français) → English", "English → German (Deutsch)"])
    expect(d.rows().every((li) => li.querySelector("input[type=checkbox]") && !li.querySelector("button"))).toBe(true)
    const box = d.row("English").querySelector<HTMLInputElement>("input")!
    box.checked = false
    box.dispatchEvent(new Event("change"))
    box.checked = true
    box.dispatchEvent(new Event("change"))
    const fr = d.row("French").querySelector<HTMLInputElement>("input")!
    fr.checked = false
    fr.dispatchEvent(new Event("change"))
    await d.section.downloadPicked()
    expect((await d.store.list()).map((p) => p.id)).toEqual(["en>de"])
    expect(d.row("English").querySelector("input")).toBeNull()
    expect(d.row("English").textContent).toContain(ENGLISH.t("dictInstalled"))
  })

  it("on the welcome page says when no pack covers the languages", async () => {
    const d = dictionaries([EN_DE], { needed: { source: "en", target: "ko" } })
    await d.section.load()
    expect(d.status.textContent).toBe(ENGLISH.t("dictNoneForPair"))
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

function models(languages: { source: string; target: string }, pick = false) {
  const p = panel()
  const section = new BergamotSection({ languages: () => languages, list: p.list, status: p.status, needed: p.needed, filter: pick ? undefined : p.filter, pick, pollMs: 5 })
  return { ...p, section }
}

describe("offline model panel", () => {
  it("shows why the list could not be loaded", async () => {
    background({ bergamotList: () => ({ ok: false, error: "Mozilla is unreachable" }) })
    const m = models({ source: "de", target: "en" })
    await m.section.load()
    expect(m.status.textContent).toBe("Mozilla is unreachable")

    sendMessage.mockRejectedValueOnce(new Error("Could not establish connection"))
    await m.section.load()
    expect(m.status.textContent).toBe(describeError(new Error("Could not establish connection"), ENGLISH))
    expect(m.rows()).toEqual([])
  })

  it("names the needed directions for automatic detection, and lists without them when that request fails", async () => {
    const requests = background({ bergamotList: () => ({ ok: true, pairs: [pair("en", "de")] }), bergamotRequired: () => ({ required: [["en", "de"]], missing: [] }) })
    const m = models({ source: "auto", target: "de" })
    await m.section.load()
    expect(requests).toContainEqual({ type: "bergamotRequired", src: "en", tgt: "de" })
    expect(m.needed.textContent).toBe(ENGLISH.t("bergamotNeededAuto", ["English → German (Deutsch)"]))

    background({ bergamotList: () => ({ ok: true, pairs: [pair("en", "de")] }), bergamotRequired: () => Promise.reject(new Error("gone")) })
    await m.section.load()
    expect(m.needed.textContent).toBe(ENGLISH.t("bergamotNeededAutoEnglish"))
    expect(m.rows()).toHaveLength(1)
  })

  it("names languages the interface does not list, and shows unknown tags as they are", async () => {
    background({ bergamotList: () => ({ ok: true, pairs: [pair("be", "en"), pair("en", "x!y")] }) })
    const m = models({ source: "de", target: "en" })
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
    const m = models({ source: "de", target: "en" })
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    // A failed poll counts as no progress.
    await vi.waitFor(() => expect(requests.filter((r) => r.type === "bergamotProgress").length).toBeGreaterThan(1))
    expect(m.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [0]))
    progress = () => ({ "de>en": { done: 3, total: 4 } })
    await vi.waitFor(() => expect(m.rows()[0]!.textContent).toContain(ENGLISH.t("dictDownloading", [75])))
    finish({ ok: false, error: "disk full" })
    await vi.waitFor(() => expect(m.rows()[0]!.querySelector(".test-result")?.textContent).toBe("disk full"))
    await new Promise((r) => setTimeout(r, 30))
    const polls = requests.filter((r) => r.type === "bergamotProgress").length
    await new Promise((r) => setTimeout(r, 30))
    expect(requests.filter((r) => r.type === "bergamotProgress").length).toBe(polls)
  })

  it.each([
    ["no answer", () => undefined, unknownError],
    ["a failure without text", () => ({ ok: false }), unknownError],
    ["a lost connection", () => Promise.reject(new Error("port closed")), describeError(new Error("port closed"), ENGLISH)],
  ])("describes an installation that ends with %s", async (_, answer, text) => {
    background({ bergamotList: () => ({ ok: true, pairs: [pair("de", "en")] }), bergamotInstall: answer })
    const m = models({ source: "de", target: "en" })
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonDownload"))!.click()
    await vi.waitFor(() => expect(m.rows()[0]?.querySelector(".test-result")?.textContent).toBe(text))
  })

  it("updates an installed pair", async () => {
    const requests = background({ bergamotList: () => ({ ok: true, pairs: [pair("de", "en", { installed: true, installedVersion: "2.9" })] }), bergamotInstall: () => ({ ok: true }) })
    const m = models({ source: "de", target: "en" })
    await m.section.load()
    button(m.rows()[0]!, ENGLISH.t("buttonUpdate"))!.click()
    await vi.waitFor(() => expect(requests).toContainEqual({ type: "bergamotInstall", src: "de", tgt: "en" }))
  })

  it("keeps a needed pair when the deletion is cancelled, and shows why a deletion failed", async () => {
    let removeAnswer = (): unknown => ({ ok: false, error: "locked" })
    const requests = background({
      bergamotList: () => ({ ok: true, pairs: [pair("de", "en", { installed: true }), pair("fr", "en", { installed: true })] }),
      bergamotRequired: () => ({ required: [["de", "en"]], missing: [] }),
      bergamotRemove: () => removeAnswer(),
    })
    const m = models({ source: "de", target: "en" })
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

  it("on the welcome page lists the needed directions with check boxes and downloads the picked ones", async () => {
    const requests = background({
      bergamotList: () => ({ ok: true, pairs: [pair("ja", "en"), pair("en", "zh-Hans"), pair("de", "en"), pair("en", "ko", { installed: true })] }),
      bergamotRequired: () => ({ required: [["ja", "en"], ["en", "zh-Hans"]], missing: [] }),
      bergamotInstall: () => ({ ok: true }),
    })
    const m = models({ source: "ja", target: "zh-CN" }, true)
    await m.section.load()
    expect(m.rows().map((li) => li.querySelector(".dict-name")!.textContent)).toEqual(["Japanese (日本語) → English", "English → Simplified Chinese (简体中文)"])
    expect(m.rows().every((li) => !li.querySelector("button"))).toBe(true)
    const box = m.row("English").querySelector<HTMLInputElement>("input")!
    box.checked = false
    box.dispatchEvent(new Event("change"))
    await m.section.downloadPicked()
    expect(requests.filter((r) => r.type === "bergamotInstall")).toEqual([{ type: "bergamotInstall", src: "ja", tgt: "en" }])
    box.checked = true
    box.dispatchEvent(new Event("change"))
    await m.section.downloadPicked()
    expect(requests.filter((r) => r.type === "bergamotInstall")).toHaveLength(3)
  })

  it("on the welcome page says when the languages need no model", async () => {
    background({ bergamotList: () => ({ ok: true, pairs: [pair("de", "en")] }), bergamotRequired: () => ({ required: [], missing: [] }) })
    const m = models({ source: "en", target: "en" }, true)
    await m.section.load()
    expect(m.status.textContent).toBe(ENGLISH.t("bergamotNoneNeeded"))
  })
})
