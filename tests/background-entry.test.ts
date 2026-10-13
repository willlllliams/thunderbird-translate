/** Background script entry: settings, content script ports, requests from pages, shortcuts, installation and script registration. */
import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CACHE_STORAGE_KEY } from "../src/background/cache"
import { installPack } from "../src/offline/dictionary/download"
import { DictionaryStore } from "../src/offline/dictionary/store"
import { createMailContext } from "../src/shared/mail-context"
import { IDLE_TAB_STATE, type PortPush, type TranslateRequest } from "../src/shared/messages"
import { createDefaultSettings, SETTINGS_KEY, type Settings, toPublicSettings } from "../src/shared/settings"
import { localeText, stubBackgroundApi } from "./fixtures/background-api"
import { packEntry, releaseServer, tsv } from "./fixtures/dictionary"
import { asFetch, jsonResponse, useFakeTimers } from "./helpers"

beforeEach(() => useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock("../src/offline/bergamot")
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

  it("registers the message for precise mode, for a retranslation with a new analysis", async () => {
    const bg = stubBackgroundApi({ stored: stored(createDefaultSettings()) })
    vi.resetModules()
    // Spy on the module instance the background script is about to load.
    const setContext = vi.spyOn((await import("../src/background/service")).TranslationService.prototype, "setContext")
    await import("../src/background/index")
    const context = createMailContext(["Hello", "World"], [0, 1])
    bg.connect(4).send({ type: "context", context })
    expect(setContext).toHaveBeenCalledWith(context, false)
    bg.connect(4).send({ type: "context", context, bypassCache: true })
    expect(setContext).toHaveBeenLastCalledWith(context, true)
    setContext.mockRestore()
  })
})

describe("requests from pages", () => {
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

  it("counts and clears the translation cache", async () => {
    const bg = await start({ stored: { ...stored(createDefaultSettings()), [CACHE_STORAGE_KEY]: [["k1", "v1"], ["k2", "v2"]] } })
    expect(await bg.send({ type: "cacheStats" })).toEqual({ size: 2 })
    await bg.send({ type: "clearCache" })
    expect(bg.api.storage.local.remove).toHaveBeenCalledWith(CACHE_STORAGE_KEY)
    expect(await bg.send({ type: "cacheStats" })).toEqual({ size: 0 })
  })

  it("answers the messages of a locale for content scripts", async () => {
    const bg = await start({ stored: stored(createDefaultSettings()) })
    const answer = (await bg.send({ type: "getLocaleMessages", uiLanguage: "de" })) as { locale: string; messages: Record<string, string> }
    expect(answer.locale).toBe("de")
    expect(answer.messages.actionTitle).toBe(localeText("de", "actionTitle"))
    // "auto" follows Thunderbird's language.
    expect(((await bg.send({ type: "getLocaleMessages", uiLanguage: "auto" })) as { locale: string }).locale).toBe("en")
  })

  it("M1: reads the catalogs of the offline services in use when it starts and when the settings change", async () => {
    const bergamot = { catalog: vi.fn(async () => new Set(["en>de"])), signature: async () => "" }
    vi.doMock("../src/offline/bergamot", () => ({ getBergamot: () => bergamot }))
    const fetchUrl = vi.fn(async (url: string) => (url.endsWith("dict-index.json") ? jsonResponse({ version: 1, packs: [] }) : google(url)))
    const s = createDefaultSettings()
    s.tiers.dictionary = "dictionary"
    const bg = await start({ stored: stored(s), fetchUrl })
    expect(fetchUrl.mock.calls.filter(([url]) => url.endsWith("dict-index.json"))).toHaveLength(1)
    expect(bergamot.catalog).not.toHaveBeenCalled()
    s.tiers.machine = "bergamot"
    bg.storageChanged({ [SETTINGS_KEY]: { newValue: structuredClone(s) } }, "local")
    expect(bergamot.catalog).toHaveBeenCalledTimes(1)
    vi.doUnmock("../src/offline/bergamot")
  })

  it("M1: translates with the installed dictionary packs at once while the index of the release does not answer", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const EN_ZH = tsv("en", "zh-Hans", { hello: "你好", world: "世界" })
    await installPack(packEntry(EN_ZH), "dicts-v1", new DictionaryStore(), { fetchFn: asFetch(releaseServer([EN_ZH])) })
    const fetchUrl = vi.fn((url: string) => (url.endsWith("dict-index.json") ? new Promise<Response>(() => {}) : google(url)))
    const s = createDefaultSettings()
    s.tiers.dictionary = "dictionary"
    const bg = await start({ stored: stored(s), fetchUrl })
    const port = bg.connect(5)
    const dictionaryOnly = (text: string, sourceLang: string): TranslateRequest => ({ text, sourceLang, targetLang: "zh-CN", tiers: ["dictionary"] })
    port.send({ type: "translate", id: 1, request: dictionaryOnly("hello world", "en") })
    port.send({ type: "translate", id: 2, request: dictionaryOnly("Bonjour", "fr") })
    await vi.waitFor(() => expect(port.posted.filter((m) => m.type === "done")).toHaveLength(2))
    expect(port.posted).toContainEqual({ type: "tier", id: 1, tier: "dictionary", result: { ok: true, text: "你好世界" } })
    expect(port.posted).toContainEqual({ type: "tier", id: 2, tier: "dictionary", result: { ok: false, error: expect.stringContaining("fr → zh-Hans") } })
    expect(port.posted.find((m) => m.type === "tier" && m.id === 2)).not.toHaveProperty("result.missing")
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
})

describe("offline data in the background script", () => {
  const EN_ZH = tsv("en", "zh-Hans", { hello: "你好", world: "世界" })
  const JA_EN = tsv("ja", "en", { こんにちは: "hello" })
  const dictionaryOnly = (text: string): TranslateRequest => ({ text, sourceLang: "en", targetLang: "zh-CN", tiers: ["dictionary"] })

  /** The background script with the dictionary tier; the release serves EN_ZH at once and JA_EN never (a download that is still running). */
  async function withRelease() {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const server = releaseServer([EN_ZH, JA_EN])
    const fetchUrl = vi.fn((url: string, init?: RequestInit) => (url.includes("/releases/download/") ? (url.endsWith("dict-ja-en.tsv.gz") ? new Promise<Response>(() => {}) : server(url)) : google(url, init)))
    const s = createDefaultSettings()
    s.tiers.dictionary = "dictionary"
    const bg = await start({ stored: stored(s), fetchUrl })
    const port = bg.connect(5)
    let id = 0
    /** The dictionary result of a paragraph. */
    const translate = async (text: string) => {
      const request = ++id
      port.send({ type: "translate", id: request, request: dictionaryOnly(text) })
      await vi.waitFor(() => expect(port.posted).toContainEqual({ type: "done", id: request }))
      return (port.posted.find((m) => m.type === "tier" && m.id === request) as Extract<PortPush, { type: "tier" }>).result
    }
    const notices = () => ({
      contentScripts: port.posted.filter((m) => m.type === "offlineDataChanged").length,
      pages: bg.api.runtime.sendMessage.mock.calls.filter(([m]) => (m as { type?: string }).type === "offlineDataChanged").length,
    })
    return { bg, port, translate, notices }
  }

  it("translates with a pack installed while the page that asked for it is gone, also after a translation found the pack missing", async () => {
    const { bg, translate } = await withRelease()
    expect(await translate("hello world")).toMatchObject({ ok: false, error: expect.stringContaining("en → zh-Hans") })
    // The page asks for two packs and is closed: nothing more comes from it, and the second pack is still downloading.
    void bg.send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "zh-Hans" }, { src: "ja", tgt: "en" }], tag: "dicts-v1" })
    await vi.waitFor(async () => expect((await new DictionaryStore().list()).map((p) => p.id)).toEqual(["en>zh-Hans"]))
    expect(await translate("hello world")).toEqual({ ok: true, text: "你好世界" })
  })

  it("completes an installation that no page waits for, reads the packs again and tells the content scripts and the pages once", async () => {
    const { bg, translate, notices } = await withRelease()
    const { Dictionary } = await import("../src/offline/dictionary")
    const invalidate = vi.spyOn(Dictionary.prototype, "invalidate")
    void bg.send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "zh-Hans" }], tag: "dicts-v1" })
    await vi.waitFor(() => expect(notices()).toEqual({ contentScripts: 1, pages: 1 }))
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(await translate("hello")).toEqual({ ok: true, text: "你好" })
    expect(notices()).toEqual({ contentScripts: 1, pages: 1 })
  })

  it("lists the packs of the release tag the page names, and removes a pack", async () => {
    const { bg, translate, notices } = await withRelease()
    expect(await bg.send({ type: "offlineList", service: "dictionary", tag: "dicts-v1" })).toMatchObject({ ok: true, items: [{ src: "en", tgt: "zh-Hans", installed: false }, { src: "ja", tgt: "en" }] })
    expect(await bg.send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "zh-Hans" }] })).toEqual([{ ok: true }])
    expect(await translate("hello")).toEqual({ ok: true, text: "你好" })
    expect(await bg.send({ type: "offlineRemove", service: "dictionary", src: "en", tgt: "zh-Hans" })).toEqual({ ok: true })
    expect(notices()).toEqual({ contentScripts: 2, pages: 2 })
    expect(await translate("hello")).toMatchObject({ ok: false })
  })
  it("installs five packs of one request two at a time after the page is gone, leaves out a cancelled queued one, and installs a pack two pages ask for once", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const texts = [tsv("en", "de", { hello: "hallo" }), tsv("de", "en", { hallo: "hello" }), tsv("en", "fr", { hello: "bonjour" }), tsv("fr", "en", { bonjour: "hello" }), tsv("en", "ja", { hello: "こんにちは" })]
    const server = releaseServer(texts)
    /** Pack downloads wait until the test lets them go. */
    const waiting: (() => void)[] = []
    const files: string[] = []
    const fetchUrl = vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.includes("/releases/download/")) return google(url, init)
      if (!url.endsWith("dict-index.json")) {
        files.push(url.split("/").pop()!)
        await new Promise<void>((resolve) => waiting.push(resolve))
      }
      return server(url)
    })
    const s = createDefaultSettings()
    s.tiers.dictionary = "dictionary"
    const bg = await start({ stored: stored(s), fetchUrl })
    const port = bg.connect(5)
    const pair = (key: string) => ({ src: key.split(">")[0]!, tgt: key.split(">")[1]! })
    const results = bg.send({ type: "offlineInstall", service: "dictionary", pairs: ["en>de", "de>en", "en>fr", "fr>en", "en>ja"].map(pair) }) as Promise<unknown>
    // A second page asks for a pack of the first one.
    const second = bg.send({ type: "offlineInstall", service: "dictionary", pairs: [pair("en>de")] }) as Promise<unknown>
    await vi.waitFor(() => expect(files).toEqual(["dict-en-de.tsv.gz", "dict-de-en.tsv.gz"]))
    expect(await bg.send({ type: "offlineProgress" })).toMatchObject({ dictionary: { "en>de": { state: "running" }, "de>en": { state: "running" }, "en>fr": { state: "queued" }, "fr>en": { state: "queued" }, "en>ja": { state: "queued" } } })
    await bg.send({ type: "offlineCancel", service: "dictionary", src: "fr", tgt: "en" })
    // The pages that asked are gone: nothing more comes from them.
    await vi.waitFor(() => {
      waiting.splice(0).forEach((resolve) => resolve())
      expect(files).toHaveLength(4)
    })
    waiting.splice(0).forEach((resolve) => resolve())
    expect(await results).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: false, cancelled: true }, { ok: true }])
    expect(await second).toEqual([{ ok: true }])
    expect(files.sort()).toEqual(["dict-de-en.tsv.gz", "dict-en-de.tsv.gz", "dict-en-fr.tsv.gz", "dict-en-ja.tsv.gz"])
    expect((await new DictionaryStore().list()).map((p) => p.id).sort()).toEqual(["de>en", "en>de", "en>fr", "en>ja"])
    // The content scripts forget their results once, after the last pack; the pages hear of every pack.
    expect(port.posted.filter((m) => m.type === "offlineDataChanged")).toHaveLength(1)
    expect(bg.api.runtime.sendMessage.mock.calls.filter(([m]) => (m as { type?: string }).type === "offlineDataChanged")).toHaveLength(4)
    // The pages follow the progress, at most every 250 ms; the last notice has nothing left.
    await vi.advanceTimersByTimeAsync(250)
    const progress = bg.api.runtime.sendMessage.mock.calls.flatMap(([m]) => ((m as { type?: string }).type === "offlineProgressChanged" ? [(m as unknown as { progress: unknown }).progress] : []))
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.at(-1)).toEqual({ dictionary: {} })
  })
})

describe("keyboard shortcuts", () => {
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

  it("registers its five listeners while the entry module runs, before the content script and without waiting for anything", async () => {
    const bg = stubBackgroundApi({ stored: stored(createDefaultSettings()) })
    const { storage, runtime, commands } = bg.api
    const listeners = () => [storage.onChanged, runtime.onConnect, runtime.onMessage, commands.onCommand, runtime.onInstalled].map((event) => event.listeners.length)
    let atRegistration: number[] | undefined
    bg.api.messageDisplayScripts.register.mockImplementation(async () => {
      atRegistration ??= listeners()
      return { unregister: async () => {} }
    })
    // Thunderbird delivers an event that woke the background page only to listeners registered in its first run.
    vi.resetModules()
    await import("../src/background/index")
    expect(atRegistration).toEqual([1, 1, 1, 1, 1])
    expect(bg.api.messageDisplayScripts.register).toHaveBeenCalledWith({ js: [{ file: "/content.js" }], css: [{ file: "/content.css" }] })
  })
})
