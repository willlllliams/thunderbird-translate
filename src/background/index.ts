import { describeError } from "../shared/errors"
import { ext } from "../shared/ext"
import { getI18n, loadI18n, t } from "../shared/i18n"
import { fetchPackagedMessages, loadExtensionI18n, thunderbirdUiLanguage } from "../shared/i18n-ext"
import {
  type BackgroundRequest,
  CONTENT_PORT_NAME,
  IDLE_TAB_STATE,
  type LocaleMessages,
  type OfflineStatus,
  optionsPath,
  type PageNotice,
  type PortPush,
  type PortReport,
  type TabState,
} from "../shared/messages"
import { pairKey } from "../shared/languages"
import { resolveUiLocale } from "../shared/locales"
import { type Catalog, offlineState } from "../shared/offline-needs"
import { getPreset } from "../shared/providers"
import { SETTINGS_KEY, type Settings, type TierSettings, toPublicSettings } from "../shared/settings"
import { readSettings, updateSettings } from "../shared/settings-store"
import { sourceDetector } from "../shared/lang-detect"
import { getBergamot } from "../offline/bergamot"
import { handleBergamot } from "./bergamot-admin"
import { type KeyValueStorage, PersistentCache } from "./cache"
import { Dictionary } from "./dictionary"
import { fetchDictionaryIndex } from "./dictionary/download"
import { TranslationService } from "./service"
import { openWelcomeOnInstall } from "./welcome"
import { setUpE2e } from "../e2e/background"
import { releaseFetch } from "../e2e/release"

declare const __DEBUG__: boolean
declare const __E2E__: boolean

const uiLang = thunderbirdUiLanguage()
let settings: Settings = readSettings(undefined)

const storage: KeyValueStorage = {
  get: async (key) => (await ext.storage.local.get(key))[key],
  set: (key, value) => ext.storage.local.set({ [key]: value }),
  remove: (key) => ext.storage.local.remove(key),
}

const cache = new PersistentCache(storage, settings.cache.maxEntries)
// The dictionary and the offline models name the source language of a paragraph the same way.
const detect = sourceDetector(ext.i18n)

/** An index that could not be read is asked for again after this long. */
const CATALOG_RETRY_MS = 10 * 60_000
/** Pair keys of the dictionary packs of each release tag, read once; null when the index could not be read. */
const dictionaryCatalogs = new Map<string, Promise<Catalog>>()
/** The indexes read so far, for translations: they never wait for the network. */
const dictionaryCatalogsRead = new Map<string, Catalog>()
function dictionaryCatalog(): Promise<Catalog> {
  const tag = settings.dictionary.releaseTag
  let catalog = dictionaryCatalogs.get(tag)
  if (!catalog) {
    catalog = fetchDictionaryIndex(tag, __E2E__ ? releaseFetch : undefined).then(
      (packs) => dictionaryCatalogsRead.set(tag, new Set(packs.map((p) => pairKey(p.src, p.tgt)))).get(tag)!,
      () => {
        setTimeout(() => dictionaryCatalogs.delete(tag), CATALOG_RETRY_MS)
        return null
      },
    )
    dictionaryCatalogs.set(tag, catalog)
  }
  return catalog
}

const dictionary = new Dictionary(undefined, { detect, catalog: () => dictionaryCatalogsRead.get(settings.dictionary.releaseTag) ?? null })

/** Kinds of the services of the dictionary and machine tiers, where the offline services can be. */
const offlineKinds = (tiers: TierSettings) => [tiers.dictionary, tiers.machine].map((id) => (id ? getPreset(id)?.kind : undefined))

/** What the offline services among `tiers` lack for the languages; a store that cannot be read says nothing. */
async function offlineStatus(sourceLang: string, targetLang: string, tiers: TierSettings): Promise<OfflineStatus> {
  const status: OfflineStatus = {}
  const kinds = offlineKinds(tiers)
  await Promise.all([
    kinds.includes("dictionary") &&
      Promise.all([dictionaryCatalog(), dictionary.installedIds()]).then(
        ([catalog, installed]) => void (status.dictionary = offlineState("dictionary", sourceLang, targetLang, catalog, installed)),
        () => {},
      ),
    kinds.includes("bergamot") &&
      Promise.all([getBergamot().catalog(), getBergamot().installedKeys()]).then(
        ([catalog, installed]) => void (status.bergamot = offlineState("bergamot", sourceLang, targetLang, catalog, installed)),
        () => {},
      ),
  ])
  return status
}
// Badge, button title and error messages use the current i18n instance, set by applyUiLanguage().
const service = new TranslationService({ getSettings: () => settings, cache, dictionary, detect, i18n: getI18n })

function adoptSettings(stored: unknown): void {
  settings = readSettings(stored)
  cache.configure(settings.cache.enabled, settings.cache.maxEntries)
  // The AI SDK is a chunk of its own (scripts/build.mjs), loaded once the AI tier is in use; a failure shows with the first AI request.
  if (settings.tiers.ai) import("./translators/llm").catch(() => {})
  // Translations name missing packs and models only from catalogs already read: read those of the offline services in use ahead.
  const kinds = offlineKinds(settings.tiers)
  if (kinds.includes("dictionary")) void dictionaryCatalog()
  if (kinds.includes("bergamot")) void getBergamot().catalog()
}

// Test build (npm run e2e): settings and dictionary pack of the local mock server, before anything is translated.
const e2eReady = __E2E__ ? setUpE2e({ storage, dictionary, runCommand }) : undefined

const settingsReady = (async () => {
  await e2eReady
  const stored = await storage.get(SETTINGS_KEY)
  adoptSettings(stored)
  // A fresh installation, or settings that reading migrated (earlier forms, copies of built-in prompts): store them in the current form.
  if (JSON.stringify(settings) !== JSON.stringify(stored)) await storage.set(SETTINGS_KEY, settings)
  await applyUiLanguage()
})()

async function applyUiLanguage(): Promise<void> {
  const i18n = await loadExtensionI18n(settings.uiLanguage)
  if (__DEBUG__) console.info("[thunderbird-translate] interface language", settings.uiLanguage, uiLang, "→", i18n.locale, i18n.t("actionTitle"))
  try {
    // Global title of the message header button; the manifest default follows Thunderbird only.
    // Not awaited: when Thunderbird starts with a message on screen, the call can stay pending
    // for a long time, and the settings (and with them every translation) must not wait for it.
    ext.messageDisplayAction.setTitle({ title: i18n.t("actionTitle") }).catch(() => {})
  } catch {
    // Not available in this Thunderbird version.
  }
  for (const tabId of tabStates.keys()) void updateBadge(tabId)
}

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) return
  const previousUiLanguage = settings.uiLanguage
  adoptSettings(changes[SETTINGS_KEY].newValue)
  if (settings.uiLanguage !== previousUiLanguage) void applyUiLanguage()
  broadcast({ type: "settings", settings: toPublicSettings(settings) })
})

/* ---------- content script connections ---------- */

const ports = new Map<number, Set<browser.runtime.Port>>()
const tabStates = new Map<number, TabState>()

function broadcast(msg: PortPush): void {
  for (const set of ports.values()) for (const port of set) safePost(port, msg)
}

function safePost(port: browser.runtime.Port, msg: PortPush): void {
  try {
    port.postMessage(msg)
  } catch {
    // The content script went away.
  }
}

/** Dictionary packs or offline models changed: content scripts forget their results, pages show the new state. */
function offlineDataChanged(): void {
  broadcast({ type: "dataChanged" })
  ext.runtime.sendMessage({ type: "offlineDataChanged" } satisfies PageNotice).catch(() => {
    // No page open.
  })
}

/** A command for the content scripts of one tab: toggle or retranslate. */
function postToTab(tabId: number, msg: PortPush): void {
  for (const port of ports.get(tabId) ?? []) safePost(port, msg)
}

async function updateBadge(tabId: number): Promise<void> {
  const active = tabStates.get(tabId)?.active
  try {
    await ext.messageDisplayAction.setBadgeText({ tabId, text: active ? t("badgeOn") : "" })
    if (active) await ext.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#4c8bf5" })
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
  tabStates.set(tabId, { ...IDLE_TAB_STATE, connected: true })
  void updateBadge(tabId)

  port.onMessage.addListener((raw) => {
    const msg = raw as PortReport
    switch (msg?.type) {
      case "state": {
        const wasActive = tabStates.get(tabId)?.active
        tabStates.set(tabId, { connected: true, ...msg.state })
        // Progress reports come many times a second; the badge only shows whether the tab is translated.
        if (msg.state.active !== wasActive) void updateBadge(tabId)
        break
      }
      case "context":
        service.setContext(msg.context, msg.bypassCache === true)
        break
      case "translate":
        void settingsReady
          .then(() => service.translateForPage(msg.request, (tier, result) => safePost(port, { type: "tier", id: msg.id, tier, result })))
          .finally(() => safePost(port, { type: "done", id: msg.id }))
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

/** Messages of each interface language, read and compiled once: every displayed message asks for them. */
const localeTables = new Map<string, Promise<LocaleMessages>>()

function localeMessages(setting: unknown): Promise<LocaleMessages> {
  const locale = resolveUiLocale(setting, uiLang)
  let table = localeTables.get(locale)
  if (!table) {
    // Content scripts get their messages here instead of fetching moz-extension:// URLs.
    // English in place of a locale whose file could not be read is not kept: the next request reads the file again.
    table = loadI18n(locale, uiLang, fetchPackagedMessages).then((i18n) => {
      if (i18n.locale !== locale) localeTables.delete(locale)
      return { locale: i18n.locale, messages: i18n.messages }
    })
    localeTables.set(locale, table)
  }
  return table
}

async function handle(req: BackgroundRequest): Promise<unknown> {
  await settingsReady
  switch (req.type) {
    case "toggleTab":
      return postToTab(req.tabId, { type: "toggle" })
    case "retranslateTab":
      return postToTab(req.tabId, { type: "retranslate" })
    case "getTabState":
      return tabStates.get(req.tabId) ?? IDLE_TAB_STATE
    case "testProvider":
      try {
        return { ok: true, text: await service.testProvider(req.providerId, req.config, req.targetLang) }
      } catch (error) {
        return { ok: false, error: describeError(error, getI18n()) }
      }
    case "getLocaleMessages":
      return localeMessages(req.uiLanguage)
    case "dictionaryChanged":
      dictionary.invalidate()
      return offlineDataChanged()
    case "bergamotInstall":
    case "bergamotRemove": {
      const result = await handleBergamot(req)
      offlineDataChanged()
      return result
    }
    case "offlineStatus":
      return offlineStatus(req.sourceLang, req.targetLang, req.tiers)
    case "openOptions":
      return void (await ext.tabs.create({ url: ext.runtime.getURL(optionsPath(req.place)) }))
    case "muteOfflinePairs":
      // Nothing goes back: the settings hold API keys, and the request comes from a content script.
      return void (await updateSettings((s) => {
        const muted = new Set(s.offlineMutedPairs)
        for (const pair of req.pairs) {
          if (req.muted) muted.add(pair)
          else muted.delete(pair)
        }
        s.offlineMutedPairs = [...muted]
      }))
    case "bergamotList":
    case "bergamotProgress":
    case "bergamotCancel":
      return handleBergamot(req)
    case "clearCache":
      return cache.clear()
    case "cacheStats":
      return { size: await cache.size() }
  }
}

ext.runtime.onMessage.addListener((message: unknown) => {
  const req = message as BackgroundRequest
  if (!req || typeof req !== "object" || typeof req.type !== "string") return undefined
  return handle(req)
})

/* ---------- keyboard shortcuts ---------- */

/** Commands for the message of the tab of the shortcut, else of the active tab. */
const TAB_COMMANDS = new Map<string, PortPush>([
  ["toggle-translation", { type: "toggle" }],
  ["retranslate", { type: "retranslate" }],
])

async function runCommand(command: string, tab?: browser.tabs.Tab): Promise<void> {
  await settingsReady
  const push = TAB_COMMANDS.get(command)
  if (push) {
    const tabId = tab?.id ?? (await ext.tabs.query({ active: true, currentWindow: true }))[0]?.id
    if (tabId !== undefined) postToTab(tabId, push)
  } else if (command === "toggle-display-mode") {
    await updateSettings((s) => (s.mode = s.mode === "bilingual" ? "translation-only" : "bilingual"))
  }
}

ext.commands.onCommand.addListener((command: string, tab?: browser.tabs.Tab) => runCommand(command, tab))

/* ---------- installation ---------- */

ext.runtime.onInstalled.addListener((details) => {
  if (__DEBUG__) console.info("[thunderbird-translate] installed:", details.reason)
  void openWelcomeOnInstall(details)
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
  for (const tab of await ext.tabs.query({})) {
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
