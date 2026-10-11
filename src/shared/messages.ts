import type { MessageTable } from "./i18n"
import type { UiLanguageSetting, UiLocale } from "./locales"
import type { ProviderConfig, PublicSettings } from "./settings"

/** Requests sent with runtime.sendMessage to the background script. */
export type BackgroundRequest =
  | { type: "translate"; text: string; targetLang: string; providerId: string }
  | { type: "getPublicSettings" }
  | { type: "tabCommand"; tabId: number; command: TabCommand }
  | { type: "getTabState"; tabId: number }
  | { type: "testProvider"; providerId: string; config: ProviderConfig; targetLang: string }
  | { type: "clearCache" }
  | { type: "cacheStats" }
  | { type: "getLocaleMessages"; uiLanguage: UiLanguageSetting }

/** Answer to getLocaleMessages: the resolved locale and its messages (key → template). */
export interface LocaleMessages {
  locale: UiLocale
  messages: MessageTable
}

export type TabCommand = "toggle" | "start" | "stop"

export type TranslateResponse = { ok: true; text: string } | { ok: false; error: string }

export interface TabState {
  connected: boolean
  active: boolean
  total: number
  done: number
  failed: number
}

/** Messages pushed from background to content scripts over a runtime Port. */
export type PortPush =
  | { type: "settings"; settings: PublicSettings }
  | { type: "command"; command: TabCommand }

/** Messages sent from content scripts to background over the Port. */
export type PortReport = { type: "state"; state: Omit<TabState, "connected"> }

export const CONTENT_PORT_NAME = "tt-content"
