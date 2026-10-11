import type { BergamotPairInfo } from "../offline/bergamot"
import type { MessageTable } from "./i18n"
import type { UiLanguageSetting, UiLocale } from "./locales"
import type { MailContext } from "./mail-context"
import type { Tier } from "./providers"
import type { ProviderConfig, PublicSettings } from "./settings"

/** Requests sent with runtime.sendMessage to the background script. */
export type BackgroundRequest =
  | { type: "toggleTab"; tabId: number }
  | { type: "getTabState"; tabId: number }
  | { type: "testProvider"; providerId: string; config: ProviderConfig; targetLang: string }
  | { type: "clearCache" }
  | { type: "cacheStats" }
  | { type: "getLocaleMessages"; uiLanguage: UiLanguageSetting }
  /** The settings page installed or deleted dictionary packs. */
  | { type: "dictionaryChanged" }
  | BergamotRequest

/** Offline models, handled by the background script where the engine runs. */
export type BergamotRequest =
  /** Answer: BergamotResult with the pairs. */
  | { type: "bergamotList"; refresh?: boolean }
  /** Answer when the installation ends: BergamotResult. */
  | { type: "bergamotInstall"; src: string; tgt: string }
  | { type: "bergamotCancel"; src: string; tgt: string }
  /** Answer: BergamotProgress. */
  | { type: "bergamotProgress" }
  | { type: "bergamotRemove"; src: string; tgt: string }
  /** Answer: BergamotRequired. */
  | { type: "bergamotRequired"; src: string; tgt: string }

export type BergamotResult = { ok: true; pairs?: BergamotPairInfo[] } | { ok: false; error?: string; cancelled?: true }

/** Running installations by "src>tgt": bytes done and total. */
export type BergamotProgress = Record<string, { done: number; total: number }>

/** Directions needed for a language pair, and those not installed. */
export interface BergamotRequired {
  required: [string, string][]
  missing: [string, string][]
}

/** Answer to getLocaleMessages: the resolved locale and its messages (key → template). */
export interface LocaleMessages {
  locale: UiLocale
  messages: MessageTable
}

/** One paragraph to translate, sent by the content script over its Port. */
export interface TranslateRequest {
  text: string
  /** "auto" or a language code. */
  sourceLang: string
  targetLang: string
  /** Tiers to ask; the background uses the service its settings name for each. */
  tiers: Tier[]
  /** Precise mode: the message registered with a "context" report and the paragraph's position in it. */
  context?: { id: string; index: number }
}

/** Result of one tier for one paragraph, and the answer to testProvider. */
export type TranslateResponse = { ok: true; text: string } | { ok: false; error: string }

export interface TabState {
  connected: boolean
  active: boolean
  total: number
  /** Paragraphs with the translation of the highest tier. */
  done: number
  /** Paragraphs showing a provisional translation of a lower tier while the highest tier runs. */
  provisional: number
  /** Paragraphs whose highest tier failed. */
  failed: number
  /** Description of the most recent failure while some paragraphs are still failed. */
  lastError?: string
}

/** State of a tab without a connected content script. */
export const IDLE_TAB_STATE: TabState = { connected: false, active: false, total: 0, done: 0, provisional: 0, failed: 0 }

/** Messages pushed from background to content scripts over a runtime Port. */
export type PortPush =
  | { type: "settings"; settings: PublicSettings }
  | { type: "toggle" }
  /** The result of one tier for request `id`. */
  | { type: "tier"; id: number; tier: Tier; result: TranslateResponse }
  /** Request `id` is complete; tiers that did not report were not asked. */
  | { type: "done"; id: number }

/** Messages sent from content scripts to background over the Port. */
export type PortReport =
  | { type: "state"; state: Omit<TabState, "connected"> }
  | { type: "context"; context: MailContext }
  | { type: "translate"; id: number; request: TranslateRequest }

export const CONTENT_PORT_NAME = "tt-content"
