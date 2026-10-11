import type { BergamotPairInfo } from "../offline/bergamot"
import type { MissingData } from "./errors"
import type { OfflineService, OfflineState } from "./offline-needs"
import type { MessageTable } from "./i18n"
import type { UiLanguageSetting, UiLocale } from "./locales"
import type { MailContext } from "./mail-context"
import type { Tier } from "./providers"
import type { ProviderConfig, PublicSettings, TierSettings } from "./settings"

/** Requests sent with runtime.sendMessage to the background script. */
export type BackgroundRequest =
  | { type: "toggleTab"; tabId: number }
  /** Translate the message of the tab again, past every cache; nothing happens while it is not translated. */
  | { type: "retranslateTab"; tabId: number }
  | { type: "getTabState"; tabId: number }
  | { type: "testProvider"; providerId: string; config: ProviderConfig; targetLang: string }
  | { type: "clearCache" }
  | { type: "cacheStats" }
  | { type: "getLocaleMessages"; uiLanguage: UiLanguageSetting }
  /** The settings page installed or deleted dictionary packs. */
  | { type: "dictionaryChanged" }
  /** A content script opens the settings page (content scripts cannot), e.g. at the offline downloads filtered to what a message needs. */
  | { type: "openOptions"; place: OptionsPlace }
  /** The notice about missing offline data stays away (or comes back) for these services and language pairs ("dictionary:ja>zh-Hans"). */
  | { type: "muteOfflinePairs"; pairs: string[]; muted: boolean }
  /** Answer: OfflineStatus of the offline services among the tiers, for these languages. */
  | { type: "offlineStatus"; sourceLang: string; targetLang: string; tiers: TierSettings }
  | BergamotRequest

/** Sent by the background script to the extension pages (popup, settings page, welcome page). */
export type PageNotice =
  /** Dictionary packs or offline models were installed or removed. */
  { type: "offlineDataChanged" }

/** State of the offline services in use (dictionary tier, Bergamot in the machine tier). */
export type OfflineStatus = Partial<Record<OfflineService, OfflineState>>

/** A place on the settings page: a section, the filters of the two offline lists, the tier whose services the service list shows. */
export interface OptionsPlace {
  section: "providers" | "dictionaries" | "bergamot"
  /** Filter terms of the dictionary list: language pairs ("en>zh-Hans") or parts of them. */
  dictionaries?: string[]
  /** Filter terms of the offline model list. */
  bergamot?: string[]
  tier?: Tier
}

/** Address of the settings page at a place: options.html?dict=…&bergamot=…&tier=…#section. */
export function optionsPath({ section, dictionaries, bergamot, tier }: OptionsPlace): string {
  const query = new URLSearchParams()
  if (dictionaries?.length) query.set("dict", dictionaries.join(","))
  if (bergamot?.length) query.set("bergamot", bergamot.join(","))
  if (tier) query.set("tier", tier)
  const search = query.size > 0 ? `?${query}` : ""
  return `options.html${search}#${section}`
}

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
  /** Retranslation: the cache and running requests for the same paragraph do not answer; the new result replaces the cached one. */
  bypassCache?: boolean
}

/** Result of one tier for one paragraph, and the answer to testProvider. A failure for lack of a dictionary pack or offline model names what is missing. */
export type TranslateResponse = { ok: true; text: string } | { ok: false; error: string; missing?: MissingData }

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
  /** Translate the displayed message again, past every cache. */
  | { type: "retranslate" }
  /** The result of one tier for request `id`. */
  | { type: "tier"; id: number; tier: Tier; result: TranslateResponse }
  /** Request `id` is complete; tiers that did not report were not asked. */
  | { type: "done"; id: number }
  /** Dictionary packs or offline models were installed or removed: results received before may be outdated. */
  | { type: "dataChanged" }

/** Messages sent from content scripts to background over the Port. */
export type PortReport =
  | { type: "state"; state: Omit<TabState, "connected"> }
  /** bypassCache: retranslation, the analysis of the message is made again. */
  | { type: "context"; context: MailContext; bypassCache?: boolean }
  | { type: "translate"; id: number; request: TranslateRequest }

export const CONTENT_PORT_NAME = "tt-content"
