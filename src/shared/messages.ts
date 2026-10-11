import type { MessageTable } from "./i18n"
import type { UiLanguageSetting, UiLocale } from "./locales"
import type { MailContext } from "./mail-context"
import type { ProviderConfig, PublicSettings } from "./settings"

/** Requests sent with runtime.sendMessage to the background script. */
export type BackgroundRequest =
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

/** One paragraph to translate, sent by the content script over its Port. */
export interface TranslateRequest {
  text: string
  targetLang: string
  providerId: string
  /** Precise mode: the message registered with a "context" report and the paragraph's position in it. */
  context?: { id: string; index: number }
}

/**
 * Final result of a paragraph. With race mode, `fallback` is the fast
 * service's translation that stays on screen when the AI request failed.
 */
export type TranslateResponse = { ok: true; text: string } | { ok: false; error: string; fallback?: string }

export interface TabState {
  connected: boolean
  active: boolean
  total: number
  /** Paragraphs with their final translation. */
  done: number
  /** Paragraphs showing a fast provisional translation while the AI translation runs. */
  provisional: number
  failed: number
  /** Description of the most recent failure while some paragraphs are still failed. */
  lastError?: string
}

/** Messages pushed from background to content scripts over a runtime Port. */
export type PortPush =
  | { type: "settings"; settings: PublicSettings }
  | { type: "command"; command: TabCommand }
  | { type: "provisional"; id: number; text: string }
  | { type: "result"; id: number; result: TranslateResponse }

/** Messages sent from content scripts to background over the Port. */
export type PortReport =
  | { type: "state"; state: Omit<TabState, "connected"> }
  | { type: "context"; context: MailContext }
  | { type: "translate"; id: number; request: TranslateRequest }

export const CONTENT_PORT_NAME = "tt-content"
