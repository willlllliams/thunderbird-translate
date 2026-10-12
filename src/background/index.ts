import { ext } from "../shared/ext"
import { getI18n } from "../shared/i18n"
import { loadExtensionI18n, thunderbirdUiLanguage } from "../shared/i18n-ext"
import type { OfflineStatus } from "../shared/messages"
import { pairKey } from "../shared/languages"
import { type Catalog, offlineServiceOf, offlineState } from "../shared/offline-needs"
import { TIERS } from "../shared/providers"
import { SETTINGS_KEY, type Settings, type TierSettings, toPublicSettings } from "../shared/settings"
import { readSettings } from "../shared/settings-store"
import { sourceDetector } from "../shared/lang-detect"
import { getBergamot } from "../offline/bergamot"
import { CatalogCache } from "../offline/catalog-cache"
import { type KeyValueStorage, PersistentCache } from "./cache"
import { createCommandRunner } from "./commands"
import { registerContentScripts } from "./content-scripts"
import { createLocaleTables } from "./locale-tables"
import { createDispatch, createHandlers } from "./router"
import { createTabRegistry } from "./tabs"
import { Dictionary } from "../offline/dictionary"
import { fetchDictionaryIndex } from "../offline/dictionary/download"
import { TranslationService } from "./service"
import { openWelcomeOnInstall } from "./welcome"
import { beforeSettingsRead } from "../hooks/background"
import { releaseFetch } from "../hooks/servers"

declare const __DEBUG__: boolean

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

/** Pair keys of the dictionary packs of each release tag: read again after six hours, after a failed read not before ten minutes. */
const dictionaryCatalogs = new Map<string, CatalogCache<Set<string>>>()
function dictionaryCatalogOf(tag: string): CatalogCache<Set<string>> {
  let catalog = dictionaryCatalogs.get(tag)
  if (!catalog) {
    catalog = new CatalogCache({ load: async () => new Set((await fetchDictionaryIndex(tag, releaseFetch)).map((p) => pairKey(p.src, p.tgt))) })
    dictionaryCatalogs.set(tag, catalog)
  }
  return catalog
}
/** The index of the release in use; null when it cannot be read. */
const dictionaryCatalog = (): Promise<Catalog> => dictionaryCatalogOf(settings.dictionary.releaseTag).get()

// Translations take the index read so far: they never wait for the network.
const dictionary = new Dictionary(undefined, { detect, catalog: () => dictionaryCatalogOf(settings.dictionary.releaseTag).peek() })

/** The offline services among the services of `tiers`. */
const offlineKinds = (tiers: TierSettings) => TIERS.map((tier) => offlineServiceOf(tiers[tier]))

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

/** The keyboard commands; created once the settings and the ports exist (see below). */
const runCommand = (command: string, tab?: browser.tabs.Tab) => commandRunner(command, tab)

// Test build (npm run e2e): settings and dictionary pack of the local mock server, before anything is translated.
const hookReady = beforeSettingsRead?.({ storage, dictionary, runCommand })

const settingsReady = (async () => {
  await hookReady
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
  tabs.redrawBadges()
}

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) return
  const previousUiLanguage = settings.uiLanguage
  adoptSettings(changes[SETTINGS_KEY].newValue)
  if (settings.uiLanguage !== previousUiLanguage) void applyUiLanguage()
  tabs.broadcast({ type: "settings", settings: toPublicSettings(settings) })
})

/* ---------- content script connections ---------- */

const tabs = createTabRegistry({
  ready: settingsReady,
  publicSettings: () => toPublicSettings(settings),
  setContext: (context, bypassCache) => service.setContext(context, bypassCache),
  translate: (request, onTier) => service.translateForPage(request, onTier),
})

ext.runtime.onConnect.addListener((port) => tabs.connect(port))

const commandRunner = createCommandRunner({ ready: settingsReady, postToTab: tabs.postToTab })

/* ---------- requests from content scripts, popup and options ---------- */

const handlers = createHandlers({
  tabs,
  service,
  localeMessages: createLocaleTables(uiLang),
  dictionary,
  offlineStatus,
  cache,
})
ext.runtime.onMessage.addListener(createDispatch(handlers, settingsReady))

/* ---------- keyboard shortcuts ---------- */

ext.commands.onCommand.addListener((command: string, tab?: browser.tabs.Tab) => runCommand(command, tab))

/* ---------- installation ---------- */

ext.runtime.onInstalled.addListener((details) => {
  if (__DEBUG__) console.info("[thunderbird-translate] installed:", details.reason)
  void openWelcomeOnInstall(details)
})

/* ---------- content script registration, after every listener ---------- */

void registerContentScripts()
