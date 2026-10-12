/** The extension pages (popup, settings page, setup guide) loaded into jsdom over a fake extension API. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { vi } from "vitest"
import type { BackgroundRequest } from "../../src/shared/messages"
import { SAVE_DELAY_MS } from "../../src/options/session"
import { type Settings, SETTINGS_KEY } from "../../src/shared/settings"
import { stubBrowser } from "./browser"
import { packagedFetch } from "./locales"
import type { StorageChanges } from "./storage"

/** With fake timers: let the delay of the settings page and the setup guide pass, after which their edits are written. */
export const flushSave = () => vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)

/**
 * Load the popup, the settings page or the welcome page and run its script
 * with a fake extension API holding `settings` (and `stored`, other
 * storage.local keys). `respond` answers background requests; cacheStats
 * reports an empty cache.
 */
export async function openPage(
  page: "popup" | "options" | "welcome",
  settings: Settings,
  {
    uiLanguage = "en-US",
    respond,
    fetchUrl,
    connect,
    stored: other = {},
    activeTab,
    currentTab = { id: 7 },
    systemLanguages = [],
  }: {
    uiLanguage?: string
    /** i18n.getPreferredSystemLanguages(); null: a Thunderbird without it. */
    systemLanguages?: string[] | null
    respond?: (req: BackgroundRequest) => unknown
    /** runtime.connect(), for the content script's Port. */
    connect?: (info: { name: string }) => unknown
    stored?: Record<string, unknown>
    /** Answers fetch() for URLs other than the packaged messages, e.g. the dictionary index; a failed request otherwise. */
    fetchUrl?: (url: string) => Promise<Response>
    /** The tab that tabs.query() reports as active (the popup's message tab); none by default. */
    activeTab?: { id?: number }
    /** What tabs.getCurrent() reports, e.g. {} for a page without a tab id. */
    currentTab?: { id?: number }
  } = {},
) {
  const html = readFileSync(join(__dirname, "..", "..", "static", `${page}.html`), "utf8")
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML
  const tabs = activeTab ? [activeTab] : []
  const browser = stubBrowser({
    stored: { ...other, [SETTINGS_KEY]: settings },
    uiLanguage,
    systemLanguages,
    connect,
    currentTab,
    tabs,
    activeTabs: tabs,
    respond: (req) => respond?.(req) ?? (req.type === "cacheStats" ? { size: 0 } : undefined),
  })
  const close = vi.fn()
  vi.stubGlobal("close", close)
  vi.stubGlobal("fetch", packagedFetch(fetchUrl))
  const modules = { popup: () => import("../../src/popup/index"), options: () => import("../../src/options/index"), welcome: () => import("../../src/welcome/index") }
  // Modules that the test file imported before the stub (shared/ext.ts reads the global once) are loaded again over it.
  vi.resetModules()
  await modules[page]()
  const { api, local } = browser
  const stored = () => local.data[SETTINGS_KEY] as Settings
  return {
    /** The fake extension API of the page. */
    browser,
    /** URLs of the tabs the page opened and ids of those it closed. */
    created: browser.created,
    removed: browser.removed,
    sendMessage: api.runtime.sendMessage,
    /** runtime.openOptionsPage() and window.close(). */
    openOptionsPage: api.runtime.openOptionsPage,
    close,
    stored,
    /** Other storage.local keys, e.g. the welcome page's state. */
    local: (key: string) => local.data[key],
    /** Another page writes settings. `announce` = false: the storage change event has not reached this page yet. */
    external(change: (s: Settings) => void, announce = true) {
      change(stored())
      if (announce) local.announce(SETTINGS_KEY)
    },
    /** A message of the background script to the extension pages, e.g. { type: "offlineDataChanged" }. */
    notify(message: unknown) {
      browser.events.message.fire(message)
    },
    /** A raw storage change event, e.g. of another storage area. */
    emitChange(changes: object, area: string) {
      local.onChanged.fire(changes as StorageChanges, area)
    },
  }
}
