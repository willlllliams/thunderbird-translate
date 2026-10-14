/** The content scripts connected to the background script, by tab (background/tabs.ts): ports, tab states, badges, messages. */
import { describe, expect, it, vi } from "vitest"
import { createTabRegistry } from "../src/background/tabs"
import { createMailContext } from "../src/shared/mail-context"
import { IDLE_TAB_STATE, SUBJECTS_PORT_NAME, type TranslateRequest, type TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings, toPublicSettings } from "../src/shared/settings"
import { backgroundPort, stubBrowser } from "./fixtures/browser"
import { localeText } from "./fixtures/locales"
import { nextTask } from "./helpers"

const request = (text: string): TranslateRequest => ({ text, sourceLang: "auto", targetLang: "zh-CN", tiers: ["machine"] })
const settings = toPublicSettings(createDefaultSettings())

/** A registry over a fake API; `translate` answers G(<text>) from the machine tier unless replaced. */
function registry({
  ready = Promise.resolve(),
  translate,
  subject = async (tabId) => `Subject of tab ${tabId}`,
}: { ready?: Promise<void>; translate?: (req: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void) => Promise<void>; subject?: (tabId: number) => Promise<string | null> } = {}) {
  const { api } = stubBrowser()
  const setContext = vi.fn()
  const translateFn = vi.fn(translate ?? (async (req: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void) => onTier("machine", { ok: true, text: `G(${req.text})` })))
  const subjectFn = vi.fn(subject)
  const tabs = createTabRegistry({ ready: () => ready, publicSettings: () => settings, setContext, translate: translateFn, subject: subjectFn })
  /** A content script of `tabId` connects; with `url`, a page of that address. */
  const connect = (tabId: number | undefined, name?: string, url?: string) => {
    const port = backgroundPort(tabId, name, url)
    tabs.connect(port as unknown as browser.runtime.Port)
    return port
  }
  return { tabs, connect, setContext, translate: translateFn, subject: subjectFn, badge: api.messageDisplayAction }
}

describe("content script ports", () => {
  it("sends the settings to a new content script and clears its badge", async () => {
    const { tabs, connect, badge } = registry()
    const port = connect(4)
    await vi.waitFor(() => expect(port.posted).toEqual([{ type: "settings", settings }]))
    expect(badge.setBadgeText).toHaveBeenCalledWith({ tabId: 4, text: "" })
    expect(tabs.stateOf(4)).toEqual({ ...IDLE_TAB_STATE, connected: true })
  })

  it("sends the settings and translates only once they are read", async () => {
    let settle!: () => void
    const { connect, translate } = registry({ ready: new Promise<void>((resolve) => (settle = resolve)) })
    const port = connect(4)
    port.send({ type: "translate", id: 1, request: request("Hello") })
    await nextTask()
    expect([port.posted, translate.mock.calls]).toEqual([[], []])
    settle()
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 1 }))
    expect(port.posted[0]).toEqual({ type: "settings", settings })
  })

  it("ends a translation that fails or whose settings cannot be read with done, and leaves no rejection unhandled", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const failing = registry({ translate: () => Promise.reject(new Error("service crashed")) })
      const port = failing.connect(4)
      port.send({ type: "translate", id: 1, request: request("Hello") })
      await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 1 }))
      const unread = registry({ ready: Promise.reject(new Error("storage unavailable")) })
      const other = unread.connect(5)
      other.send({ type: "translate", id: 2, request: request("Hello") })
      await vi.waitFor(() => expect(other.posted).toEqual([{ type: "done", id: 2 }]))
      expect(unread.translate).not.toHaveBeenCalled()
      await nextTask()
      await nextTask()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  it("ignores other ports and ports without a tab", async () => {
    const { tabs, connect } = registry()
    const other = connect(4, "something-else")
    const noTab = connect(undefined)
    await nextTask()
    expect([other.posted, noTab.posted]).toEqual([[], []])
    expect(other.onMessage.listeners).toHaveLength(0)
    expect(tabs.stateOf(4)).toEqual(IDLE_TAB_STATE)
  })

  it("ignores port messages that are not reports of a content script", async () => {
    const { tabs, connect } = registry()
    const port = connect(4)
    await vi.waitFor(() => expect(port.posted).toHaveLength(1))
    for (const message of [undefined, null, "state", {}, { type: "toggle" }, { type: 3 }]) expect(() => port.send(message as never)).not.toThrow()
    await nextTask()
    expect(port.posted).toHaveLength(1)
    expect(tabs.stateOf(4)).toEqual({ ...IDLE_TAB_STATE, connected: true })
  })

  it("keeps the state reported by the tab and shows ON on its badge while active", async () => {
    const { tabs, connect, badge } = registry()
    const port = connect(4)
    const state = { active: true, total: 3, done: 1, provisional: 1, failed: 0 }
    port.send({ type: "state", state })
    expect(tabs.stateOf(4)).toEqual({ connected: true, ...state })
    await vi.waitFor(() => expect(badge.setBadgeText).toHaveBeenLastCalledWith({ tabId: 4, text: localeText("en", "badgeOn") }))
    expect(badge.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 4, color: "#4c8bf5" })
  })

  it("redraws the badge only when the tab is switched on or off, not for every progress report", async () => {
    const { connect, badge } = registry()
    const port = connect(4)
    await vi.waitFor(() => expect(badge.setBadgeText).toHaveBeenCalledTimes(1))
    for (let done = 0; done <= 5; done++) port.send({ type: "state", state: { active: true, total: 5, done, provisional: 0, failed: 0 } })
    port.send({ type: "state", state: { active: false, total: 0, done: 0, provisional: 0, failed: 0 } })
    await vi.waitFor(() => expect(badge.setBadgeText).toHaveBeenCalledTimes(3))
    expect(badge.setBadgeText.mock.calls.map(([d]) => d.text)).toEqual(["", localeText("en", "badgeOn"), ""])
  })

  it("survives a badge of a tab that is already closed", async () => {
    const { connect, badge } = registry()
    badge.setBadgeText.mockRejectedValue(new Error("Invalid tab ID"))
    const port = connect(4)
    port.send({ type: "state", state: { active: true, total: 1, done: 0, provisional: 0, failed: 0 } })
    await vi.waitFor(() => expect(badge.setBadgeText).toHaveBeenCalledTimes(2))
    expect(badge.setBadgeBackgroundColor).not.toHaveBeenCalled()
  })

  it("draws the badges of every connected tab again", async () => {
    const { tabs, connect, badge } = registry()
    connect(1)
    connect(2).send({ type: "state", state: { active: true, total: 1, done: 1, provisional: 0, failed: 0 } })
    await vi.waitFor(() => expect(badge.setBadgeText).toHaveBeenCalledTimes(3))
    badge.setBadgeText.mockClear()
    tabs.redrawBadges()
    await vi.waitFor(() => expect(badge.setBadgeText.mock.calls.map(([d]) => [d.tabId, d.text])).toEqual([[1, ""], [2, localeText("en", "badgeOn")]]))
  })

  it("translates a paragraph: one report per tier, then done", async () => {
    const { connect } = registry()
    const port = connect(4)
    port.send({ type: "translate", id: 7, request: request("Hello") })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 7 }))
    expect(port.posted.slice(1)).toEqual([
      { type: "tier", id: 7, tier: "machine", result: { ok: true, text: "G(Hello)" } },
      { type: "done", id: 7 },
    ])
  })

  it("reports done after a failed translation, and survives a port that went away", async () => {
    const { connect, translate } = registry({
      translate: async (req, onTier) => {
        if (req.text === "Hello") onTier("machine", { ok: false, error: "Google Translate: HTTP 400" })
        else onTier("machine", { ok: true, text: "G(World)" })
      },
    })
    const port = connect(4)
    port.send({ type: "translate", id: 1, request: request("Hello") })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 1 }))
    expect(port.posted[1]).toMatchObject({ type: "tier", tier: "machine", result: { ok: false, error: expect.stringContaining("HTTP 400") } })
    port.postMessage = () => {
      throw new Error("Attempt to postMessage on disconnected port")
    }
    port.send({ type: "translate", id: 2, request: request("World") })
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2))
    await nextTask()
  })

  it("registers the message for precise mode, for a retranslation with a new analysis", () => {
    const { connect, setContext } = registry()
    const context = createMailContext(["Hello", "World"], [0, 1])
    connect(4).send({ type: "context", context })
    expect(setContext).toHaveBeenCalledWith(context, false)
    connect(4).send({ type: "context", context, bypassCache: true })
    expect(setContext).toHaveBeenLastCalledWith(context, true)
  })

  it("forgets a tab when its last content script disconnects", async () => {
    const { tabs, connect, badge } = registry()
    const [a, b] = [connect(4), connect(4)]
    b.send({ type: "state", state: { active: true, total: 1, done: 1, provisional: 0, failed: 0 } })
    a.disconnect()
    expect(tabs.stateOf(4)).toMatchObject({ connected: true, active: true })
    badge.setBadgeText.mockClear()
    b.disconnect()
    expect(tabs.stateOf(4)).toEqual(IDLE_TAB_STATE)
    expect(badge.setBadgeText).toHaveBeenCalledWith({ tabId: 4, text: "" })
  })
})

describe("messages to the content scripts", () => {
  it("sends a message to the content scripts of one tab, and to every content script", async () => {
    const { tabs, connect } = registry()
    const [a, b, other] = [connect(4), connect(4), connect(5)]
    await vi.waitFor(() => expect(other.posted).toHaveLength(1))
    tabs.postToTab(4, { type: "toggle" })
    // A tab without a content script: nothing to do.
    tabs.postToTab(9, { type: "toggle" })
    for (const port of [a, b]) expect(port.posted.at(-1)).toEqual({ type: "toggle" })
    expect(other.posted.some((m) => m.type === "toggle")).toBe(false)
    tabs.broadcast({ type: "offlineDataChanged" })
    for (const port of [a, b, other]) expect(port.posted.at(-1)).toEqual({ type: "offlineDataChanged" })
  })
})

describe("subjects", () => {
  it("answers a content script with the subject of the message in its tab", async () => {
    const { connect, subject } = registry()
    const port = connect(4)
    port.send({ type: "subject", id: 3 })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "subject", id: 3, subject: "Subject of tab 4" }))
    expect(subject).toHaveBeenCalledWith(4)
  })

  it("answers null when the subject cannot be read, and to the sample of an extension page without asking", async () => {
    const failing = registry({ subject: () => Promise.reject(new Error("no message")) })
    const port = failing.connect(4)
    port.send({ type: "subject", id: 1 })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "subject", id: 1, subject: null }))
    const { connect, subject } = registry()
    const page = connect(6, undefined, "moz-extension://test/welcome.html")
    page.send({ type: "subject", id: 2 })
    await vi.waitFor(() => expect(page.posted.at(-1)).toEqual({ type: "subject", id: 2, subject: null }))
    expect(subject).not.toHaveBeenCalled()
  })
})

describe("the page of translated subjects", () => {
  const PAGE = "moz-extension://test/subjects.html"

  it("gets the settings and translates with the consent rules of real messages, without a tab state or badge", async () => {
    const { tabs, connect, translate, badge } = registry()
    // A popup has no tab.
    const port = connect(undefined, SUBJECTS_PORT_NAME, PAGE)
    await vi.waitFor(() => expect(port.posted).toEqual([{ type: "settings", settings }]))
    port.send({ type: "translate", id: 1, request: request("Budget") })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 1 }))
    expect((translate.mock.calls[0] as unknown[])[2]).toEqual({ sample: false })
    expect(port.posted[1]).toEqual({ type: "tier", id: 1, tier: "machine", result: { ok: true, text: "G(Budget)" } })
    // Progress reports and subject requests of the page mean nothing here.
    port.send({ type: "state", state: { active: true, total: 1, done: 1, provisional: 0, failed: 0 } })
    port.send({ type: "subject", id: 2 })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "subject", id: 2, subject: null }))
    expect(tabs.stateOf(0)).toEqual(IDLE_TAB_STATE)
    expect(badge.setBadgeText).not.toHaveBeenCalled()
  })

  it("hears every broadcast until it disconnects", async () => {
    const { tabs, connect } = registry()
    const page = connect(undefined, SUBJECTS_PORT_NAME, PAGE)
    tabs.broadcast({ type: "offlineDataChanged" })
    expect(page.posted.at(-1)).toEqual({ type: "offlineDataChanged" })
    page.disconnect()
    tabs.broadcast({ type: "settings", settings })
    expect(page.posted.filter((m) => m.type === "settings")).toHaveLength(0)
  })

  it("is refused under its Port name from anything but a page of the extension", async () => {
    const { connect, translate } = registry()
    const port = connect(4, SUBJECTS_PORT_NAME, "imap://example.com/message")
    port.send({ type: "translate", id: 1, request: request("Budget") })
    await nextTask()
    expect([port.posted, translate.mock.calls, port.onMessage.listeners.length]).toEqual([[], [], 0])
  })
})
