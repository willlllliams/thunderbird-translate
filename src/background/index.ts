import { describeError } from "../shared/errors"
import { ext } from "../shared/ext"
import { ENGLISH, type I18n, loadI18n, setI18n } from "../shared/i18n"
import { fetchPackagedMessages, thunderbirdUiLanguage } from "../shared/i18n-ext"
import {
  type BackgroundRequest,
  CONTENT_PORT_NAME,
  type PortPush,
  type PortReport,
  type TabCommand,
  type LocaleMessages,
  type TabState,
} from "../shared/messages"
import { normalizeSettings, SETTINGS_KEY, type Settings, toPublicSettings } from "../shared/settings"
import { type KeyValueStorage, PersistentCache } from "./cache"
import { TranslationService } from "./service"

declare const __DEBUG__: boolean

const uiLang = thunderbirdUiLanguage()
let settings: Settings = normalizeSettings(undefined, uiLang)
/** Interface language for badge, button title and error messages. */
let i18n: I18n = ENGLISH

const storage: KeyValueStorage = {
  get: async (key) => (await ext.storage.local.get(key))[key],
  set: (key, value) => ext.storage.local.set({ [key]: value }),
  remove: (key) => ext.storage.local.remove(key),
}

const cache = new PersistentCache(storage, settings.cache.maxEntries)
const service = new TranslationService({ getSettings: () => settings, cache, i18n: () => i18n })

const settingsReady = loadSettings()

async function loadSettings(): Promise<void> {
  const stored = await storage.get(SETTINGS_KEY)
  settings = normalizeSettings(stored, uiLang)
  cache.configure(settings.cache.enabled, settings.cache.maxEntries)
  if (!stored) await storage.set(SETTINGS_KEY, settings)
  await applyUiLanguage()
}

async function applyUiLanguage(): Promise<void> {
  i18n = await loadI18n(settings.uiLanguage, uiLang, fetchPackagedMessages)
  setI18n(i18n)
  if (__DEBUG__) console.info("[thunderbird-translate] interface language", settings.uiLanguage, uiLang, "→", i18n.locale, i18n.t("actionTitle"))
  try {
    // Global title of the message header button; the manifest default follows Thunderbird only.
    await ext.messageDisplayAction.setTitle({ title: i18n.t("actionTitle") })
  } catch {
    // Not available in this Thunderbird version.
  }
  for (const tabId of tabStates.keys()) void updateBadge(tabId)
}

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) return
  const previousUiLanguage = settings.uiLanguage
  settings = normalizeSettings(changes[SETTINGS_KEY].newValue, uiLang)
  cache.configure(settings.cache.enabled, settings.cache.maxEntries)
  if (settings.uiLanguage !== previousUiLanguage) void applyUiLanguage()
  broadcast({ type: "settings", settings: toPublicSettings(settings) })
})

/* ---------- content script connections ---------- */

const ports = new Map<number, Set<browser.runtime.Port>>()
const IDLE_STATE = { active: false, total: 0, done: 0, provisional: 0, failed: 0 }
const tabStates = new Map<number, TabState>()

function broadcast(msg: PortPush): void {
  for (const set of ports.values()) for (const port of set) safePost(port, msg)
}

function safePost(port: browser.runtime.Port, msg: PortPush): boolean {
  try {
    port.postMessage(msg)
    return true
  } catch {
    return false
  }
}

function sendCommand(tabId: number, command: TabCommand): boolean {
  let delivered = false
  for (const port of ports.get(tabId) ?? []) delivered = safePost(port, { type: "command", command }) || delivered
  return delivered
}

async function updateBadge(tabId: number): Promise<void> {
  const st = tabStates.get(tabId)
  try {
    await ext.messageDisplayAction.setBadgeText({ tabId, text: st?.active ? i18n.t("badgeOn") : "" })
    if (st?.active) await ext.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#4c8bf5" })
  } catch {
    // Tab already closed.
  }
}

ext.runtime.onConnect.addListener((port) => {
  if (port.name !== CONTENT_PORT_NAME) return
  const tabId = port.sender?.tab?.id
  if (tabId === undefined) return
  if (!ports.has(tabId)) ports.set(tabId, new Set())
  ports.get(tabId)!.add(port)
  tabStates.set(tabId, { connected: true, ...IDLE_STATE })
  void updateBadge(tabId)

  port.onMessage.addListener((raw) => {
    const msg = raw as PortReport
    switch (msg?.type) {
      case "state":
        tabStates.set(tabId, { connected: true, ...msg.state })
        void updateBadge(tabId)
        break
      case "context":
        service.setContext(msg.context)
        break
      case "translate":
        void settingsReady
          .then(() => service.translateForPage(msg.request, (text) => safePost(port, { type: "provisional", id: msg.id, text })))
          .then((result) => safePost(port, { type: "result", id: msg.id, result }))
        break
    }
  })
  port.onDisconnect.addListener(() => {
    const set = ports.get(tabId)
    set?.delete(port)
    if (!set || set.size === 0) {
      ports.delete(tabId)
      tabStates.delete(tabId)
      void updateBadge(tabId)
    }
  })
  void settingsReady.then(() => safePost(port, { type: "settings", settings: toPublicSettings(settings) }))
})

/* ---------- requests from content scripts, popup and options ---------- */

async function handle(req: BackgroundRequest): Promise<unknown> {
  await settingsReady
  switch (req.type) {
    case "getPublicSettings":
      return toPublicSettings(settings)
    case "tabCommand":
      return { delivered: sendCommand(req.tabId, req.command) }
    case "getTabState":
      return tabStates.get(req.tabId) ?? { connected: false, ...IDLE_STATE }
    case "testProvider":
      try {
        return { ok: true, text: await service.testProvider(req.providerId, req.config, req.targetLang) }
      } catch (error) {
        return { ok: false, error: describeError(error, i18n) }
      }
    case "getLocaleMessages": {
      // Content scripts get their messages here instead of fetching moz-extension:// URLs.
      const loaded = await loadI18n(req.uiLanguage, uiLang, fetchPackagedMessages)
      return { locale: loaded.locale, messages: loaded.messages } satisfies LocaleMessages
    }
    case "clearCache":
      await cache.clear()
      return { ok: true }
    case "cacheStats":
      return { size: await cache.size() }
    default:
      return undefined
  }
}

ext.runtime.onMessage.addListener((message: unknown) => {
  const req = message as BackgroundRequest
  if (!req || typeof req !== "object" || typeof req.type !== "string") return undefined
  return handle(req)
})

/* ---------- keyboard shortcuts ---------- */

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
  return tab?.id
}

ext.commands.onCommand.addListener(async (command: string, tab?: browser.tabs.Tab) => {
  await settingsReady
  if (command === "toggle-translation") {
    const tabId = tab?.id ?? (await activeTabId())
    if (tabId !== undefined) sendCommand(tabId, "toggle")
  } else if (command === "toggle-display-mode") {
    const next: Settings = { ...settings, mode: settings.mode === "bilingual" ? "translation-only" : "bilingual" }
    await storage.set(SETTINGS_KEY, next)
  }
})

/* ---------- content script registration ---------- */

async function registerScripts(): Promise<void> {
  await ext.messageDisplayScripts.register({
    js: [{ file: "/content.js" }],
    css: [{ file: "/content.css" }],
  })
  if (__DEBUG__) console.info("[thunderbird-translate] message display script registered")
  // Registered scripts only reach messages opened from now on; inject into
  // messages that are already on screen (e.g. right after installation).
  const tabs = await ext.tabs.query({})
  for (const tab of tabs) {
    const type = (tab as { type?: string }).type
    if (tab.id === undefined || (type !== "mail" && type !== "messageDisplay")) continue
    try {
      await ext.tabs.insertCSS(tab.id, { file: "/content.css" })
      await ext.tabs.executeScript(tab.id, { file: "/content.js" })
    } catch {
      // No message displayed in this tab.
    }
  }
}

void registerScripts()
