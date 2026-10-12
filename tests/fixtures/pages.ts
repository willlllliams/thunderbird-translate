/** The extension pages (popup, settings page, setup guide) loaded into jsdom over a fake extension API. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { onTestFinished, vi } from "vitest"
import type { OfflineManager } from "../../src/offline/manager"
import type { BackgroundRequest, OfflineItem } from "../../src/shared/messages"
import { SAVE_DELAY_MS } from "../../src/options/session"
import { type Settings, SETTINGS_KEY } from "../../src/shared/settings"
import { settle, stubBrowser } from "./browser"
import { packagedFetch } from "./locales"
import { offlineBackground } from "./offline"
import type { StorageChanges } from "./storage"

/** With fake timers: let the delay of the settings page and the setup guide pass, after which their edits are written. */
export const flushSave = () => vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)

/**
 * End the pages of a test when it finishes, as closing their window would:
 * the page hears pagehide (the setup guide stops its demo and tour and drops
 * its key listener) and its timers are cleared. shared/ext.ts reads the
 * extension API at every call, so a page left running would reach the fake
 * API of a later test: the popup polling its tab, a pending save of the
 * settings page, the tour closing on a key press. Work that waits for no
 * timer (promises, IndexedDB requests, e.g. a list still loading) then gets
 * to end while the fake API of its test is still in place, see settle().
 */
function endPageWithTest(): void {
  onTestFinished(async () => {
    dispatchEvent(new Event("pagehide"))
    vi.clearAllTimers()
    await settle()
  })
}

/**
 * Load the popup, the settings page or the welcome page and run its script
 * with a fake extension API holding `settings` (and `stored`, other
 * storage.local keys). `respond` answers background requests; what it
 * leaves unanswered (undefined) goes to the offline handlers of the
 * background script over a dictionary manager that reads the release from
 * `fetchUrl` and the Bergamot manager `bergamot`; cacheStats reports an
 * empty cache.
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
    bergamot,
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
    /** The Bergamot manager of the background script; one without models by default. */
    bergamot?: OfflineManager<OfflineItem>
  } = {},
) {
  // The timers of the page must be fake so that they end with the test, see endPageWithTest().
  if (!vi.isFakeTimers()) throw new Error("openPage() needs fake timers: call useFakeTimers() first")
  endPageWithTest()
  const html = readFileSync(join(__dirname, "..", "..", "static", `${page}.html`), "utf8")
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML
  const tabs = activeTab ? [activeTab] : []
  // The notices of the background script reach the page as runtime messages.
  const offline = offlineBackground({ fetchUrl, bergamot, toPages: (notice) => browser.events.message.fire(notice) })
  const browser = stubBrowser({
    stored: { ...other, [SETTINGS_KEY]: settings },
    uiLanguage,
    systemLanguages,
    connect,
    currentTab,
    tabs,
    activeTabs: tabs,
    respond: (req) => respond?.(req) ?? offline.respond(req) ?? (req.type === "cacheStats" ? { size: 0 } : undefined),
  })
  const close = vi.fn()
  vi.stubGlobal("close", close)
  vi.stubGlobal("fetch", packagedFetch(fetchUrl))
  const modules = { popup: () => import("../../src/popup/index"), options: () => import("../../src/options/index"), welcome: () => import("../../src/welcome/index") }
  // The script of a page runs when it is imported: a new module registry runs it again, with new module state (settings store, interface language).
  vi.resetModules()
  await modules[page]()
  const { api, local } = browser
  const stored = () => local.data[SETTINGS_KEY] as Settings
  return {
    /** The fake extension API of the page. */
    browser,
    /** The offline handlers of the background script, its dictionary manager and store. */
    offline,
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
