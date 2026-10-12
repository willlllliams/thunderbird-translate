// @vitest-environment jsdom
/**
 * Work that a test leaves running. shared/ext.ts reads the extension API at
 * every call, so a timer or a document listener of a page or of the
 * background script that an earlier test started would reach the fake API of
 * a later test. openPage() and stubBackgroundApi() end what they started
 * when the test finishes.
 *
 * In each group the two tests run in this order on one fake clock: the first
 * leaves work pending, the second gives that work the chance to run against a
 * new fake API.
 */
import { IDBFactory } from "fake-indexeddb"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { SAVE_DELAY_MS } from "../src/options/session"
import { REFRESH_INTERVAL_MS } from "../src/popup/timing"
import { IDLE_TAB_STATE } from "../src/shared/messages"
import { createDefaultSettings, SETTINGS_KEY } from "../src/shared/settings"
import { WELCOME_KEY } from "../src/welcome/steps"
import { stubBackgroundApi } from "./fixtures/background-api"
import { SETTLE_TURNS, settle, stubBrowser } from "./fixtures/browser"
import { openPage } from "./fixtures/pages"
import { jsonResponse, nextTask, useFakeTimers } from "./helpers"

/** What reached a new fake API: requests to the background script and writes to storage.local. */
async function reached(run: () => Promise<unknown> | void) {
  const { api, local } = stubBrowser()
  await run()
  await nextTask()
  return { requests: api.runtime.sendMessage.mock.calls, writes: local.set.mock.calls }
}

describe("a page left open by a test", { shuffle: false }, () => {
  beforeAll(() => useFakeTimers())
  afterAll(() => vi.useRealTimers())

  it("leaves the setup guide with its tour, the popup polling its tab and the settings page with an unsaved edit", async () => {
    const settings = createDefaultSettings("en")
    settings.tiers = { dictionary: "dictionary", machine: "google-free", ai: "deepseek" }
    // The tour of the tiers step listens for keys on the document; Escape closes it and saves that it was seen.
    await openPage("welcome", settings, { stored: { [WELCOME_KEY]: { step: "tiers" } } })
    await vi.waitFor(() => expect(document.querySelector(".spotlight")).not.toBeNull())
    // The popup asks for the state of its tab every REFRESH_INTERVAL_MS.
    const popup = await openPage("popup", settings, { activeTab: { id: 3 }, respond: (req) => (req.type === "getTabState" ? IDLE_TAB_STATE : undefined) })
    await vi.waitFor(() => expect(popup.sendMessage).toHaveBeenCalledWith({ type: "getTabState", tabId: 3 }))
    // The settings page saves an edit SAVE_DELAY_MS later.
    await openPage("options", settings)
    await vi.waitFor(() => expect(document.querySelector("#providerPanel h3")).not.toBeNull())
    document.querySelector<HTMLInputElement>("#autoTranslate")!.click()
  })

  it("reaches neither the extension API nor the storage of the next test", async () => {
    const after = await reached(async () => {
      await vi.advanceTimersByTimeAsync(2 * REFRESH_INTERVAL_MS + SAVE_DELAY_MS)
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    })
    expect(after).toEqual({ requests: [], writes: [] })
  })
})

describe("a page still loading when its test ends", { shuffle: false }, () => {
  beforeAll(() => useFakeTimers())
  afterAll(() => vi.useRealTimers())

  it("leaves the setup guide waiting for the model list, which arrives some turns of the event loop later", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const settings = createDefaultSettings("en")
    settings.sourceLang = "fr"
    settings.tiers = { dictionary: null, machine: "bergamot", ai: null }
    const pairs = [{ src: "fr", tgt: "en", version: "1", architecture: "base", bytes: 1, rawBytes: 1, installed: false }]
    let asked = false
    await openPage("welcome", settings, {
      stored: { [WELCOME_KEY]: { step: "offline" } },
      // Like an answer that IndexedDB requests of the background script hold up: no timer, only turns of the event loop.
      respond: (req) => (req.type === "bergamotList" ? ((asked = true), settle(SETTLE_TURNS / 2).then(() => ({ ok: true, pairs }))) : undefined),
    })
    await vi.waitFor(() => expect(asked).toBe(true))
    expect(document.querySelectorAll("#bergamotList input[type=checkbox]")).toHaveLength(0)
  })

  it("reads nothing from the extension API of the next test", async () => {
    const { api, local } = stubBrowser()
    const uiLanguage = vi.spyOn(api.i18n, "getUILanguage")
    await settle()
    expect({ requests: api.runtime.sendMessage.mock.calls, reads: local.get.mock.calls, uiLanguage: uiLanguage.mock.calls }).toEqual({ requests: [], reads: [], uiLanguage: [] })
  })
})

describe("a background script left running by a test", { shuffle: false }, () => {
  beforeAll(() => useFakeTimers())
  afterAll(() => vi.useRealTimers())

  it("leaves a translation in the cache, to be written a second later", async () => {
    const google = async (_url: string, init?: RequestInit) => jsonResponse(new URLSearchParams(String(init?.body)).getAll("q").map((q) => [`G(${q})`, "en"]))
    const bg = stubBackgroundApi({ stored: { [SETTINGS_KEY]: createDefaultSettings() }, fetchUrl: google })
    vi.resetModules()
    await import("../src/background/index")
    const port = bg.connect(4)
    port.send({ type: "translate", id: 1, request: { text: "Hello", sourceLang: "auto", targetLang: "zh-CN", tiers: ["machine"] } })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 1 }))
  })

  it("does not write into the storage of the next test", async () => {
    expect(await reached(() => vi.advanceTimersByTimeAsync(2000))).toEqual({ requests: [], writes: [] })
  })
})
