/**
 * The background script: builds the translation service, the settings,
 * the tab registry and the request handlers, and registers every listener
 * of the extension API in its first run, so that an event that woke the
 * background page reaches them. The modules get what they need from here
 * as arguments.
 */

import { ext } from "../shared/ext"
import { getI18n } from "../shared/i18n"
import { loadExtensionI18n, thunderbirdUiLanguage } from "../shared/i18n-ext"
import { createDefaultSettings, grantedEntries, toPublicSettings } from "../shared/settings"
import { onStoredSettings, updateSettings } from "../shared/settings-store"
import { sourceDetector } from "../shared/lang-detect"
import { type KeyValueStorage, PersistentCache } from "./cache"
import { createCommandRunner } from "./commands"
import { createConsentWindows } from "./consent-window"
import { registerContentScripts } from "./content-scripts"
import { createLocaleTables } from "./locale-tables"
import { createOfflineStatus } from "./offline-status"
import { createDispatch, createHandlers } from "./router"
import { createSettingsState } from "./settings-state"
import { displayedHeader, displayedMessageId, messageImageAddresses, messagePart } from "./displayed"
import { ImageService } from "./images"
import { offerRemoteAccess } from "./remote-images"
import { openOptionsAt } from "../shared/options-tab"
import { createTabRegistry } from "./tabs"
import { getBergamot } from "../offline/bergamot"
import { DictionaryManager } from "../offline/dictionary/manager"
import type { OfflineManager } from "../offline/manager"
import type { OfflineItem } from "../shared/messages"
import type { OfflineService } from "../shared/offline-needs"
import { TranslationService } from "./service"
import { openWelcomeOnInstall } from "./welcome"
import { beforeSettingsRead } from "../hooks/background"
import { localImageOrigin, releaseFetch } from "../hooks/servers"

declare const __DEBUG__: boolean

const uiLang = thunderbirdUiLanguage()

const storage: KeyValueStorage = {
  get: async (key) => (await ext.storage.local.get(key))[key],
  set: (key, value) => ext.storage.local.set({ [key]: value }),
  remove: (key) => ext.storage.local.remove(key),
}

const cache = new PersistentCache(storage, createDefaultSettings().cache.maxEntries)
// The dictionary and the offline models name the source language of a paragraph the same way.
const detect = sourceDetector(ext.i18n)

// Test build (npm run e2e): the dictionary packs of the local mock server instead of GitHub's.
const dictionary = new DictionaryManager({ releaseTag: () => settings.current().dictionary.releaseTag, fetch: releaseFetch, detect })
/** The manager of each offline service; the Bergamot one is created on first use. */
const offlineManager = (service: OfflineService): OfflineManager<OfflineItem> => (service === "dictionary" ? dictionary : getBergamot())
const offline = createOfflineStatus({ manager: offlineManager })

/** The keyboard commands, created below once the settings and the tabs exist; the hook of the e2e build gets them first. */
const runCommand = (command: string, tab?: browser.tabs.Tab) => commandRunner(command, tab)

const settings = createSettingsState({
  storage,
  // Test build (npm run e2e): settings and dictionary pack of the local mock server, before anything is translated.
  beforeRead: beforeSettingsRead && (() => beforeSettingsRead!({ storage, dictionary, runCommand, tabs })),
  onAdopt: (s) => {
    cache.configure(s.cache.enabled, s.cache.maxEntries)
    // The AI SDK is a chunk of its own (scripts/build.mjs), loaded once the AI tier is in use; a failure shows with the first AI request.
    if (s.tiers.ai) import("./translators/llm").catch(() => {})
    // Translations name missing packs and models only from catalogs already read: read those of the offline services in use ahead.
    offline.readAhead(s.tiers)
  },
  onUiLanguage: (s) => applyUiLanguage(s.uiLanguage),
})

// Badge, button title and error messages use the current i18n instance, set by applyUiLanguage().
const service = new TranslationService({
  getSettings: () => settings.current(),
  cache,
  dictionary,
  detect,
  i18n: getI18n,
  // A host of the manifest, or one the user allowed on the settings page or in the setup guide.
  hasOrigin: (origin) => ext.permissions.contains({ origins: [origin] }),
})

/** Counts the changes of the host permissions: after one, the content scripts read their remote images again. */
let hostAccess = 0
const publicSettings = () => toPublicSettings(settings.current(), settings.credentials(), hostAccess)

/**
 * Records the services the user allowed in `list` of the settings, each with the host the panel named; taken over at
 * once, before the storage event arrives, so the request that waits for it sees the consent.
 */
const recordConsent = async (list: "onlineConsent" | "imageConsent", ids: string[], hosts?: string[]) =>
  settings.adopt(await updateSettings((s) => void (s[list] = [...new Set([...s[list], ...grantedEntries(s, ids, hosts)])])))

/** The popup page in a window of its own, for the tabs whose message header button is in no toolbar. */
const consentWindows = createConsentWindows()

const openPopup = (windowId: number | undefined) => ext.messageDisplayAction.openPopup(windowId === undefined ? {} : { windowId })

// Images go to their own queue per service; the AI SDK is loaded with the first of them, as with text.
const images = new ImageService({
  getSettings: () => settings.current(),
  cache,
  displayed: displayedMessageId,
  part: messagePart,
  imageUrls: messageImageAddresses,
  // Test build (npm run e2e): the remote images of the local mock server; any other build reads public hosts only.
  localOrigin: localImageOrigin,
  recordConsent: (ids, hosts) => recordConsent("imageConsent", ids, hosts),
  glossary: (contextId) => service.glossaryOf(contextId),
  i18n: getI18n,
  hasOrigin: (origin) => ext.permissions.contains({ origins: [origin] }),
})

const tabs = createTabRegistry({
  ready: settings.ready,
  publicSettings,
  // The header of the message is read once a request writes its summary together with the analysis.
  setContext: (context, bypassCache, tabId) => service.setContext(context, bypassCache, tabId === undefined ? undefined : () => displayedHeader(tabId)),
  translate: (request, onTier, options) => service.translateForPage(request, onTier, options),
  summarize: async (text, tabId, fresh, signal) => service.summarize(text, await displayedHeader(tabId).catch(() => null), fresh, signal),
  openSession: (session, tabId) => images.open(session, tabId),
  image: (session, tabId, request) => images.request(session, tabId, request),
  // The popup allowed what a consent panel asked: for the text in the settings, for images in the settings or for the message.
  grantConsent: async (session, question) => {
    if (question.kind === "image") return images.grant(session, [question.need.id], question.each, [question.need.host])
    await recordConsent("onlineConsent", question.needs.map((need) => need.id), question.needs.map((need) => need.host))
  },
  // The popup of the message shows the question; without the button in a toolbar, the popup page in a window of its own, which closes with the last question.
  consentAsked: (tab) =>
    void openPopup(tab.windowId)
      .catch(() => false)
      .then(async (opened) => {
        if (!opened && tab.id !== undefined) await consentWindows.show(tab.id)
      })
      .catch(() => {}),
  consentOver: (tabId) => consentWindows.close(tabId),
  forgetSession: (session) => images.forget(session),
  // Only a page of the extension may ask for a permission, from a click: the popup of the message, else the settings page.
  remoteAccess: (tab) =>
    void offerRemoteAccess(tab.windowId, {
      openPopup,
      openOptions: () => openOptionsAt({ section: "imageRemote" }),
    }),
})

async function applyUiLanguage(uiLanguage: string): Promise<void> {
  const i18n = await loadExtensionI18n(uiLanguage)
  if (__DEBUG__) console.info("[thunderbird-translate] interface language", uiLanguage, uiLang, "→", i18n.locale, i18n.t("actionTitle"))
  try {
    // Global title of the message header button; the manifest default follows Thunderbird only.
    // Not awaited: when Thunderbird starts with a message on screen, the call can stay pending
    // for a long time, and the settings (and with them every translation) must not wait for it.
    ext.messageDisplayAction.setTitle({ title: i18n.t("actionTitle") }).catch(() => {})
  } catch {
    // Not available in this Thunderbird version.
  }
  tabs.redrawBadges()
}

const commandRunner = createCommandRunner({ ready: settings.ready, postToTab: tabs.postToTab })

const handlers = createHandlers({
  tabs,
  service,
  images,
  localeMessages: createLocaleTables(uiLang),
  offlineManager,
  offlineStatus: offline.status,
  cache,
})

/* ---------- listeners: all of them in this first run ---------- */

onStoredSettings((stored) => {
  settings.adopt(stored)
  tabs.broadcast({ type: "settings", settings: publicSettings() })
})
// The user allowed or removed a host, e.g. the access to remote images in the popup: the content scripts read their remote images again.
const hostsChanged = () => {
  hostAccess++
  void settings.ready().then(() => tabs.broadcast({ type: "settings", settings: publicSettings() }))
}
ext.permissions.onAdded.addListener(hostsChanged)
ext.permissions.onRemoved.addListener(hostsChanged)
ext.runtime.onConnect.addListener((port) => tabs.connect(port))
ext.runtime.onMessage.addListener(createDispatch(handlers, settings.ready))
ext.commands.onCommand.addListener(runCommand)
ext.runtime.onInstalled.addListener((details) => {
  if (__DEBUG__) console.info("[thunderbird-translate] installed:", details.reason)
  void openWelcomeOnInstall(details)
})

// After every listener: a content script that starts right away finds the background ready to answer.
void registerContentScripts()
