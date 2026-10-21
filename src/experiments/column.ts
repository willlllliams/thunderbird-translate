/**
 * The column "Translated subject" of the experimental build: the background
 * script translates the subjects listed in a mail tab and hands the
 * translations to the experiment API translatedColumn
 * (translated-column/implementation.js), which shows them in a column of
 * Thunderbird's message list.
 *
 * The subjects of the first LIST_SIZE messages of the list are translated
 * when a mail tab shows a folder (and again one and three seconds later,
 * while Thunderbird fills a folder), when a mail tab becomes active, when
 * new mail arrives and when the extension starts. They go through the
 * translation service like the subjects of the page of translated subjects
 * (TranslationService.translateForPage, the same batches, cache and consent
 * rules): the column cannot ask, so an online service that the user has not
 * allowed yet translates nothing, and only the tiers allowed or offline
 * fill the column. The highest tier that answered is shown; reply and
 * forward prefixes stay as they are; a subject already in the target
 * language stays empty. A change of the languages or of a service of the
 * tiers empties the column and translates again. An AI translation shows
 * without its Markdown marks while the Markdown switch is on; a change of
 * the switch shows the translations again without a request.
 */

import { hasTranslatableText } from "../content/text"
import type { MessageHeader } from "../shared/ext"
import { isInTargetLanguage, type LanguageDetector } from "../shared/lang-detect"
import { stripMarkdown } from "../shared/markdown"
import type { TranslateRequest, TranslateResponse } from "../shared/messages"
import type { Tier } from "../shared/providers"
import type { PublicSettings } from "../shared/settings"
import { splitSubject } from "../shared/subject"

/** Messages whose subjects are translated, from the top of the list. */
export const LIST_SIZE = 100
/** Translations go to the column together, at most this often. */
export const PUSH_DELAY_MS = 200
/** After a change of folder the list is read again after these delays, as the page of translated subjects does. */
export const SETTLE_DELAYS_MS = [1000, 3000]

/** The experiment API (translated-column/schema.json). */
export interface ColumnApi {
  add(name: string): Promise<void>
  set(entries: [string, string][]): Promise<void>
  clear(): Promise<void>
  show(): Promise<number>
}

export interface ColumnDeps {
  api: ColumnApi
  /** Settles once the settings are read. */
  ready: () => Promise<void>
  /** The settings the content scripts get: languages, tiers in use and their signatures. */
  settings: () => PublicSettings
  /** The header of the column in the interface language. */
  columnName: () => string
  /** TranslationService.translateForPage. */
  translate: (request: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void, options: { sample: boolean }) => Promise<void>
  /** The first `count` messages listed in a mail tab. */
  listed: (tabId: number, count: number) => Promise<MessageHeader[]>
  /** The ids of the mail tabs that are active in their window. */
  activeMailTabs: () => Promise<number[]>
  detect?: LanguageDetector
}

export interface ColumnSync {
  /** Adds the column (again, with the header of a new interface language). */
  addColumn(): Promise<void>
  /** Translates the subjects listed in a mail tab. */
  translateTab(tabId: number): Promise<void>
  /** Translates the listed subjects of the active mail tabs. */
  translateActive(): Promise<void>
  /** A mail tab shows another folder: translate now and again while Thunderbird fills the list. */
  folderChanged(tabId: number): void
  /** The settings changed: with other languages or services, the column is emptied and translated again. */
  settingsChanged(): Promise<void>
}

/** What decides the translations of the column: languages, the services (signatures) of the tiers and the services still waiting for consent. */
const columnKey = (s: PublicSettings) => JSON.stringify([s.sourceLang, s.targetLang, s.tiers, s.signatures, s.consent.map((need) => need.id)])

/** The first `count` messages listed in the mail tab `tabId`, read page by page; the rest of the list is aborted. */
export async function listedMessages(tabId: number, count: number): Promise<MessageHeader[]> {
  let list = await browser.mailTabs.getListedMessages(tabId)
  const messages = [...list.messages]
  while (messages.length < count && list.id !== null) {
    list = await browser.messages.continueList(list.id)
    messages.push(...list.messages)
  }
  if (list.id !== null) await browser.messages.abortList(list.id).catch(() => {})
  return messages.slice(0, count)
}

export function createColumnSync({ api, ready, settings, columnName, translate, listed, activeMailTabs, detect }: ColumnDeps): ColumnSync {
  /** Subjects asked for under the current key, with the rank of the tier shown (-1: none yet). */
  const asked = new Map<string, number>()
  let key = ""
  /** Increased by a change of key: answers to an older key are dropped. */
  let generation = 0
  /** The result shown for each subject: its prefixes, the text the tier returned and whether the AI tier returned it. */
  const results = new Map<string, { prefix: string; text: string; ai: boolean }>()
  /** The Markdown switch the column was filled with. */
  let markdown = true
  const pending = new Map<string, string>()
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  const settleTimers = new Map<number, ReturnType<typeof setTimeout>[]>()

  function push(): void {
    pushTimer = undefined
    if (pending.size === 0) return
    const entries = [...pending]
    pending.clear()
    void api.set(entries).catch(() => {})
  }

  function show(subject: string): void {
    const { prefix, text, ai } = results.get(subject)!
    pending.set(subject, `${prefix}${ai && markdown ? stripMarkdown(text) : text}`)
    pushTimer ??= setTimeout(push, PUSH_DELAY_MS)
  }

  /** The Markdown switch of `s`: a change shows every result again. */
  function followMarkdown(s: PublicSettings): void {
    if (s.renderMarkdown === markdown) return
    markdown = s.renderMarkdown
    for (const subject of results.keys()) show(subject)
  }

  async function translateSubject(subject: string, s: PublicSettings, run: number): Promise<void> {
    const { prefix, text } = splitSubject(subject)
    if (!hasTranslatableText(text) || (await isInTargetLanguage(text, s.targetLang, detect, s.sourceLang))) return
    const request: TranslateRequest = { text, sourceLang: s.sourceLang, targetLang: s.targetLang, tiers: s.tiers }
    await translate(
      request,
      (tier, result) => {
        const rank = s.tiers.indexOf(tier)
        if (run !== generation || !result.ok || !result.text.trim() || rank < (asked.get(subject) ?? -1)) return
        asked.set(subject, rank)
        results.set(subject, { prefix, text: result.text, ai: tier === "ai" })
        show(subject)
      },
      { sample: false },
    )
  }

  async function translateTab(tabId: number): Promise<void> {
    await ready()
    const s = settings()
    followMarkdown(s)
    if (columnKey(s) !== key) await reset(columnKey(s))
    const run = generation
    const messages = await listed(tabId, LIST_SIZE).catch(() => [])
    const subjects = [...new Set(messages.map((m) => m.subject).filter((subject): subject is string => typeof subject === "string"))].filter((subject) => !asked.has(subject))
    for (const subject of subjects) asked.set(subject, -1)
    await Promise.all(subjects.map((subject) => translateSubject(subject, s, run).catch(() => asked.delete(subject))))
  }

  async function translateActive(): Promise<void> {
    const tabs = await activeMailTabs().catch(() => [])
    await Promise.all(tabs.map((tabId) => translateTab(tabId)))
  }

  /** Forget what the column shows, for the settings of `next`. */
  async function reset(next: string): Promise<void> {
    key = next
    generation++
    asked.clear()
    results.clear()
    pending.clear()
    await api.clear().catch(() => {})
  }

  async function settingsChanged(): Promise<void> {
    await ready()
    const s = settings()
    followMarkdown(s)
    const next = columnKey(s)
    if (next === key) return
    await reset(next)
    await translateActive()
  }

  return {
    addColumn: async () => {
      await ready()
      await api.add(columnName())
    },
    translateTab,
    translateActive,
    folderChanged(tabId) {
      for (const timer of settleTimers.get(tabId) ?? []) clearTimeout(timer)
      settleTimers.set(
        tabId,
        SETTLE_DELAYS_MS.map((delay) => setTimeout(() => void translateTab(tabId), delay)),
      )
      void translateTab(tabId)
    },
    settingsChanged,
  }
}
