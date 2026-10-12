import type { MissingData } from "./errors"
import { ext } from "./ext"
import type { OfflineService, OfflineState } from "./offline-needs"
import type { MessageTable } from "./i18n"
import type { UiLanguageSetting, UiLocale } from "./locales"
import type { MailContext } from "./mail-context"
import type { Tier } from "./providers"
import type { ProviderConfig, PublicSettings, TierSettings } from "./settings"

/** Fields of a request that carries nothing besides its type. */
type NoFields = Record<never, never>

/**
 * The requests that runtime.sendMessage carries to the background script:
 * the fields of each request (besides `type`) and the answer.
 */
export interface BackgroundApi {
  toggleTab: { req: { tabId: number }; res: void }
  /** Translate the message of the tab again, past every cache; nothing happens while it is not translated. */
  retranslateTab: { req: { tabId: number }; res: void }
  getTabState: { req: { tabId: number }; res: TabState }
  testProvider: { req: { providerId: string; config: ProviderConfig; targetLang: string }; res: TranslateResponse }
  clearCache: { req: NoFields; res: void }
  cacheStats: { req: NoFields; res: { size: number } }
  getLocaleMessages: { req: { uiLanguage: UiLanguageSetting }; res: LocaleMessages }
  /** The settings page installed or deleted dictionary packs. */
  dictionaryChanged: { req: NoFields; res: void }
  /** A content script opens the settings page (content scripts cannot), e.g. at the offline downloads filtered to what a message needs. */
  openOptions: { req: { place: OptionsPlace }; res: void }
  /** The notice about missing offline data stays away (or comes back) for these services and language pairs ("dictionary:ja>zh-Hans"). */
  muteOfflinePairs: { req: { pairs: string[]; muted: boolean }; res: void }
  /** The offline services among the tiers, for these languages. */
  offlineStatus: { req: { sourceLang: string; targetLang: string; tiers: TierSettings }; res: OfflineStatus }
  /** The directions of an offline service; `refresh` reads its catalog again, `tag` names the release of the dictionary packs (the page's, which may not be saved yet). */
  offlineList: { req: { service: OfflineService; refresh?: boolean; tag?: string }; res: OfflineListResult }
  /** Installs directions in the background script, also after the page is closed; answers when every one of them has ended, with the result of each in the order of `pairs`. */
  offlineInstall: { req: { service: OfflineService; pairs: OfflinePair[]; tag?: string }; res: OfflineResult[] }
  /** Cancels the installation of a direction. */
  offlineCancel: { req: { service: OfflineService } & OfflinePair; res: void }
  /** The installations of every service that have not ended. */
  offlineProgress: { req: NoFields; res: OfflineProgress }
  offlineRemove: { req: { service: OfflineService } & OfflinePair; res: OfflineResult }
  /** Offline models; `refresh` reads Mozilla's model list again. */
  bergamotList: { req: { refresh?: boolean }; res: BergamotResult }
  /** Answers when the installation ends. */
  bergamotInstall: { req: { src: string; tgt: string }; res: BergamotResult }
  bergamotCancel: { req: { src: string; tgt: string }; res: void }
  bergamotProgress: { req: NoFields; res: BergamotProgress }
  bergamotRemove: { req: { src: string; tgt: string }; res: BergamotResult }
}

export type RequestType = keyof BackgroundApi

/** The request of type K. Distributes over a union of types, so RequestOf<"a" | "b"> is the union of both requests. */
export type RequestOf<K extends RequestType> = K extends RequestType ? { type: K } & BackgroundApi[K]["req"] : never

/** Any request to the background script. */
export type BackgroundRequest = RequestOf<RequestType>

/** The answer of the background script to a request of type K. */
export type ResponseOf<K extends RequestType> = BackgroundApi[K]["res"]

/** One handler per request type, as the background script implements them. */
export type BackgroundHandlers = { [K in RequestType]: (req: RequestOf<K>) => ResponseOf<K> | Promise<ResponseOf<K>> }

/** Send a request to the background script; resolves with its answer. */
export function send<R extends BackgroundRequest>(req: R): Promise<ResponseOf<R["type"]>> {
  return ext.runtime.sendMessage(req) as Promise<ResponseOf<R["type"]>>
}

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

/** Dictionary packs and offline models, handled by the background script (background/offline-admin.ts). */
export type OfflineRequest = RequestOf<"offlineList" | "offlineInstall" | "offlineCancel" | "offlineProgress" | "offlineRemove" | "bergamotList" | "bergamotInstall" | "bergamotCancel" | "bergamotProgress" | "bergamotRemove">

/** A direction of an offline service. */
export interface OfflinePair {
  src: string
  tgt: string
}

/** A direction as the lists of the pages show it. */
export type OfflineItem = DictionaryPackInfo | BergamotPairInfo

/** The directions of a service; `error` with ok: why its catalog is missing and only the installed directions are listed. */
export type OfflineListResult = { ok: true; items: OfflineItem[]; error?: string } | { ok: false; error: string }

/** How an installation or a removal ended. */
export type OfflineResult = { ok: true } | { ok: false; error?: string; cancelled?: true }

/** An installation that has not ended: waiting for its turn or running, bytes received and expected. */
export interface InstallProgress {
  state: "queued" | "running"
  done: number
  total: number
}

/** The installations that have not ended, by service and pair key. */
export type OfflineProgress = Partial<Record<OfflineService, Record<string, InstallProgress>>>

/** An offline model pair as the settings page lists it. */
export interface BergamotPairInfo {
  src: string
  tgt: string
  /** Version offered by Mozilla, or the installed version for pairs no longer offered. */
  version: string
  architecture: string
  /** Download size (compressed). */
  bytes: number
  /** Size after decompression. */
  rawBytes: number
  installed: boolean
  /** Installed version when it differs from `version` (an update is available). */
  installedVersion?: string
}

/** A dictionary pack as the settings page lists it: the entry of the release index, or the stored description when it is installed. */
export interface DictionaryPackInfo {
  src: string
  tgt: string
  /** Size of the compressed file. */
  bytes: number
  entries: number
  license: string
  attribution: string
  installed: boolean
  /** Version of an installed pack; the index names none. */
  version?: string
}

export type BergamotResult = { ok: true; pairs?: BergamotPairInfo[] } | { ok: false; error?: string; cancelled?: true }

/** Running installations by "src>tgt": bytes done and total. */
export type BergamotProgress = Record<string, { done: number; total: number }>

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
  /** Dictionary packs or offline models were installed or removed: results received before may be outdated. Pages get the same notice (PageNotice). */
  | { type: "offlineDataChanged" }

/** Messages sent from content scripts to background over the Port. */
export type PortReport =
  | { type: "state"; state: Omit<TabState, "connected"> }
  /** bypassCache: retranslation, the analysis of the message is made again. */
  | { type: "context"; context: MailContext; bypassCache?: boolean }
  | { type: "translate"; id: number; request: TranslateRequest }

export const CONTENT_PORT_NAME = "tt-content"

/** A test for messages of the given types, told apart by their type field; the other fields come from the extension itself and are not checked. */
function ofTypes<T extends { type: string }>(types: Record<T["type"], true>) {
  const known = new Set<unknown>(Object.keys(types))
  return (msg: unknown): msg is T => typeof msg === "object" && msg !== null && known.has((msg as { type?: unknown }).type)
}

/** A push of the background script, as the content script receives it over the Port. */
export const isPortPush = /* @__PURE__ */ ofTypes<PortPush>({ settings: true, toggle: true, retranslate: true, tier: true, done: true, offlineDataChanged: true })

/** A report of a content script, as the background script receives it over the Port. */
export const isPortReport = /* @__PURE__ */ ofTypes<PortReport>({ state: true, context: true, translate: true })
