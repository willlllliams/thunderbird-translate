/** The requests to the background script (background/router.ts): one handler per request type and the dispatch of runtime.onMessage. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createDispatch, createHandlers } from "../src/background/router"
import { LocalizedError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { type BackgroundRequest, type BergamotPairInfo, IDLE_TAB_STATE, type PortPush, type RequestType } from "../src/shared/messages"
import { createDefaultSettings, type Settings, SETTINGS_KEY } from "../src/shared/settings"
import { stubBrowser } from "./fixtures/browser"

/** The offline engine of the background page, as the model requests use it. */
const engine = vi.hoisted(() => ({
  listPairs: async (_refresh?: boolean): Promise<unknown[]> => [],
  install: async (_src: string, _tgt: string, _onProgress?: unknown, _signal?: AbortSignal) => {},
  remove: async (_src: string, _tgt: string) => {},
}))
vi.mock("../src/offline/bergamot", () => ({ getBergamot: () => engine }))

beforeEach(() => {
  engine.listPairs = vi.fn(async (_refresh?: boolean) => [] as BergamotPairInfo[])
  engine.install = vi.fn(async () => {})
  engine.remove = vi.fn(async () => {})
})

/** The handlers over fakes of the tab registry, the service, the dictionary, the cache and the extension API. */
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
    dictionary: { invalidate: vi.fn() },
    offlineStatus: vi.fn(async () => ({})),
    cache: { clear: vi.fn(async () => {}), size: vi.fn(async () => 2) },
  }
  const handlers = createHandlers(deps)
  const send = (req: BackgroundRequest) => createDispatch(handlers, Promise.resolve())(req)
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

  it("reads the dictionary packs again after a change", async () => {
    const { send, deps } = router()
    expect(await send({ type: "dictionaryChanged" })).toBeUndefined()
    expect(deps.dictionary.invalidate).toHaveBeenCalledTimes(1)
  })

  it("L3: tells the content scripts that dictionary packs or offline models changed, so they forget their results", async () => {
    const { send, pushed, browser } = router()
    const changes = () => pushed.filter(([to, m]) => to === "all" && m.type === "offlineDataChanged").length
    await send({ type: "dictionaryChanged" })
    expect(changes()).toBe(1)
    // Also after a failed installation: part of the files may have been stored.
    vi.mocked(engine.install).mockRejectedValueOnce(new Error("disk full"))
    expect(await send({ type: "bergamotInstall", src: "de", tgt: "en" })).toEqual({ ok: false, error: "disk full" })
    expect(await send({ type: "bergamotRemove", src: "de", tgt: "en" })).toEqual({ ok: true })
    expect(changes()).toBe(3)
    await send({ type: "bergamotList" })
    expect(changes()).toBe(3)
    // The extension pages hear of it too; without an open page the message goes nowhere.
    expect(browser.api.runtime.sendMessage.mock.calls).toEqual([[{ type: "offlineDataChanged" }], [{ type: "offlineDataChanged" }], [{ type: "offlineDataChanged" }]])
    browser.api.runtime.sendMessage.mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
    await send({ type: "dictionaryChanged" })
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

  it("counts and clears the translation cache", async () => {
    const { send, deps } = router()
    expect(await send({ type: "cacheStats" })).toEqual({ size: 2 })
    await send({ type: "clearCache" })
    expect(deps.cache.clear).toHaveBeenCalledTimes(1)
  })

  it.each<[string, Record<string, unknown>, unknown, () => void]>([
    ["bergamotList", { refresh: true }, { ok: true, pairs: [] }, () => expect(engine.listPairs).toHaveBeenCalledWith(true)],
    ["bergamotProgress", {}, {}, () => {}],
    ["bergamotInstall", { src: "en", tgt: "de" }, { ok: true }, () => expect(engine.install).toHaveBeenCalledWith("en", "de", expect.any(Function), expect.any(AbortSignal))],
    ["bergamotCancel", { src: "en", tgt: "de" }, undefined, () => expect(engine.install).not.toHaveBeenCalled()],
    ["bergamotRemove", { src: "en", tgt: "de" }, { ok: true }, () => expect(engine.remove).toHaveBeenCalledWith("en", "de")],
  ])("hands %s to the offline engine of the background page", async (type, fields, answer, check) => {
    const { send } = router()
    expect(await send({ type, ...fields } as BackgroundRequest)).toEqual(answer)
    check()
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
      dictionaryChanged: true,
      openOptions: true,
      muteOfflinePairs: true,
      offlineStatus: true,
      bergamotList: true,
      bergamotInstall: true,
      bergamotCancel: true,
      bergamotProgress: true,
      bergamotRemove: true,
    } satisfies Record<RequestType, true>)
    expect(Object.keys(router().handlers).sort()).toEqual(types.sort())
  })
})

describe("dispatch", () => {
  it("ignores messages that are not requests and unknown requests", async () => {
    const dispatch = createDispatch(router().handlers, Promise.resolve())
    for (const message of [undefined, null, "toggleTab", { type: 1 }]) expect(dispatch(message)).toBeUndefined()
    expect(await dispatch({ type: "somethingElse" })).toBeUndefined()
  })

  it("answers nothing to an unknown type, also one named after a property of every object", () => {
    const dispatch = createDispatch(router().handlers, Promise.resolve())
    for (const type of ["somethingElse", "toString", "constructor", "hasOwnProperty", "valueOf", "__proto__"]) expect(dispatch({ type })).toBeUndefined()
  })

  it("answers once the settings are read", async () => {
    const { handlers, pushed } = router()
    let settle!: () => void
    const dispatch = createDispatch(handlers, new Promise<void>((resolve) => (settle = resolve)))
    const answer = dispatch({ type: "toggleTab", tabId: 4 })
    await Promise.resolve()
    expect(pushed).toEqual([])
    settle()
    await answer
    expect(pushed).toEqual([[4, { type: "toggle" }]])
  })
})
