/**
 * The requests of the content scripts, the popup and the extension pages
 * (BackgroundApi in shared/messages.ts): one handler per request type, and
 * the dispatch of runtime.onMessage, which answers once the settings are
 * read.
 */

import { describeError } from "../shared/errors"
import { ext } from "../shared/ext"
import { getI18n } from "../shared/i18n"
import { type BackgroundHandlers, type LocaleMessages, type OfflineStatus, optionsPath, type PageNotice } from "../shared/messages"
import type { TierSettings } from "../shared/settings"
import { updateSettings } from "../shared/settings-store"
import type { OfflineManager } from "../offline/manager"
import type { OfflineItem } from "../shared/messages"
import type { OfflineService } from "../shared/offline-needs"
import type { PersistentCache } from "./cache"
import { offlineHandlers } from "./offline-admin"
import type { TranslationService } from "./service"
import type { TabRegistry } from "./tabs"

export interface RouterDeps {
  tabs: Pick<TabRegistry, "postToTab" | "stateOf" | "broadcast">
  service: Pick<TranslationService, "testProvider">
  /** The interface messages of a language for a content script. */
  localeMessages: (setting: unknown) => Promise<LocaleMessages>
  /** The manager of an offline service. */
  offlineManager: (service: OfflineService) => OfflineManager<OfflineItem>
  /** What the offline services among `tiers` lack for the languages. */
  offlineStatus: (sourceLang: string, targetLang: string, tiers: TierSettings) => Promise<OfflineStatus>
  cache: Pick<PersistentCache, "clear" | "size">
}

export function createHandlers({ tabs, service, localeMessages, offlineManager, offlineStatus, cache }: RouterDeps): BackgroundHandlers {
  /** A notice to the extension pages; without an open page it goes nowhere. */
  const toPages = (notice: PageNotice) => void ext.runtime.sendMessage(notice).catch(() => {})
  return {
    toggleTab: (req) => tabs.postToTab(req.tabId, { type: "toggle" }),
    retranslateTab: (req) => tabs.postToTab(req.tabId, { type: "retranslate" }),
    getTabState: (req) => tabs.stateOf(req.tabId),
    testProvider: async (req) => {
      try {
        return { ok: true, text: await service.testProvider(req.providerId, req.config, req.targetLang) }
      } catch (error) {
        return { ok: false, error: describeError(error, getI18n()) }
      }
    },
    getLocaleMessages: (req) => localeMessages(req.uiLanguage),
    offlineStatus: (req) => offlineStatus(req.sourceLang, req.targetLang, req.tiers),
    openOptions: async (req) => void (await ext.tabs.create({ url: ext.runtime.getURL(optionsPath(req.place)) })),
    // Nothing goes back: the settings hold API keys, and the request comes from a content script.
    muteOfflinePairs: async (req) =>
      void (await updateSettings((s) => {
        const muted = new Set(s.offlineMutedPairs)
        for (const pair of req.pairs) {
          if (req.muted) muted.add(pair)
          else muted.delete(pair)
        }
        s.offlineMutedPairs = [...muted]
      })),
    // Dictionary packs or offline models changed: content scripts forget their results, pages show the new state.
    ...offlineHandlers({ manager: offlineManager, contentScripts: () => tabs.broadcast({ type: "offlineDataChanged" }), pages: toPages }),
    clearCache: () => cache.clear(),
    cacheStats: async () => ({ size: await cache.size() }),
  }
}

/** For runtime.onMessage: the answer of the handler of a request, once `ready` settles; undefined (no answer) for anything else. */
export function createDispatch(handlers: BackgroundHandlers, ready: () => Promise<void>): (message: unknown) => Promise<unknown> | undefined {
  return (message) => {
    const type = (message as { type?: unknown } | null | undefined)?.type
    // Only own properties: a request named after a property of Object.prototype ("toString") is unknown too.
    if (typeof type !== "string" || !Object.hasOwn(handlers, type)) return undefined
    const handler = handlers[type as keyof BackgroundHandlers] as (req: unknown) => unknown
    return ready().then(() => handler(message))
  }
}
