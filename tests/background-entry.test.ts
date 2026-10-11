/** Background script entry: settings, content script ports, requests from pages, shortcuts, installation and script registration. */
import { IDBFactory } from "fake-indexeddb"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CACHE_STORAGE_KEY } from "../src/background/cache"
import { createMailContext } from "../src/shared/mail-context"
import { IDLE_TAB_STATE, type PortPush, type TranslateRequest } from "../src/shared/messages"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"
import { createDefaultSettings, SETTINGS_KEY, type Settings, toPublicSettings } from "../src/shared/settings"
import { localeText, stubBackgroundApi } from "./fixtures/background-api"
import { jsonResponse } from "./helpers"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock("../src/background/bergamot-admin")
  vi.resetModules()
})

/** Google endpoint answering G(<text>). */
const google = vi.fn(async (_url: string, init?: RequestInit) => jsonResponse(new URLSearchParams(String(init?.body)).getAll("q").map((q) => [`G(${q})`, "en"])))

/** Load the background script over a fake API and wait until its settings are read. */
async function start(options: Parameters<typeof stubBackgroundApi>[0] = {}) {
  google.mockClear()
  const bg = stubBackgroundApi({ fetchUrl: google, ...options })
  vi.resetModules()
  await import("../src/background/index")
  await vi.waitFor(() => expect(bg.api.messageDisplayAction.setTitle).toHaveBeenCalled())
  return bg
}

const stored = (s: Settings) => ({ [SETTINGS_KEY]: structuredClone(s) })
const settingsWrites = (bg: Awaited<ReturnType<typeof start>>) => bg.api.storage.local.set.mock.calls.filter(([v]) => SETTINGS_KEY in v)
const request = (text: string): TranslateRequest => ({ text, sourceLang: "auto", targetLang: "zh-CN", tiers: ["machine"] })

describe("settings", () => {
  it("stores the settings of a fresh installation", async () => {
    const bg = await start()
    expect(settingsWrites(bg)).toHaveLength(1)
    expect((bg.local[SETTINGS_KEY] as Settings).tiers).toEqual(createDefaultSettings().tiers)
  })

  it("rewrites settings of 1.3 and earlier in the current form", async () => {
    const bg = await start({ stored: { [SETTINGS_KEY]: { activeProviderId: "deepseek", targetLang: "ja" } } })
    expect((bg.local[SETTINGS_KEY] as Settings).tiers).toEqual({ dictionary: null, machine: null, ai: "deepseek" })
    expect((bg.local[SETTINGS_KEY] as Settings).targetLang).toBe("ja")
  })

  it("leaves current settings alone", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    expect(settingsWrites(bg)).toHaveLength(0)
  })

  it("L10: stores current settings again when reading them migrated a copy of a built-in prompt", async () => {
    const s = createDefaultSettings()
    s.prompts.bilingual = `  ${DEFAULT_PROMPTS.bilingual}
`
    s.prompts.precise = "My own prompt for {{to}}."
    const bg = await start({ stored: stored(s) })
    await vi.waitFor(() => expect(settingsWrites(bg)).toHaveLength(1))
    expect((bg.local[SETTINGS_KEY] as Settings).prompts).toEqual({ bilingual: "", translationOnly: "", precise: "My own prompt for {{to}}." })
  })

  it("titles the header button in the interface language", async () => {
    const s = createDefaultSettings()
    s.uiLanguage = "de"
    const bg = await start({ stored: stored(s) })
    expect(bg.api.messageDisplayAction.setTitle).toHaveBeenLastCalledWith({ title: localeText("de", "actionTitle") })
  })

  it("starts when the header button cannot be titled", async () => {
    const bg = stubBackgroundApi({ stored: stored(createDefaultSettings()) })
    bg.api.messageDisplayAction.setTitle.mockRejectedValue(new Error("not supported"))
    vi.resetModules()
    await import("../src/background/index")
    expect(await bg.send({ type: "getTabState", tabId: 1 })).toEqual(IDLE_TAB_STATE)
  })

  it("serves content scripts while the header button title is still pending (Thunderbird starting with a message on screen)", async () => {
    const bg = stubBackgroundApi({ stored: stored(createDefaultSettings()) })
    bg.api.messageDisplayAction.setTitle.mockReturnValue(new Promise(() => {}))
    vi.resetModules()
    await import("../src/background/index")
    const port = bg.connect(3)
    await vi.waitFor(() => expect(port.posted).toEqual([{ type: "settings", settings: toPublicSettings(createDefaultSettings()) }]))
    expect(await bg.send({ type: "getTabState", tabId: 3 })).toMatchObject({ connected: true })
  })

  it("passes a settings change to every content script and applies a new interface language", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const [a, b] = [bg.connect(1), bg.connect(2)]
    await vi.waitFor(() => expect(b.posted).toHaveLength(1))
    bg.api.messageDisplayAction.setBadgeText.mockClear()
    const s = createDefaultSettings()
    s.targetLang = "ja"
    s.uiLanguage = "de"
    bg.storageChanged({ [SETTINGS_KEY]: { newValue: s } }, "local")
    const push: PortPush = { type: "settings", settings: toPublicSettings(s) }
    expect(a.posted.at(-1)).toEqual(push)
    expect(b.posted.at(-1)).toEqual(push)
    await vi.waitFor(() => expect(bg.api.messageDisplayAction.setTitle).toHaveBeenLastCalledWith({ title: localeText("de", "actionTitle") }))
    // The badges of the connected tabs are redrawn in the new language.
    await vi.waitFor(() => expect(bg.api.messageDisplayAction.setBadgeText.mock.calls.map(([d]) => d.tabId).sort()).toEqual([1, 2]))
  })

  it("keeps the interface language when another setting changes, and ignores other keys and areas", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(1)
    await vi.waitFor(() => expect(port.posted).toHaveLength(1))
    const titles = bg.api.messageDisplayAction.setTitle.mock.calls.length
    bg.storageChanged({ [SETTINGS_KEY]: { newValue: createDefaultSettings() } }, "sync")
    bg.storageChanged({ other: { newValue: 1 } }, "local")
    expect(port.posted).toHaveLength(1)
    const s = createDefaultSettings()
    s.targetLang = "fr"
    bg.storageChanged({ [SETTINGS_KEY]: { newValue: s } }, "local")
    expect(port.posted).toHaveLength(2)
    await Promise.resolve()
    expect(bg.api.messageDisplayAction.setTitle).toHaveBeenCalledTimes(titles)
  })

  it("applies the cache setting of a change", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(1)
    const translate = async (id: number) => {
      port.send({ type: "translate", id, request: request("Hello") })
      await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id }))
    }
    await translate(1)
    await translate(2)
    expect(google).toHaveBeenCalledTimes(1)
    const s = createDefaultSettings()
    s.cache.enabled = false
    bg.storageChanged({ [SETTINGS_KEY]: { newValue: s } }, "local")
    await translate(3)
    expect(google).toHaveBeenCalledTimes(2)
  })
})

describe("content script ports", () => {
  it("sends the settings to a new content script and clears its badge", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(4)
    await vi.waitFor(() => expect(port.posted).toEqual([{ type: "settings", settings: toPublicSettings(createDefaultSettings()) }]))
    expect(bg.api.messageDisplayAction.setBadgeText).toHaveBeenCalledWith({ tabId: 4, text: "" })
    expect(await bg.send({ type: "getTabState", tabId: 4 })).toEqual({ ...IDLE_TAB_STATE, connected: true })
  })

  it("ignores other ports and ports without a tab", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const other = bg.connect(4, "something-else")
    const noTab = bg.connect(undefined)
    await new Promise((r) => setTimeout(r, 10))
    expect([other.posted, noTab.posted]).toEqual([[], []])
    expect(other.onMessage.listeners).toHaveLength(0)
    expect(await bg.send({ type: "getTabState", tabId: 4 })).toEqual(IDLE_TAB_STATE)
  })

  it("keeps the state reported by the tab and shows ON on its badge while active", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(4)
    const state = { active: true, total: 3, done: 1, provisional: 1, failed: 0 }
    port.send({ type: "state", state })
    expect(await bg.send({ type: "getTabState", tabId: 4 })).toEqual({ connected: true, ...state })
    await vi.waitFor(() => expect(bg.api.messageDisplayAction.setBadgeText).toHaveBeenLastCalledWith({ tabId: 4, text: localeText("en", "badgeOn") }))
    expect(bg.api.messageDisplayAction.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 4, color: "#4c8bf5" })
  })

  it("redraws the badge only when the tab is switched on or off, not for every progress report", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(4)
    await vi.waitFor(() => expect(bg.api.messageDisplayAction.setBadgeText).toHaveBeenCalledTimes(1))
    for (let done = 0; done <= 5; done++) port.send({ type: "state", state: { active: true, total: 5, done, provisional: 0, failed: 0 } })
    port.send({ type: "state", state: { active: false, total: 0, done: 0, provisional: 0, failed: 0 } })
    await vi.waitFor(() => expect(bg.api.messageDisplayAction.setBadgeText).toHaveBeenCalledTimes(3))
    expect(bg.api.messageDisplayAction.setBadgeText.mock.calls.map(([d]) => d.text)).toEqual(["", localeText("en", "badgeOn"), ""])
  })

  it("survives a badge of a tab that is already closed", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    bg.api.messageDisplayAction.setBadgeText.mockRejectedValue(new Error("Invalid tab ID"))
    const port = bg.connect(4)
    port.send({ type: "state", state: { active: true, total: 1, done: 0, provisional: 0, failed: 0 } })
    await vi.waitFor(() => expect(bg.api.messageDisplayAction.setBadgeText).toHaveBeenCalledTimes(2))
    expect(bg.api.messageDisplayAction.setBadgeBackgroundColor).not.toHaveBeenCalled()
  })

  it("translates a paragraph: one report per tier, then done", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(4)
    port.send({ type: "translate", id: 7, request: request("Hello") })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 7 }))
    expect(port.posted.slice(1)).toEqual([
      { type: "tier", id: 7, tier: "machine", result: { ok: true, text: "G(Hello)" } },
      { type: "done", id: 7 },
    ])
  })

  it("reports done after a failed translation, and survives a port that went away", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    google.mockResolvedValueOnce(new Response("{}", { status: 400 }))
    const port = bg.connect(4)
    port.send({ type: "translate", id: 1, request: request("Hello") })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 1 }))
    expect(port.posted[1]).toMatchObject({ type: "tier", tier: "machine", result: { ok: false, error: expect.stringContaining("HTTP 400") } })
    port.postMessage = () => {
      throw new Error("Attempt to postMessage on disconnected port")
    }
    port.send({ type: "translate", id: 2, request: request("World") })
    await vi.waitFor(() => expect(google).toHaveBeenCalledTimes(2))
  })

  it("registers the message for precise mode", async () => {
    const bg = stubBackgroundApi({ stored: stored(createDefaultSettings()) })
    vi.resetModules()
    // Spy on the module instance the background script is about to load.
    const setContext = vi.spyOn((await import("../src/background/service")).TranslationService.prototype, "setContext")
    await import("../src/background/index")
    const context = createMailContext(["Hello", "World"], [0, 1])
    bg.connect(4).send({ type: "context", context })
    expect(setContext).toHaveBeenCalledWith(context)
    setContext.mockRestore()
  })

  it("forgets a tab when its last content script disconnects", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const [a, b] = [bg.connect(4), bg.connect(4)]
    b.send({ type: "state", state: { active: true, total: 1, done: 1, provisional: 0, failed: 0 } })
    a.disconnect()
    expect(await bg.send({ type: "getTabState", tabId: 4 })).toMatchObject({ connected: true, active: true })
    bg.api.messageDisplayAction.setBadgeText.mockClear()
    b.disconnect()
    expect(await bg.send({ type: "getTabState", tabId: 4 })).toEqual(IDLE_TAB_STATE)
    expect(bg.api.messageDisplayAction.setBadgeText).toHaveBeenCalledWith({ tabId: 4, text: "" })
  })
})

describe("requests from pages", () => {
  it("toggles the translation of a tab", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const [a, b, other] = [bg.connect(4), bg.connect(4), bg.connect(5)]
    expect(await bg.send({ type: "toggleTab", tabId: 4 })).toBeUndefined()
    for (const port of [a, b]) expect(port.posted.at(-1)).toEqual({ type: "toggle" })
    expect(other.posted.some((m) => m.type === "toggle")).toBe(false)
    // A tab without a content script: nothing to do.
    expect(await bg.send({ type: "toggleTab", tabId: 9 })).toBeUndefined()
  })

  it("tests a service and describes its failure", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const config = { enabled: true, apiKey: "", baseURL: "", model: "" }
    expect(await bg.send({ type: "testProvider", providerId: "google-free", config, targetLang: "zh-CN" })).toEqual({
      ok: true,
      text: "G(Hello! This is a connection test from Thunderbird Translate.)",
    })
    const failed = (await bg.send({ type: "testProvider", providerId: "openai", config, targetLang: "zh-CN" })) as { ok: boolean; error: string }
    expect(failed.ok).toBe(false)
    expect(failed.error).toMatch(/API key/)
  })

  it("describes a failed test in the interface language", async () => {
    const s = createDefaultSettings()
    s.uiLanguage = "de"
    const bg = await start({ stored: stored(s) })
    const failed = (await bg.send({ type: "testProvider", providerId: "nope", config: { enabled: true, apiKey: "", baseURL: "", model: "" }, targetLang: "zh-CN" })) as {
      error: string
    }
    expect(failed.error).toBe(localeText("de", "errUnknownProvider").replace("$1", "nope"))
  })

  it("answers the messages of a locale for content scripts", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const answer = (await bg.send({ type: "getLocaleMessages", uiLanguage: "de" })) as { locale: string; messages: Record<string, string> }
    expect(answer.locale).toBe("de")
    expect(answer.messages.actionTitle).toBe(localeText("de", "actionTitle"))
    // "auto" follows Thunderbird's language.
    expect(((await bg.send({ type: "getLocaleMessages", uiLanguage: "auto" })) as { locale: string }).locale).toBe("en")
  })

  it("L6: reads the messages of a locale again after a failed read instead of keeping English", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const read = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementationOnce(async () => Promise.reject(new TypeError("file busy")))
    expect(((await bg.send({ type: "getLocaleMessages", uiLanguage: "fr" })) as { locale: string }).locale).toBe("en")
    vi.mocked(fetch).mockImplementation(read)
    const answer = (await bg.send({ type: "getLocaleMessages", uiLanguage: "fr" })) as { locale: string; messages: Record<string, string> }
    expect(answer.locale).toBe("fr")
    expect(answer.messages.actionTitle).toBe(localeText("fr", "actionTitle"))
  })

  it("reads and compiles the messages of a locale once, however many messages are displayed", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const reads = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/_locales/fr/messages.json")).length
    const answers = await Promise.all([1, 2, 3].map(() => bg.send({ type: "getLocaleMessages", uiLanguage: "fr" })))
    await bg.send({ type: "getLocaleMessages", uiLanguage: "fr" })
    expect(reads()).toBe(1)
    expect(answers[0]).toEqual(answers[2])
    expect((answers[0] as { messages: Record<string, string> }).messages.actionTitle).toBe(localeText("fr", "actionTitle"))
  })

  it("reads the dictionary packs again after a change", async () => {
    const bg = stubBackgroundApi({ stored: stored(createDefaultSettings()) })
    vi.resetModules()
    const invalidate = vi.spyOn((await import("../src/background/dictionary")).Dictionary.prototype, "invalidate")
    await import("../src/background/index")
    expect(await bg.send({ type: "dictionaryChanged" })).toBeUndefined()
    expect(invalidate).toHaveBeenCalledTimes(1)
    invalidate.mockRestore()
  })

  it("L3: tells the content scripts that dictionary packs or offline models changed, so they forget their results", async () => {
    const handleBergamot = vi.fn(async (req: { type: string }) => ({ ok: true, handled: req.type }))
    vi.doMock("../src/background/bergamot-admin", () => ({ handleBergamot }))
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(4)
    const changes = () => port.posted.filter((m) => m.type === "dataChanged").length
    await bg.send({ type: "dictionaryChanged" })
    expect(changes()).toBe(1)
    await bg.send({ type: "bergamotInstall", src: "de", tgt: "en" })
    await bg.send({ type: "bergamotRemove", src: "de", tgt: "en" })
    expect(changes()).toBe(3)
    await bg.send({ type: "bergamotList" })
    expect(changes()).toBe(3)
    // The extension pages hear of it too; without an open page the message goes nowhere.
    expect(bg.api.runtime.sendMessage.mock.calls).toEqual([[{ type: "offlineDataChanged" }], [{ type: "offlineDataChanged" }], [{ type: "offlineDataChanged" }]])
    bg.api.runtime.sendMessage.mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
    await bg.send({ type: "dictionaryChanged" })
    expect(changes()).toBe(4)
  })

  it("opens the settings page at the place a content script names", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    expect(await bg.send({ type: "openOptions", place: { section: "dictionaries", dictionaries: ["ja>en", "en>zh-Hans"], bergamot: ["ja>en"] } })).toBeUndefined()
    expect(bg.api.tabs.create).toHaveBeenCalledWith({ url: "moz-extension://test/options.html?dict=ja%3Een%2Cen%3Ezh-Hans&bergamot=ja%3Een#dictionaries" })
    await bg.send({ type: "openOptions", place: { section: "providers", tier: "ai" } })
    expect(bg.api.tabs.create).toHaveBeenLastCalledWith({ url: "moz-extension://test/options.html?tier=ai#providers" })
  })

  it("mutes and unmutes notices about missing offline data, and answers the content script nothing", async () => {
    const s = createDefaultSettings()
    s.offlineMutedPairs = ["bergamot:de>en"]
    const bg = await start({ stored: stored(s) })
    const pairs = ["dictionary:ja>zh-Hans", "bergamot:ja>zh-Hans"]
    expect(await bg.send({ type: "muteOfflinePairs", pairs, muted: true })).toBeUndefined()
    expect((bg.local[SETTINGS_KEY] as Settings).offlineMutedPairs).toEqual(["bergamot:de>en", ...pairs])
    await bg.send({ type: "muteOfflinePairs", pairs: ["bergamot:de>en", "bergamot:ja>zh-Hans"], muted: false })
    expect((bg.local[SETTINGS_KEY] as Settings).offlineMutedPairs).toEqual(["dictionary:ja>zh-Hans"])
  })

  it("says what the offline services of the tiers lack for the languages, reading the dictionary index once", async () => {
    const bergamot = { catalog: vi.fn(async () => new Set(["en>zh-Hans", "ja>en"])), installedKeys: vi.fn(async () => new Set(["en>zh-Hans"])), signature: async () => "" }
    vi.doMock("../src/offline/bergamot", () => ({ getBergamot: () => bergamot, requiredPairs: () => [] }))
    vi.stubGlobal("indexedDB", new IDBFactory())
    let indexAnswer = (): Promise<Response> => Promise.reject(new TypeError("NetworkError"))
    const fetchUrl = vi.fn(async (url: string) => (url.endsWith("dict-index.json") ? indexAnswer() : google(url)))
    const bg = await start({ stored: stored(createDefaultSettings()), fetchUrl })
    const tiers: Settings["tiers"] = { dictionary: "dictionary", machine: "bergamot", ai: null }
    const ask = (sourceLang: string, targetLang: string, t = tiers) => bg.send({ type: "offlineStatus", sourceLang, targetLang, tiers: t })
    // Without the index every pack counts as offered.
    expect(await ask("auto", "zh-CN")).toEqual({
      dictionary: { required: ["en>zh-Hans"], missing: ["en>zh-Hans"], unsupported: false },
      bergamot: { required: ["en>zh-Hans"], missing: [], unsupported: false },
    })
    indexAnswer = async () => jsonResponse({ version: 1, packs: [] })
    expect(await ask("ja", "zh-CN")).toEqual({
      dictionary: { required: [], missing: [], unsupported: true },
      bergamot: { required: ["ja>en", "en>zh-Hans"], missing: ["ja>en"], unsupported: false },
    })
    await ask("de", "en")
    expect(fetchUrl.mock.calls.filter(([url]) => url.endsWith("dict-index.json"))).toHaveLength(2)
    expect(await ask("auto", "zh-CN", { dictionary: null, machine: "google-free", ai: null })).toEqual({})
    vi.doUnmock("../src/offline/bergamot")
  })

  it("L4: names the source language for the dictionary with the thresholds of the offline translator", async () => {
    const s = createDefaultSettings()
    s.tiers.dictionary = "dictionary"
    const bg = stubBackgroundApi({ stored: stored(s) })
    vi.stubGlobal("indexedDB", new IDBFactory())
    // A reliable answer that covers less than 60 % of the text is a guess.
    Object.assign(bg.api.i18n, { detectLanguage: vi.fn(async () => ({ isReliable: true, languages: [{ language: "fr", percentage: 45 }] })) })
    vi.resetModules()
    await import("../src/background/index")
    const port = bg.connect(4)
    port.send({ type: "translate", id: 1, request: { ...request("Bonjour tout le monde, merci pour votre message"), tiers: ["dictionary"] } })
    await vi.waitFor(() => expect(port.posted.at(-1)).toEqual({ type: "done", id: 1 }))
    expect(port.posted[1]).toMatchObject({ type: "tier", tier: "dictionary", result: { ok: false, error: expect.stringContaining("en → zh-Hans") } })
  })

  it("counts and clears the translation cache", async () => {
    const bg = await start({ stored: { ...stored(createDefaultSettings()), [CACHE_STORAGE_KEY]: [["k1", "v1"], ["k2", "v2"]] } })
    expect(await bg.send({ type: "cacheStats" })).toEqual({ size: 2 })
    await bg.send({ type: "clearCache" })
    expect(bg.api.storage.local.remove).toHaveBeenCalledWith(CACHE_STORAGE_KEY)
    expect(await bg.send({ type: "cacheStats" })).toEqual({ size: 0 })
  })

  it.each(["bergamotList", "bergamotProgress", "bergamotInstall", "bergamotCancel", "bergamotRemove"])("hands %s to the offline model manager", async (type) => {
    const handleBergamot = vi.fn(async (req: { type: string }) => ({ handled: req.type }))
    vi.doMock("../src/background/bergamot-admin", () => ({ handleBergamot }))
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const req = { type, src: "en", tgt: "de" }
    expect(await bg.send(req)).toEqual({ handled: type })
    expect(handleBergamot).toHaveBeenCalledWith(req)
  })

  it("ignores messages that are not requests and unknown requests", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    for (const message of [undefined, null, "toggleTab", { type: 1 }]) expect(bg.send(message)).toBeUndefined()
    expect(await bg.send({ type: "somethingElse" })).toBeUndefined()
  })
})

describe("keyboard shortcuts", () => {
  it("toggles the translation of the tab of the shortcut, else of the active tab", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()), activeTabs: [{ id: 5 }] })
    const [four, five] = [bg.connect(4), bg.connect(5)]
    await bg.command("toggle-translation", { id: 4 })
    expect(four.posted.at(-1)).toEqual({ type: "toggle" })
    expect(five.posted.some((m) => m.type === "toggle")).toBe(false)
    await bg.command("toggle-translation")
    expect(bg.api.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true })
    expect(five.posted.at(-1)).toEqual({ type: "toggle" })
  })

  it("does nothing without an active tab", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(4)
    await bg.command("toggle-translation")
    await bg.command("unknown-command", { id: 4 })
    expect(port.posted.some((m) => m.type === "toggle")).toBe(false)
  })

  it("switches the display mode back and forth and tells the content scripts", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const port = bg.connect(4)
    const mode = () => (bg.local[SETTINGS_KEY] as Settings).mode
    expect(mode()).toBe("bilingual")
    await bg.command("toggle-display-mode")
    expect(mode()).toBe("translation-only")
    expect(port.posted.at(-1)).toMatchObject({ type: "settings", settings: { mode: "translation-only" } })
    await bg.command("toggle-display-mode")
    expect(mode()).toBe("bilingual")
  })
})

describe("installation and content scripts", () => {
  it("opens the welcome page after a new installation only", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    bg.install("update")
    expect(bg.api.tabs.create).not.toHaveBeenCalled()
    bg.install("install")
    expect(bg.api.tabs.create).toHaveBeenCalledWith({ url: "moz-extension://test/welcome.html" })
  })

  it("registers the content script and injects it into the messages already on screen", async () => {
    const bg = stubBackgroundApi({
      stored: stored(createDefaultSettings()),
      tabs: [{ id: 1, type: "mail" }, { id: 2, type: "messageDisplay" }, { id: 3, type: "content" }, { type: "mail" }, { id: 4, type: "mail" }, { id: 5, type: "mail" }],
    })
    bg.api.tabs.insertCSS.mockImplementation(async (tabId: number) => {
      if (tabId === 4) throw new Error("No message displayed")
    })
    vi.resetModules()
    await import("../src/background/index")
    await vi.waitFor(() => expect(bg.api.tabs.executeScript.mock.calls.map(([id]) => id)).toEqual([1, 2, 5]))
    expect(bg.api.messageDisplayScripts.register).toHaveBeenCalledWith({ js: [{ file: "/content.js" }], css: [{ file: "/content.css" }] })
    expect(bg.api.tabs.insertCSS.mock.calls.map(([id, details]) => [id, details])).toEqual([1, 2, 4, 5].map((id) => [id, { file: "/content.css" }]))
    expect(bg.api.tabs.executeScript).toHaveBeenCalledWith(1, { file: "/content.js" })
  })
})
