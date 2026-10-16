// @vitest-environment jsdom
/**
 * The page of translated subjects (src/subjects/index.ts): the list of the
 * mail tab page by page, the translations through the Port of the page, the
 * selection of a message, the reload after a change of folder or of its
 * messages, the consent panel and the window of its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PAGE_SIZE, RELOAD_DELAY_MS, senderName, SETTLE_DELAYS_MS } from "../src/subjects/list"
import { ENGLISH } from "../src/shared/i18n"
import { type PortReport, SUBJECTS_PORT_NAME, type TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings, type Settings, toPublicSettings } from "../src/shared/settings"
import { pagePort } from "./fixtures/browser"
import { fakeMail, type FakeMailOptions, message, messages } from "./fixtures/mail"
import { openPage, useFakeTimers } from "./helpers"

beforeEach(() => useFakeTimers())

afterEach(() => {
  vi.useRealTimers()
  history.replaceState(null, "", "/")
})

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Settings with Google Translate in the machine tier, allowed to receive message text. */
function allowed(change: (s: Settings) => void = () => {}): Settings {
  const s = createDefaultSettings("en")
  s.onlineConsent = ["google-free"]
  change(s)
  return s
}

/** The answer of a tier to a subject; null: the request stays open, for the test to answer. */
type Answer = (text: string, tier: Tier) => TranslateResponse | null

/**
 * Open the page over the folders of `mail` with `settings`; the background script answers every translation through
 * `answer` (undefined: that tier does not answer yet). `search`: the query of the page address.
 */
async function subjectsPage({
  settings = allowed(),
  search = "",
  answer = (text) => ({ ok: true, text: `T(${text})` }),
  ...mailOptions
}: Partial<FakeMailOptions> & { settings?: Settings; search?: string; answer?: Answer } & Pick<FakeMailOptions, "folders">) {
  history.replaceState(null, "", `/subjects.html${search}`)
  const port = pagePort()
  port.postMessage.mockImplementation((msg: PortReport) => {
    if (msg.type !== "translate") return
    queueMicrotask(() => {
      const results = msg.request.tiers.map((tier) => [tier, answer(msg.request.text, tier)] as const)
      if (results.some(([, result]) => result === null)) return
      for (const [tier, result] of results) port.push({ type: "tier", id: msg.id, tier, result: result! })
      port.push({ type: "done", id: msg.id })
    })
  })
  const connect = vi.fn((_info: { name: string }) => port)
  const mail = fakeMail(mailOptions)
  const page = await openPage("subjects", settings, { connect, api: mail.api })
  await vi.waitFor(() => expect(connect).toHaveBeenCalled())
  port.push({ type: "settings", settings: toPublicSettings(settings) })
  return { page, port, mail, connect }
}

const rows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("#rows tr"))
const cells = (row: HTMLTableRowElement) => Array.from(row.cells, (cell) => cell.textContent)
const translated = (row: HTMLTableRowElement) => row.querySelector<HTMLElement>(".tt-translation")
const requested = (port: ReturnType<typeof pagePort>) => port.posted("translate").map((r) => r.request.text)

describe("senderName", () => {
  it.each([
    ["Alice Walker <alice@example.com>", "Alice Walker"],
    ['"Walker, Alice" <alice@example.com>', "Walker, Alice"],
    ['"Diego López <diego@example.es>" <diego@example.es>', "Diego López <diego@example.es>"],
    ["<alice@example.com>", "alice@example.com"],
    ["alice@example.com", "alice@example.com"],
  ])("%s → %s", (author, name) => expect(senderName(author)).toBe(name))
})

describe("the list", () => {
  it("shows the first messages of the mail tab with sender, date, subject and translation, and the next ones on request", async () => {
    const { port, mail, connect } = await subjectsPage({ folders: { Inbox: messages(250) }, pageSize: 60 })
    expect(connect).toHaveBeenCalledWith({ name: SUBJECTS_PORT_NAME })
    await vi.waitFor(() => expect(rows()).toHaveLength(PAGE_SIZE))
    expect(mail.api.mailTabs.getListedMessages).toHaveBeenCalledWith(5)
    const [first] = rows()
    expect(cells(first).slice(0, 3)).toEqual(["Sender 1", new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date(Date.UTC(2026, 9, 1, 9, 1))), "Subject 1"])
    expect(first.cells[0].title).toBe("Sender 1 <s1@example.com>")
    await vi.waitFor(() => expect(translated(rows()[99])?.textContent).toBe("T(Subject 100)"))
    expect(requested(port)).toHaveLength(PAGE_SIZE)
    expect($("status").textContent).toBe(ENGLISH.t("subjectsShownMore", [100]))
    // Once every subject has its translation, the progress line goes.
    await vi.waitFor(() => expect($("progress").hidden).toBe(true))

    $("more").click()
    await vi.waitFor(() => expect(rows()).toHaveLength(200))
    // The page remembers what it translated: only the new subjects are requested.
    await vi.waitFor(() => expect(requested(port)).toHaveLength(200))
    $("more").click()
    await vi.waitFor(() => expect(rows()).toHaveLength(250))
    expect($("more").hidden).toBe(true)
    expect($("status").textContent).toBe(ENGLISH.t("subjectsShown", [250]))
    expect(mail.open.size).toBe(0)
  })

  it("aborts a list it did not read to the end when the page closes", async () => {
    const { mail } = await subjectsPage({ folders: { Inbox: messages(150) } })
    await vi.waitFor(() => expect(rows()).toHaveLength(100))
    expect(mail.open.size).toBe(1)
    dispatchEvent(new Event("pagehide"))
    expect(mail.api.messages.abortList).toHaveBeenCalledWith("list-1")
    expect(mail.open.size).toBe(0)
    expect(mail.api.mailTabs.onDisplayedFolderChanged.listeners).toHaveLength(0)
    // A page that is gone does not hear a later pagehide of the same window, which another page may cause.
    vi.stubGlobal("browser", {})
    expect(() => dispatchEvent(new Event("pagehide"))).not.toThrow()
  })

  it("translates the subject without its prefixes and leaves a subject in the target language alone", async () => {
    const { port } = await subjectsPage({
      settings: allowed((s) => (s.targetLang = "zh-CN")),
      folders: { Inbox: [message(1, "Fwd: Angebot für die Druckmaschine"), message(2, "下周的会议安排"), message(3, "2026-10-14")] },
    })
    await vi.waitFor(() => expect(translated(rows()[0])).not.toBeNull())
    expect(rows()[0].cells[3].textContent).toBe("Fwd: T(Angebot für die Druckmaschine)")
    expect(requested(port)).toEqual(["Angebot für die Druckmaschine"])
    expect([translated(rows()[1]), translated(rows()[2])]).toEqual([null, null])
  })

  it("shows a lower tier first in its provisional style and replaces it with the highest", async () => {
    const settings = allowed((s) => (s.tiers = { dictionary: "dictionary", machine: "google-free", ai: null }))
    const { port } = await subjectsPage({ settings, folders: { Inbox: [message(1, "Budget")] }, answer: () => null })
    await vi.waitFor(() => expect(port.posted("translate")).toHaveLength(1))
    const { id } = port.posted("translate")[0]
    port.push({ type: "tier", id, tier: "dictionary", result: { ok: true, text: "D(Budget)" } })
    await vi.waitFor(() => expect(translated(rows()[0])?.classList.contains("tt-provisional")).toBe(true))
    expect(translated(rows()[0])!.firstChild!.textContent).toBe("D(Budget)")
    await vi.waitFor(() => expect($("progress").textContent).toBe(ENGLISH.t("subjectsProgress", [0, 1])))
    expect($("progress").hidden).toBe(false)
    expect(translated(rows()[0])!.title).toBe("Budget")
    port.push({ type: "tier", id, tier: "machine", result: { ok: true, text: "G(Budget)" } })
    port.push({ type: "done", id })
    await vi.waitFor(() => expect(translated(rows()[0])?.classList.contains("tt-provisional")).toBe(false))
    expect(translated(rows()[0])!.textContent).toBe("G(Budget)")
    expect(translated(rows()[0])!.classList.contains("tt-only")).toBe(true)
  })

  it("says so when the active tab is no mail tab, when the folder is empty and when the list cannot be read", async () => {
    await subjectsPage({ folders: { Inbox: [] }, current: null })
    await vi.waitFor(() => expect($("status").textContent).toBe(ENGLISH.t("subjectsNoMailTab")))
    expect([$("subjects").hidden, $("openWindow").hidden]).toEqual([true, true])

    await subjectsPage({ folders: { Inbox: [] } })
    await vi.waitFor(() => expect($("status").textContent).toBe(ENGLISH.t("subjectsEmpty")))

    const { mail } = await subjectsPage({ folders: { Inbox: messages(3) } })
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    mail.api.mailTabs.getListedMessages.mockRejectedValueOnce(new Error("Invalid tab"))
    mail.show("Inbox")
    await vi.waitFor(() => expect($("status").textContent).toBe(ENGLISH.t("subjectsReadFailed", ["Invalid tab"])))
    expect(rows()).toHaveLength(0)
  })
})

describe("following the mail tab", () => {
  it("selects the message of a clicked row in the mail tab, also with the keyboard", async () => {
    const { mail } = await subjectsPage({ folders: { Inbox: messages(3) } })
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    rows()[1].click()
    await vi.waitFor(() => expect(mail.api.mailTabs.setSelectedMessages).toHaveBeenCalledWith(5, [2]))
    expect(rows().map((r) => r.getAttribute("aria-selected"))).toEqual([null, "true", null])
    rows()[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await vi.waitFor(() => expect(mail.api.mailTabs.setSelectedMessages).toHaveBeenLastCalledWith(5, [3]))
    rows()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))
    expect(mail.api.mailTabs.setSelectedMessages).toHaveBeenCalledTimes(2)
    mail.api.mailTabs.setSelectedMessages.mockRejectedValueOnce(new Error("Requested messages are not in the current view"))
    rows()[0].click()
    await vi.waitFor(() => expect($("status").textContent).toBe(ENGLISH.t("subjectsReadFailed", ["Requested messages are not in the current view"])))
  })

  it("reads the list again when its mail tab shows another folder, not for another tab", async () => {
    const { mail } = await subjectsPage({ folders: { Inbox: messages(3), Archive: messages(2, 10) } })
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    mail.show("Archive", 9)
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS)
    expect(rows()).toHaveLength(3)
    mail.show("Archive")
    await vi.waitFor(() => expect(rows().map((r) => r.cells[2].textContent)).toEqual(["Subject 10", "Subject 11"]))
    await vi.waitFor(() => expect(translated(rows()[1])?.textContent).toBe("T(Subject 11)"))
  })

  it("reads the list again after a change of folder, while Thunderbird still fills it, and draws the rows only when they changed", async () => {
    const folders: Record<string, ReturnType<typeof messages>> = { Inbox: messages(2), Archive: [] }
    const { mail, port } = await subjectsPage({ folders })
    await vi.waitFor(() => expect(rows()).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(SETTLE_DELAYS_MS.at(-1)!)
    const drawn = rows()[0]
    mail.show("Archive")
    await vi.waitFor(() => expect($("status").textContent).toBe(ENGLISH.t("subjectsEmpty")))
    // The folder is read in the meantime.
    folders.Archive = messages(3, 40)
    await vi.advanceTimersByTimeAsync(SETTLE_DELAYS_MS[0])
    await vi.waitFor(() => expect(rows().map((r) => r.cells[2].textContent)).toEqual(["Subject 40", "Subject 41", "Subject 42"]))
    const requests = requested(port).length
    const first = rows()[0]
    await vi.advanceTimersByTimeAsync(SETTLE_DELAYS_MS.at(-1)!)
    expect(mail.api.mailTabs.getListedMessages).toHaveBeenCalledTimes(SETTLE_DELAYS_MS.length * 2 + 2)
    // The same list again: the rows stay as they are, and nothing is requested.
    expect(rows()[0]).toBe(first)
    expect(requested(port)).toHaveLength(requests)
    expect(drawn.isConnected).toBe(false)
  })

  it("reads the list again once the messages stopped changing", async () => {
    const folders = { Inbox: messages(2) }
    const { mail } = await subjectsPage({ folders })
    await vi.waitFor(() => expect(rows()).toHaveLength(2))
    mail.api.mailTabs.getListedMessages.mockClear()
    folders.Inbox.push(message(3, "New mail"))
    mail.api.messages.onNewMailReceived.fire({}, { id: null, messages: [] })
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS / 2)
    mail.api.messages.onDeleted.fire({ id: null, messages: [] })
    mail.api.messages.onMoved.fire({ id: null, messages: [] }, { id: null, messages: [] })
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS - 1)
    expect(mail.api.mailTabs.getListedMessages).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    expect(mail.api.mailTabs.getListedMessages).toHaveBeenCalledTimes(1)
  })

  it("keeps as many messages as were shown when it reads the list again", async () => {
    const folders = { Inbox: messages(150) }
    const { mail } = await subjectsPage({ folders })
    await vi.waitFor(() => expect(rows()).toHaveLength(100))
    $("more").click()
    await vi.waitFor(() => expect(rows()).toHaveLength(150))
    mail.show("Inbox")
    await vi.waitFor(() => expect(mail.api.mailTabs.getListedMessages).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(rows()).toHaveLength(150))
  })

  it("drops a list that arrives after a newer one", async () => {
    const { mail } = await subjectsPage({ folders: { Inbox: messages(150), Archive: messages(2, 500) } })
    await vi.waitFor(() => expect(rows()).toHaveLength(100))
    let release!: () => void
    mail.api.mailTabs.getListedMessages.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ id: "late", messages: messages(150) }))),
    )
    mail.show("Inbox")
    mail.show("Archive")
    await vi.waitFor(() => expect(rows().map((r) => r.cells[2].textContent)).toEqual(["Subject 500", "Subject 501"]))
    release()
    await vi.waitFor(() => expect(mail.api.messages.abortList).toHaveBeenCalledWith("late"))
    expect(rows()).toHaveLength(2)
  })

  it("survives a failed Show more, a folder change while Show more reads, and an abort that fails", async () => {
    const { mail } = await subjectsPage({ folders: { Inbox: messages(250), Archive: messages(2, 500) } })
    await vi.waitFor(() => expect(rows()).toHaveLength(100))
    mail.api.messages.continueList.mockRejectedValueOnce(new Error("list gone"))
    $("more").click()
    await vi.waitFor(() => expect($("status").textContent).toBe(ENGLISH.t("subjectsReadFailed", ["list gone"])))
    expect(rows()).toHaveLength(100)
    expect($<HTMLButtonElement>("more").disabled).toBe(false)

    let release!: () => void
    mail.api.messages.continueList.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ id: "stale", messages: messages(100, 300) }))))
    $("more").click()
    mail.api.messages.abortList.mockRejectedValue(new Error("unknown list"))
    mail.show("Archive")
    await vi.waitFor(() => expect(rows().map((r) => r.cells[2].textContent)).toEqual(["Subject 500", "Subject 501"]))
    release()
    await vi.waitFor(() => expect(mail.api.messages.abortList).toHaveBeenCalledWith("stale"))
    expect(rows()).toHaveLength(2)
  })

  it("follows the mail tab of its address in a window of its own, which the popup opens", async () => {
    const popup = await subjectsPage({ folders: { Inbox: messages(2) } })
    await vi.waitFor(() => expect(rows()).toHaveLength(2))
    expect($("openWindow").hidden).toBe(false)
    $("openWindow").click()
    expect(popup.mail.api.windows.create).toHaveBeenCalledWith({ type: "popup", url: "moz-extension://test/subjects.html?tab=5", width: 960, height: 640 })
    expect(popup.page.close).toHaveBeenCalled()

    const own = await subjectsPage({ folders: { Inbox: messages(2) }, search: "?tab=8" })
    await vi.waitFor(() => expect(rows()).toHaveLength(2))
    expect(own.mail.api.mailTabs.getCurrent).not.toHaveBeenCalled()
    expect(own.mail.api.mailTabs.getListedMessages).toHaveBeenCalledWith(8)
    expect($("openWindow").hidden).toBe(true)
  })
})

describe("consent and interface language", () => {
  it("asks with the consent panel before subjects first go to an online service", async () => {
    const settings = createDefaultSettings("en")
    const { port, page } = await subjectsPage({ settings, folders: { Inbox: messages(2) } })
    await vi.waitFor(() => expect(document.querySelector(".tt-consent")).not.toBeNull())
    const panel = document.querySelector<HTMLElement>(".tt-consent")!
    expect(panel.querySelector("strong")!.textContent).toBe(ENGLISH.t("consentSubjectsTitle"))
    expect(panel.querySelector("p")!.textContent).toBe(ENGLISH.t("consentSubjectsBody"))
    expect(panel.parentElement).toBe($("list"))
    await vi.advanceTimersByTimeAsync(1000)
    expect(requested(port)).toEqual([])
    panel.querySelector<HTMLButtonElement>("button")!.click()
    await vi.waitFor(() => expect(page.sendMessage).toHaveBeenCalledWith({ type: "grantConsent", ids: ["google-free"] }))
    await vi.waitFor(() => expect(requested(port)).toEqual(["Subject 1", "Subject 2"]))
  })

  it("draws its labels and rows again in a new interface language", async () => {
    const { page } = await subjectsPage({ folders: { Inbox: messages(1) } })
    await vi.waitFor(() => expect(rows()).toHaveLength(1))
    page.external((s) => (s.targetLang = "fr"))
    expect(document.querySelector("h1")!.textContent).toBe(ENGLISH.t("subjectsTitle"))
    page.external((s) => (s.uiLanguage = "de"))
    await vi.waitFor(() => expect(document.documentElement.lang).toBe("de"))
    await vi.waitFor(() => expect(rows()[0].title).not.toBe(ENGLISH.t("tipSubjectsRow")))
    page.emitChange({ other: {} }, "local")
  })
})
