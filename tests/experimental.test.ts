/**
 * The experimental build: the column sync (src/experiments/column.ts), its background script
 * (src/experiments/background.ts) and the parent implementation of the experiment API translatedColumn
 * (src/experiments/translated-column/implementation.js), run in a sandbox with stand-ins for Thunderbird's modules.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type ColumnApi, type ColumnDeps, createColumnSync, LIST_SIZE, MAX_SUBJECTS, PUSH_DELAY_MS } from "../src/experiments/column"
import { listedMessages, SETTLE_DELAYS_MS } from "../src/shared/message-list"
import type { TranslateRequest, TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings, SETTINGS_KEY, type Settings, toPublicSettings } from "../src/shared/settings"
import { localeText, stubBackgroundApi } from "./fixtures/background-api"
import { publicSettings, tieredSettings } from "./fixtures/content"
import { fakeEvent } from "./fixtures/events"
import { fakeMail, message, messages } from "./fixtures/mail"
import { jsonResponse, nextTask, useFakeTimers } from "./helpers"

beforeEach(() => useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

const root = join(__dirname, "..")

/** A column API that records what it got; an empty translation removes the subject, as in the parent implementation. */
function columnApi() {
  const shown = new Map<string, string>()
  const api = {
    add: vi.fn(async (_name: string) => {}),
    set: vi.fn(async (entries: [string, string][]) => void entries.forEach(([s, t]) => (t ? shown.set(s, t) : shown.delete(s)))),
    clear: vi.fn(async () => shown.clear()),
    show: vi.fn(async () => 1),
  } satisfies ColumnApi
  return { api, shown }
}

type OnTier = (tier: Tier, result: TranslateResponse) => void

/** A sync over the folder `subjects` of mail tab 5; translate() answers through `answer`. */
function sync({ subjects = ["Budget"], settings = publicSettings(), answer }: { subjects?: string[]; settings?: ReturnType<typeof publicSettings>; answer?: (req: TranslateRequest, onTier: OnTier) => Promise<void> | void } = {}) {
  const { api, shown } = columnApi()
  let current = settings
  const list = { subjects }
  const translate = vi.fn(async (req: TranslateRequest, onTier: OnTier, _options: { sample: boolean }) => {
    if (answer) return answer(req, onTier)
    for (const tier of req.tiers) onTier(tier, { ok: true, text: `${tier}(${req.text})` })
  })
  const listed = vi.fn(async (_tabId: number, count: number) => list.subjects.slice(0, count).map((s, i) => message(i + 1, s)))
  const deps: ColumnDeps = {
    api,
    ready: async () => {},
    settings: () => current,
    columnName: () => "Translated subject",
    translate,
    listed,
    activeMailTabs: async () => [5],
  }
  return { sync: createColumnSync(deps), api, shown, translate, listed, list, setSettings: (s: typeof settings) => (current = s) }
}

const flush = () => vi.advanceTimersByTimeAsync(PUSH_DELAY_MS)

describe("column sync", () => {
  it("translates the listed subjects once each, without prefixes, and hands the results over together", async () => {
    const s = sync({ subjects: ["Fwd: Budget", "Budget", "Budget", "下周的会议安排", "2026-10-14"] })
    await s.sync.translateTab(5)
    expect(s.listed).toHaveBeenCalledWith(5, LIST_SIZE)
    expect(s.translate.mock.calls.map(([req, , options]) => [req.text, options])).toEqual([
      ["Budget", { sample: false }],
      ["Budget", { sample: false }],
    ])
    expect(s.api.set).not.toHaveBeenCalled()
    await flush()
    expect(s.api.set).toHaveBeenCalledTimes(1)
    expect([...s.shown]).toEqual([
      ["Fwd: Budget", "Fwd: machine(Budget)"],
      ["Budget", "machine(Budget)"],
    ])
    // Asked again: nothing new.
    await s.sync.translateTab(5)
    expect(s.translate).toHaveBeenCalledTimes(2)
  })

  it("shows the highest tier that answered, drops a lower tier after it, failures and empty texts", async () => {
    const s = sync({
      settings: tieredSettings(["dictionary", "machine", "ai"]),
      answer: (_req, onTier) => {
        onTier("dictionary", { ok: true, text: "D" })
        onTier("ai", { ok: true, text: "AI" })
        onTier("machine", { ok: true, text: "MT" })
        onTier("ai", { ok: false, error: "late failure" })
        onTier("ai", { ok: true, text: " " })
      },
    })
    await s.sync.translateTab(5)
    await flush()
    expect(s.shown.get("Budget")).toBe("AI")
  })

  it("shows an AI translation without its Markdown marks, a machine translation as it is, and again after the switch changes", async () => {
    const settings = tieredSettings(["machine", "ai"])
    const s = sync({
      subjects: ["Re: Budget", "Offer"],
      settings,
      answer: (req, onTier) => {
        if (req.text === "Budget") onTier("ai", { ok: true, text: "**Budget** [2027](https://e.com)" })
        else onTier("machine", { ok: true, text: "**MT** offer" })
      },
    })
    await s.sync.translateTab(5)
    await flush()
    expect([...s.shown]).toEqual([
      ["Re: Budget", "Re: Budget 2027"],
      ["Offer", "**MT** offer"],
    ])
    s.setSettings({ ...settings, renderMarkdown: false })
    await s.sync.settingsChanged()
    await flush()
    expect(s.shown.get("Re: Budget")).toBe("Re: **Budget** [2027](https://e.com)")
    // A mail tab translated with the switch changed meanwhile shows the results the same way, without new requests.
    s.setSettings(settings)
    await s.sync.translateTab(5)
    await flush()
    expect(s.shown.get("Re: Budget")).toBe("Re: Budget 2027")
    // Emptied once, when the column was first filled.
    expect(s.api.clear).toHaveBeenCalledTimes(1)
    expect(s.translate).toHaveBeenCalledTimes(2)
  })

  it("keeps the subjects listed last, removes the others from the column and asks again for one listed again", async () => {
    const page = (n: number) => Array.from({ length: LIST_SIZE }, (_, i) => `Subject ${n * LIST_SIZE + i}`)
    const pages = MAX_SUBJECTS / LIST_SIZE
    const s = sync()
    for (let n = 0; n < pages; n++) {
      s.list.subjects = page(n)
      await s.sync.translateTab(5)
    }
    // Listed again, the first page moves past the second.
    s.list.subjects = page(0)
    await s.sync.translateTab(5)
    s.list.subjects = page(pages)
    await s.sync.translateTab(5)
    await flush()
    expect(s.shown.size).toBe(MAX_SUBJECTS)
    expect(s.api.set.mock.lastCall![0]).toContainEqual([`Subject ${LIST_SIZE}`, ""])
    expect(s.shown.has(`Subject ${LIST_SIZE}`)).toBe(false)
    expect(s.shown.get("Subject 0")).toBe("machine(Subject 0)")
    expect(s.translate).toHaveBeenCalledTimes(MAX_SUBJECTS + LIST_SIZE)
    s.list.subjects = page(1)
    await s.sync.translateTab(5)
    expect(s.translate).toHaveBeenCalledTimes(MAX_SUBJECTS + 2 * LIST_SIZE)
  })

  it("asks again for a subject whose translation failed as a whole", async () => {
    let fail = true
    const s = sync({
      answer: async (_req, onTier) => {
        if (fail) throw new Error("service crashed")
        onTier("machine", { ok: true, text: "MT" })
      },
    })
    await s.sync.translateTab(5)
    fail = false
    await s.sync.translateTab(5)
    await flush()
    expect(s.shown.get("Budget")).toBe("MT")
  })

  it("empties the column and translates again after a change of languages, services or consent, not after another change", async () => {
    const s = sync()
    await s.sync.translateTab(5)
    await flush()
    s.setSettings(publicSettings({ mode: "translation-only" }))
    await s.sync.settingsChanged()
    expect(s.api.clear).toHaveBeenCalledTimes(1)
    s.setSettings(publicSettings({ targetLang: "fr" }))
    await s.sync.settingsChanged()
    expect(s.api.clear).toHaveBeenCalledTimes(2)
    expect(s.translate).toHaveBeenCalledTimes(2)
    s.setSettings(publicSettings({ targetLang: "fr", consent: [{ id: "google-free", host: "translate.googleapis.com" }] }))
    await s.sync.settingsChanged()
    expect(s.api.clear).toHaveBeenCalledTimes(3)
  })

  it("drops answers that arrive after the settings changed", async () => {
    const waiting: OnTier[] = []
    const s = sync({ answer: (_req, onTier) => new Promise<void>(() => waiting.push(onTier)) })
    void s.sync.translateTab(5)
    await vi.waitFor(() => expect(waiting).toHaveLength(1))
    s.setSettings(publicSettings({ targetLang: "fr" }))
    void s.sync.settingsChanged()
    await vi.waitFor(() => expect(waiting).toHaveLength(2))
    waiting[0]("machine", { ok: true, text: "old" })
    await flush()
    expect(s.shown.size).toBe(0)
  })

  it("translates a mail tab that shows another folder now and while Thunderbird fills the list", async () => {
    const s = sync({ subjects: [] })
    s.sync.folderChanged(5)
    s.sync.folderChanged(5)
    await nextTask()
    s.list.subjects = ["Budget"]
    await vi.advanceTimersByTimeAsync(SETTLE_DELAYS_MS.at(-1)!)
    expect(s.listed).toHaveBeenCalledTimes(2 + SETTLE_DELAYS_MS.length)
    expect(s.translate).toHaveBeenCalledTimes(1)
  })

  it("adds the column with its header, survives a list that cannot be read and a column that refuses translations", async () => {
    const s = sync()
    await s.sync.addColumn()
    expect(s.api.add).toHaveBeenCalledWith("Translated subject")
    s.listed.mockRejectedValueOnce(new Error("no mail tab"))
    await s.sync.translateTab(5)
    expect(s.translate).not.toHaveBeenCalled()
    s.api.set.mockRejectedValueOnce(new Error("gone"))
    await s.sync.translateActive()
    await flush()
    await flush()
    expect(s.api.set).toHaveBeenCalledTimes(1)
  })
})

describe("listedMessages", () => {
  it("reads pages up to the count and aborts the rest of the list", async () => {
    const mail = fakeMail({ folders: { Inbox: messages(250) }, pageSize: 60 })
    vi.stubGlobal("browser", mail.api)
    const first = await listedMessages(5, 100)
    expect(first.map((m) => m.id)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(mail.api.messages.abortList).toHaveBeenCalledTimes(1)
    expect(mail.open.size).toBe(0)
    const all = await listedMessages(5, 1000)
    expect(all).toHaveLength(250)
    expect(mail.api.messages.abortList).toHaveBeenCalledTimes(1)
  })

  it("aborts the list also when a page cannot be read", async () => {
    const mail = fakeMail({ folders: { Inbox: messages(250) }, pageSize: 60 })
    vi.stubGlobal("browser", mail.api)
    mail.api.messages.continueList.mockRejectedValueOnce(new Error("folder gone"))
    await expect(listedMessages(5, 100)).rejects.toThrow("folder gone")
    expect(mail.api.messages.abortList).toHaveBeenCalledTimes(1)
    expect(mail.open.size).toBe(0)
  })
})

describe("background script of the experimental build", () => {
  const google = async (_url: string, init?: RequestInit) => jsonResponse(new URLSearchParams(String(init?.body)).getAll("q").map((q) => [`G(${q})`, "en"]))

  async function start(settings: Settings) {
    const bg = stubBackgroundApi({ stored: { [SETTINGS_KEY]: structuredClone(settings) }, fetchUrl: google })
    const mail = fakeMail({ folders: { Inbox: [message(1, "Angebot für die Druckmaschine")] } })
    const { api: column, shown } = columnApi()
    const onActivated = fakeEvent<[{ tabId: number }]>()
    Object.assign(bg.api, mail.api, { translatedColumn: column })
    Object.assign(bg.api.tabs, { onActivated })
    Object.assign(mail.api.mailTabs, {
      query: vi.fn(async () => [{ id: 5, windowId: 1, active: true }]),
      get: vi.fn(async (tabId: number) => (tabId === 5 ? { id: 5 } : Promise.reject(new Error("not a mail tab")))),
    })
    Object.assign(bg.api.i18n, { detectLanguage: async () => ({ isReliable: true, languages: [{ language: "de", percentage: 99 }] }) })
    vi.resetModules()
    await import("../src/experiments/background")
    return { bg, mail, column, shown, onActivated }
  }

  const allowed = () => Object.assign(createDefaultSettings("en"), { onlineConsent: ["google-free"], targetLang: "zh-CN" })

  it("adds the column in the interface language and fills it with the subjects of the active mail tab", async () => {
    const { column, shown } = await start(allowed())
    await vi.waitFor(() => expect(column.add).toHaveBeenCalledWith(localeText("en", "columnTranslatedSubject")))
    await vi.waitFor(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DELAY_MS)
      expect(shown.get("Angebot für die Druckmaschine")).toBe("G(Angebot für die Druckmaschine)")
    })
    expect(column.show).not.toHaveBeenCalled()
  })

  it("leaves the column empty for a service that is not allowed yet", async () => {
    const { column, shown } = await start(Object.assign(createDefaultSettings("en"), { targetLang: "zh-CN" }))
    await vi.waitFor(() => expect(column.clear).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(1000)
    expect(shown.size).toBe(0)
  })

  it("follows folders, mail tabs, new mail, settings and the installation", async () => {
    const { bg, mail, column, onActivated } = await start(allowed())
    await vi.waitFor(() => expect(column.add).toHaveBeenCalledTimes(1))
    const listed = mail.api.mailTabs.getListedMessages
    await vi.waitFor(() => expect(listed).toHaveBeenCalled())
    listed.mockClear()
    mail.show("Inbox")
    await vi.waitFor(() => expect(listed).toHaveBeenCalledWith(5))
    listed.mockClear()
    onActivated.fire({ tabId: 5 })
    onActivated.fire({ tabId: 9 })
    await vi.waitFor(() => expect(listed).toHaveBeenCalledTimes(1))
    mail.api.messages.onNewMailReceived.fire({}, { id: null, messages: [] })
    await vi.waitFor(() => expect(listed).toHaveBeenCalledTimes(2))

    const s = allowed()
    s.uiLanguage = "de"
    bg.local[SETTINGS_KEY] = s
    bg.storageChanged({ [SETTINGS_KEY]: { newValue: s } }, "local")
    bg.storageChanged({ other: { newValue: 1 } }, "local")
    await vi.waitFor(() => expect(column.add).toHaveBeenLastCalledWith(localeText("de", "columnTranslatedSubject")))
    bg.install("update")
    bg.install("install")
    await vi.waitFor(() => expect(column.show).toHaveBeenCalledTimes(1))
  })

  it("logs a column that cannot be added", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const bg = stubBackgroundApi({ stored: { [SETTINGS_KEY]: allowed() }, fetchUrl: google })
    const mail = fakeMail({ folders: { Inbox: [] } })
    Object.assign(bg.api, mail.api, { translatedColumn: { ...columnApi().api, add: async () => Promise.reject(new Error("no ThreadPaneColumns")) } })
    Object.assign(bg.api.tabs, { onActivated: fakeEvent() })
    Object.assign(mail.api.mailTabs, { query: async () => [] })
    vi.resetModules()
    await import("../src/experiments/background")
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith("translatedColumn:", expect.objectContaining({ message: "no ThreadPaneColumns" })))
    bg.install("install")
    const s = allowed()
    s.uiLanguage = "fr"
    bg.storageChanged({ [SETTINGS_KEY]: { newValue: s } }, "local")
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(3))
  })
})

/** The parent implementation of the experiment in a sandbox: ThreadPaneColumns, about:3pane windows and a tab manager. */
function experiment({ modules = ["chrome://messenger/content/ThreadPaneColumns.mjs"] }: { modules?: string[] } = {}) {
  const custom = new Map<string, { id: string; textCallback: (hdr: { mime2DecodedSubject: string }) => string; [key: string]: unknown }>()
  const ThreadPaneColumns = {
    addCustomColumn: vi.fn((id: string, properties: { textCallback: (hdr: { mime2DecodedSubject: string }) => string }) => {
      if (custom.has(id)) throw new Error("id is already used")
      custom.set(id, { id, ...properties })
    }),
    removeCustomColumn: vi.fn((id: string) => void custom.delete(id)),
    refreshCustomColumn: vi.fn(),
    getCustomColumns: () => [...custom.values()].map((c) => ({ ...c })),
  }
  const observers: string[] = []
  const rows = ["Budget", "下周的会议安排"]
  const column = { id: "multiTranslateSubjectCol", hidden: true }
  const pane = {
    threadPane: { columns: [column], persistColumnStates: vi.fn(), updateColumns: vi.fn() },
    threadTree: {
      reset: vi.fn(),
      getAttribute: (name: string) => (name === "rows" ? "thread-row" : null),
      getRowAtIndex: (index: number) => (index === 0 ? { querySelector: () => ({ textContent: "on screen" }) } : null),
    },
    gDBView: {
      rowCount: rows.length,
      getMsgHdrAt: (index: number) => ({ mime2DecodedSubject: rows[index] }),
      cellDataForColumns: (index: number) => [custom.get("multiTranslateSubjectCol")!.textCallback({ mime2DecodedSubject: rows[index] })],
    },
  }
  class ExtensionError extends Error {}
  const sandbox: Record<string, unknown> = {
    ChromeUtils: {
      importESModule: (url: string) => {
        if (url.endsWith("ExtensionCommon.sys.mjs")) return { ExtensionCommon: { ExtensionAPI: class {} } }
        if (url.endsWith("ExtensionUtils.sys.mjs")) return { ExtensionUtils: { ExtensionError } }
        if (modules.includes(url)) return { ThreadPaneColumns }
        throw new Error(`no module ${url}`)
      },
    },
    Services: {
      wm: { getEnumerator: () => [{ gTabmail: { tabInfo: [{ chromeBrowser: { contentWindow: pane } }, { chromeBrowser: null }] } }, {}] },
      obs: { notifyObservers: (_subject: unknown, topic: string) => void observers.push(topic) },
    },
    console: { error: vi.fn() },
  }
  runInNewContext(readFileSync(join(root, "src", "experiments", "translated-column", "implementation.js"), "utf8"), sandbox)
  const Api = sandbox.translatedColumn as new () => { getAPI(context: unknown): { translatedColumn: Record<string, (...args: never[]) => Promise<unknown>> }; onShutdown(isAppShutdown: boolean): void }
  const instance = new Api()
  const context = { extension: { tabManager: { get: (tabId: number) => (tabId === 1 ? { nativeTab: { chromeBrowser: { contentWindow: pane } } } : undefined) } } }
  const api = instance.getAPI(context).translatedColumn as unknown as {
    add(name: string): Promise<void>
    set(entries: [string, string][]): Promise<void>
    clear(): Promise<void>
    show(): Promise<number>
    inspect(tabId: number, rows: number): Promise<unknown>
  }
  return { api, instance, ThreadPaneColumns, custom, column, pane, observers, sandbox, ExtensionError }
}

describe("experiment API translatedColumn (parent implementation)", () => {
  it("adds the column, again under a new name, and fills its rows from the translations it gets", async () => {
    const x = experiment()
    await x.api.add("Translated subject")
    await x.api.add("Übersetzter Betreff")
    expect(x.ThreadPaneColumns.removeCustomColumn).toHaveBeenCalledTimes(1)
    const added = x.custom.get("multiTranslateSubjectCol")!
    expect(added).toMatchObject({ name: "Übersetzter Betreff", hidden: false, resizable: true, sortable: false })
    expect(added.textCallback({ mime2DecodedSubject: "Budget" })).toBe("")
    await x.api.set([["Budget", "预算"]])
    expect(added.textCallback({ mime2DecodedSubject: "Budget" })).toBe("预算")
    expect(x.ThreadPaneColumns.refreshCustomColumn).toHaveBeenCalledWith("multiTranslateSubjectCol")
    await x.api.set([["下周的会议安排", "Schedule"], ["Budget", ""]])
    expect(await x.api.inspect(1, 0)).toMatchObject({ translations: 1 })
    await x.api.set([["下周的会议安排", ""], ["Budget", "预算"]])
    expect(await x.api.inspect(1, 5)).toEqual({
      registered: true,
      visible: false,
      tableView: true,
      translations: 1,
      rows: [
        { subject: "Budget", text: "预算", cell: "on screen" },
        { subject: "下周的会议安排", text: "", cell: null },
      ],
    })
    await x.api.clear()
    expect(added.textCallback({ mime2DecodedSubject: "Budget" })).toBe("")
    await expect(x.api.inspect(2, 5)).rejects.toThrow("Tab 2 shows no message list")
  })

  it("shows a hidden column in the message lists on screen, once", async () => {
    const x = experiment()
    await x.api.add("Translated subject")
    expect(await x.api.show()).toBe(1)
    expect(x.column.hidden).toBe(false)
    expect(x.pane.threadPane.persistColumnStates).toHaveBeenCalledTimes(1)
    expect(x.pane.threadTree.reset).toHaveBeenCalledTimes(1)
    expect(await x.api.show()).toBe(0)
  })

  it("removes the column when the extension shuts down, but not when Thunderbird closes", async () => {
    const x = experiment()
    await x.api.add("Translated subject")
    x.instance.onShutdown(true)
    expect(x.custom.size).toBe(1)
    x.instance.onShutdown(false)
    expect(x.custom.size).toBe(0)
    expect(x.observers).toEqual(["startupcache-invalidate"])
    // Without the column, or without the module, shutting down still ends.
    x.instance.onShutdown(false)
    const none = experiment({ modules: [] })
    none.instance.onShutdown(false)
    expect((none.sandbox.console as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled()
  })
})
