/** The requests to the background script (background/router.ts): one handler per request type and the dispatch of runtime.onMessage. */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROGRESS_INTERVAL_MS } from "../src/background/offline-admin"
import { CONTENT_REQUESTS, createDispatch, createHandlers } from "../src/background/router"
import { LocalizedError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { type BackgroundRequest, IDLE_TAB_STATE, type PortPush, type RequestType } from "../src/shared/messages"
import { createDefaultSettings, type Settings, SETTINGS_KEY } from "../src/shared/settings"
import { stubBrowser } from "./fixtures/browser"
import { bergamotStandIn } from "./fixtures/offline"
import { useFakeTimers } from "./helpers"

/** Senders of runtime.onMessage: a page of the extension, and the content script in a displayed message. */
const PAGE = { url: "moz-extension://test/options.html" }
const CONTENT = { url: "imap://mail.example.com:993/fetch%3EUID%3E/INBOX%3E42", tab: { id: 4 } } as browser.runtime.MessageSender

/** The managers of the offline services. */
let bergamot = bergamotStandIn()
beforeEach(() => {
  bergamot = bergamotStandIn([], { install: vi.fn(async () => {}), remove: vi.fn(async () => {}), list: vi.fn(async () => ({ items: [] })) })
})

/** The handlers over fakes of the tab registry, the service, the dictionary, the offline managers, the cache and the extension API. */
function router(settings: Settings = createDefaultSettings()) {
  const browser = stubBrowser({ stored: { [SETTINGS_KEY]: settings } })
  const pushed: [number | "all", PortPush][] = []
  const deps = {
    tabs: {
      postToTab: (tabId: number, msg: PortPush) => void pushed.push([tabId, msg]),
      broadcast: (msg: PortPush) => void pushed.push(["all", msg]),
      stateOf: vi.fn(() => IDLE_TAB_STATE),
    },
    service: { testProvider: vi.fn(async () => "Hallo") },
    localeMessages: vi.fn(async () => ({ locale: "de" as const, messages: {} })),
    offlineManager: () => bergamot,
    offlineStatus: vi.fn(async () => ({})),
    cache: { clear: vi.fn(async () => {}), size: vi.fn(async () => 2) },
    adoptSettings: vi.fn((_stored: unknown) => {}),
  }
  const handlers = createHandlers(deps)
  const send = (req: BackgroundRequest) => createDispatch(handlers, () => Promise.resolve())(req, PAGE)
  return { handlers, send, deps, pushed, browser, stored: () => browser.local.data[SETTINGS_KEY] as Settings }
}

describe("requests from pages", () => {
  it("toggles the translation of a tab and asks it to retranslate", async () => {
    const { send, pushed } = router()
    expect(await send({ type: "toggleTab", tabId: 4 })).toBeUndefined()
    expect(await send({ type: "retranslateTab", tabId: 4 })).toBeUndefined()
    expect(pushed).toEqual([
      [4, { type: "toggle" }],
      [4, { type: "retranslate" }],
    ])
  })

  it("answers the state of a tab", async () => {
    const { send, deps } = router()
    deps.tabs.stateOf.mockReturnValue({ ...IDLE_TAB_STATE, connected: true })
    expect(await send({ type: "getTabState", tabId: 4 })).toEqual({ ...IDLE_TAB_STATE, connected: true })
    expect(deps.tabs.stateOf).toHaveBeenCalledWith(4)
  })

  it("tests a service and describes its failure in the current interface language", async () => {
    const { send, deps } = router()
    const config = { enabled: true, apiKey: "", baseURL: "", model: "" }
    expect(await send({ type: "testProvider", providerId: "google-free", config, targetLang: "de" })).toEqual({ ok: true, text: "Hallo" })
    expect(deps.service.testProvider).toHaveBeenCalledWith("google-free", config, "de")
    deps.service.testProvider.mockRejectedValueOnce(new LocalizedError("errUnknownProvider", ["nope"]))
    expect(await send({ type: "testProvider", providerId: "nope", config, targetLang: "de" })).toEqual({ ok: false, error: ENGLISH.t("errUnknownProvider", ["nope"]) })
  })

  it("answers the messages of a locale", async () => {
    const { send, deps } = router()
    expect(await send({ type: "getLocaleMessages", uiLanguage: "de" })).toEqual({ locale: "de", messages: {} })
    expect(deps.localeMessages).toHaveBeenCalledWith("de")
  })

  it("L3: tells the content scripts that dictionary packs or offline models changed, so they forget their results", async () => {
    const { send, pushed, browser } = router()
    const changes = () => pushed.filter(([to, m]) => to === "all" && m.type === "offlineDataChanged").length
    expect(await send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "en", tgt: "de" }] })).toEqual([{ ok: true }])
    expect(changes()).toBe(1)
    // Also after a failed installation: part of the files may have been stored.
    vi.mocked(bergamot.install).mockRejectedValueOnce(new Error("disk full"))
    expect(await send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "de", tgt: "en" }] })).toEqual([{ ok: false, error: "disk full" }])
    expect(await send({ type: "offlineRemove", service: "bergamot", src: "de", tgt: "en" })).toEqual({ ok: true })
    expect(changes()).toBe(3)
    expect(await send({ type: "offlineList", service: "bergamot", refresh: true })).toEqual({ ok: true, items: [] })
    expect(bergamot.list).toHaveBeenCalledWith({ refresh: true, tag: undefined })
    expect(changes()).toBe(3)
    // The extension pages hear of it too; without an open page the message goes nowhere.
    expect(browser.api.runtime.sendMessage.mock.calls).toEqual([[{ type: "offlineDataChanged" }], [{ type: "offlineDataChanged" }], [{ type: "offlineDataChanged" }]])
    browser.api.runtime.sendMessage.mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
    await send({ type: "offlineRemove", service: "bergamot", src: "en", tgt: "de" })
    expect(changes()).toBe(4)
  })

  it("answers what the offline services lack", async () => {
    const { send, deps } = router()
    const tiers: Settings["tiers"] = { dictionary: "dictionary", machine: "bergamot", ai: null }
    expect(await send({ type: "offlineStatus", sourceLang: "auto", targetLang: "zh-CN", tiers })).toEqual({})
    expect(deps.offlineStatus).toHaveBeenCalledWith("auto", "zh-CN", tiers)
  })

  it("opens the settings page at the place a content script names", async () => {
    const { send, browser } = router()
    expect(await send({ type: "openOptions", place: { section: "dictionaries", dictionaries: ["ja>en", "en>zh-Hans"], bergamot: ["ja>en"] } })).toBeUndefined()
    expect(browser.api.tabs.create).toHaveBeenCalledWith({ url: "moz-extension://test/options.html?dict=ja%3Een%2Cen%3Ezh-Hans&bergamot=ja%3Een#dictionaries" })
    await send({ type: "openOptions", place: { section: "providers", tier: "ai" } })
    expect(browser.api.tabs.create).toHaveBeenLastCalledWith({ url: "moz-extension://test/options.html?tier=ai#providers" })
  })

  it("mutes and unmutes notices about missing offline data, and answers the content script nothing", async () => {
    const s = createDefaultSettings()
    s.offlineMutedPairs = ["bergamot:de>en"]
    const { send, stored } = router(s)
    const pairs = ["dictionary:ja>zh-Hans", "bergamot:ja>zh-Hans"]
    expect(await send({ type: "muteOfflinePairs", pairs, muted: true })).toBeUndefined()
    expect(stored().offlineMutedPairs).toEqual(["bergamot:de>en", ...pairs])
    await send({ type: "muteOfflinePairs", pairs: ["bergamot:de>en", "bergamot:ja>zh-Hans"], muted: false })
    expect(stored().offlineMutedPairs).toEqual(["dictionary:ja>zh-Hans"])
  })

  it("records the online services a content script was allowed to use, takes the settings over at once, and answers nothing", async () => {
    const s = createDefaultSettings()
    s.onlineConsent = ["google-free"]
    const { handlers, deps, stored } = router(s)
    const dispatch = createDispatch(handlers, () => Promise.resolve())
    expect(await dispatch({ type: "grantConsent", ids: ["openai", "google-free", "dictionary", "nope"] }, CONTENT)).toBeUndefined()
    expect(stored().onlineConsent).toEqual(["google-free", "openai"])
    expect(deps.adoptSettings).toHaveBeenCalledWith(expect.objectContaining({ onlineConsent: ["google-free", "openai"] }))
  })

  it("counts and clears the translation cache", async () => {
    const { send, deps } = router()
    expect(await send({ type: "cacheStats" })).toEqual({ size: 2 })
    await send({ type: "clearCache" })
    expect(deps.cache.clear).toHaveBeenCalledTimes(1)
  })

  it("has one handler for each request of BackgroundApi, and no other", () => {
    // The compiler checks that this list names every request type and nothing else.
    const types = Object.keys({
      toggleTab: true,
      retranslateTab: true,
      getTabState: true,
      testProvider: true,
      clearCache: true,
      cacheStats: true,
      getLocaleMessages: true,
      openOptions: true,
      muteOfflinePairs: true,
      grantConsent: true,
      offlineStatus: true,
      offlineList: true,
      offlineInstall: true,
      offlineCancel: true,
      offlineProgress: true,
      offlineRemove: true,
      summarizeTab: true,
      testVision: true,
    } satisfies Record<RequestType, true>)
    expect(Object.keys(router().handlers).sort()).toEqual(types.sort())
  })
})

describe("dispatch", () => {
  it("ignores messages that are not requests and unknown requests", async () => {
    const dispatch = createDispatch(router().handlers, () => Promise.resolve())
    for (const message of [undefined, null, "toggleTab", { type: 1 }]) expect(dispatch(message, PAGE)).toBeUndefined()
    expect(await dispatch({ type: "somethingElse" }, PAGE)).toBeUndefined()
  })

  it("takes no notice of the background script to the pages for a request: their types differ", async () => {
    useFakeTimers()
    try {
      const { handlers, send, browser } = router()
      let finish!: () => void
      vi.mocked(bergamot.install).mockImplementationOnce(async (_src, _tgt, onProgress) => {
        onProgress?.(1, 2)
        await new Promise<void>((resolve) => (finish = resolve))
      })
      const installed = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "en", tgt: "de" }] })
      await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS)
      finish()
      await installed
      const notices = browser.api.runtime.sendMessage.mock.calls.map(([notice]) => notice as { type: string })
      expect(notices.map((n) => n.type)).toEqual(["offlineProgressChanged", "offlineDataChanged"])
      const dispatch = createDispatch(handlers, () => Promise.resolve())
      for (const notice of notices) expect(dispatch(notice, PAGE), notice.type).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("answers a content script only the requests the content script sends; the pages get every request", async () => {
    const { handlers, deps } = router()
    const dispatch = createDispatch(handlers, () => Promise.resolve())
    const requests: BackgroundRequest[] = [
      { type: "clearCache" },
      { type: "cacheStats" },
      { type: "testProvider", providerId: "google-free", config: { enabled: true, apiKey: "", baseURL: "", model: "" }, targetLang: "de" },
      { type: "offlineRemove", service: "bergamot", src: "en", tgt: "de" },
      { type: "offlineInstall", service: "bergamot", pairs: [{ src: "en", tgt: "de" }] },
      { type: "toggleTab", tabId: 9 },
      { type: "offlineStatus", sourceLang: "auto", targetLang: "de", tiers: createDefaultSettings().tiers },
    ]
    for (const sender of [CONTENT, undefined, {}, { url: "https://example.com/" }, { url: "moz-extension://other/options.html" }] as (browser.runtime.MessageSender | undefined)[]) {
      for (const req of requests) expect(dispatch(req, sender), `${req.type} from ${JSON.stringify(sender)}`).toBeUndefined()
    }
    expect([deps.cache.clear, deps.service.testProvider, bergamot.remove, bergamot.install, deps.offlineStatus].map((f) => vi.mocked(f).mock.calls.length)).toEqual([0, 0, 0, 0, 0])
    expect(await dispatch({ type: "getLocaleMessages", uiLanguage: "de" }, CONTENT)).toEqual({ locale: "de", messages: {} })
    expect(await dispatch({ type: "muteOfflinePairs", pairs: ["dictionary:ja>en"], muted: true }, CONTENT)).toBeUndefined()
    expect(deps.localeMessages).toHaveBeenCalledTimes(1)
    expect(await dispatch({ type: "cacheStats" }, PAGE)).toEqual({ size: 2 })
  })

  it("lets content scripts send exactly the request types that src/content/ sends", () => {
    const dir = join(__dirname, "..", "src", "content")
    const sent = new Set<string>()
    for (const file of readdirSync(dir)) {
      for (const [, type] of readFileSync(join(dir, file), "utf8").matchAll(/\btype: "(\w+)"/g)) if (Object.hasOwn(router().handlers, type!)) sent.add(type!)
    }
    expect([...sent].sort()).toEqual([...CONTENT_REQUESTS].sort())
    expect([...CONTENT_REQUESTS].sort()).toEqual(["getLocaleMessages", "grantConsent", "muteOfflinePairs", "openOptions"])
  })

  it("answers nothing to an unknown type, also one named after a property of every object", () => {
    const dispatch = createDispatch(router().handlers, () => Promise.resolve())
    for (const type of ["somethingElse", "toString", "constructor", "hasOwnProperty", "valueOf", "__proto__"]) expect(dispatch({ type }, PAGE)).toBeUndefined()
  })

  it("answers once the settings are read", async () => {
    const { handlers, pushed } = router()
    let settle!: () => void
    const read = new Promise<void>((resolve) => (settle = resolve))
    const dispatch = createDispatch(handlers, () => read)
    const answer = dispatch({ type: "toggleTab", tabId: 4 }, PAGE)
    await Promise.resolve()
    expect(pushed).toEqual([])
    settle()
    await answer
    expect(pushed).toEqual([[4, { type: "toggle" }]])
  })
})
