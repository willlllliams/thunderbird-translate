/**
 * The page of translated subjects (subjects.html), the popup of the
 * extension's button in the main toolbar. It lists the messages of the
 * message list of a mail tab, PAGE_SIZE at first and PAGE_SIZE more with
 * every "Show more": sender, date, subject and the translated subject, which
 * goes through the tiers like a paragraph of a message (a lower tier first,
 * the highest tier replacing it). Clicking a row selects its message in the
 * mail tab, which shows it. The list is read again when the mail tab shows
 * another folder and, shortly after, when messages arrive, are deleted or
 * moved.
 *
 * The page follows the mail tab of the window it was opened in; "Open in a
 * window" opens it in a window of its own (subjects.html?tab=<id>) that
 * follows that mail tab, so it stays open while you read.
 *
 * The calls of the mail APIs name the `browser` namespace directly rather
 * than going through shared/ext.ts, so that a review of the shipped code
 * sees which API each one uses (messagesRead, accountsRead).
 *
 * The subjects are translated through the background script under the Port
 * name of this page (SUBJECTS_PORT_NAME): they come from real messages, so
 * the cache and the consent rules of a message apply, and before subjects
 * first go to an online service the page asks with the consent panel.
 */

import { connectContent } from "../content/client"
import { describeError, firstLine, truncate } from "../shared/errors"
import type { MessageHeader } from "../shared/ext"
import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n } from "../shared/i18n-ext"
import type { TabState } from "../shared/messages"
import { $ } from "../shared/page"
import { SETTINGS_KEY } from "../shared/settings"
import { loadSettings, readSettings } from "../shared/settings-store"
import { splitSubject } from "../shared/subject"
import { subjectsProbe } from "../hooks/subjects"
import { CLS_CELL, collectCells, Listing, PAGE_SIZE, RELOAD_DELAY_MS, rowKey, senderName, SETTLE_DELAYS_MS } from "./list"

/** Size of the window of "Open in a window". */
const WINDOW_SIZE = { width: 960, height: 640 }

async function main(): Promise<void> {
  const settings = await loadSettings()
  let uiLanguage = settings.uiLanguage
  await loadExtensionI18n(uiLanguage)
  localizeDocument()

  const params = new URLSearchParams(location.search)
  const ownWindow = params.has("tab")
  const tabId = ownWindow ? Number(params.get("tab")) : (await browser.mailTabs.getCurrent())?.id
  const status = $<HTMLParagraphElement>("status")
  const progress = $<HTMLParagraphElement>("progress")
  const rows = $<HTMLTableSectionElement>("rows")
  const table = $<HTMLTableElement>("subjects")
  const more = $<HTMLButtonElement>("more")
  const openWindow = $<HTMLButtonElement>("openWindow")
  const listing = new Listing()
  /** Increased by every load: an older load that ends later changes nothing. */
  let generation = 0
  let lastState: Omit<TabState, "connected"> | null = null
  let error = ""

  const client = connectContent({
    root: () => $("list"),
    subjects: { collect: collectCells, mode: "translation-only" },
    onState: (state) => {
      lastState = state
      showStatus()
    },
  })

  function showStatus(): void {
    table.hidden = listing.shown.length === 0
    more.hidden = !listing.hasMore
    if (tabId === undefined || Number.isNaN(tabId)) status.textContent = t("subjectsNoMailTab")
    else if (error) status.textContent = t("subjectsReadFailed", [truncate(firstLine(error), 120)])
    else if (listing.shown.length === 0) status.textContent = t("subjectsEmpty")
    else status.textContent = t(listing.hasMore ? "subjectsShownMore" : "subjectsShown", [listing.shown.length])
    status.title = error
    // While subjects are being translated: how many have their final translation.
    const state = lastState
    progress.hidden = !state?.active || state.total === 0 || state.done + state.failed === state.total
    if (state && !progress.hidden) progress.textContent = t("subjectsProgress", [state.done, state.total])
  }

  async function select(row: HTMLTableRowElement): Promise<void> {
    if (tabId === undefined) return
    for (const other of Array.from(rows.querySelectorAll("[aria-selected=true]"))) other.removeAttribute("aria-selected")
    row.setAttribute("aria-selected", "true")
    try {
      await browser.mailTabs.setSelectedMessages(tabId, [Number(row.dataset.id)])
      error = ""
    } catch (e) {
      error = describeError(e, getI18n())
    }
    showStatus()
  }

  function row(message: MessageHeader): HTMLTableRowElement {
    const tr = document.createElement("tr")
    tr.dataset.id = String(message.id)
    tr.tabIndex = 0
    tr.title = t("tipSubjectsRow")
    const date = new Date(message.date)
    const subject = typeof message.subject === "string" ? message.subject : ""
    const { prefix, text } = splitSubject(subject)
    const cells = [
      Object.assign(document.createElement("td"), { className: "from", textContent: senderName(message.author ?? ""), title: message.author ?? "" }),
      Object.assign(document.createElement("td"), {
        className: "date",
        textContent: Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(getI18n().lang, { dateStyle: "short", timeStyle: "short" }).format(date),
      }),
      Object.assign(document.createElement("td"), { className: "subject", textContent: subject }),
    ]
    const translated = document.createElement("td")
    translated.className = "translated"
    if (prefix) translated.append(Object.assign(document.createElement("span"), { className: "prefix", textContent: prefix }))
    const cell = document.createElement("span")
    cell.className = CLS_CELL
    cell.dataset.text = text
    translated.append(cell)
    tr.append(...cells, translated)
    tr.addEventListener("click", () => void select(tr))
    tr.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return
      e.preventDefault()
      void select(tr)
    })
    return tr
  }

  /** Draw the rows and translate their subjects; the controller remembers what it already translated. */
  async function render(): Promise<void> {
    client.controller.stop()
    rows.replaceChildren(...listing.shown.map(row))
    showStatus()
    await client.ready
    if (listing.shown.length > 0) await client.controller.start()
  }

  /** Read the list of the mail tab again, keeping at least as many messages as are shown. */
  /** Read the list of the mail tab again, keeping at least as many messages as are shown; the rows are drawn again only when the list changed. */
  async function reload(): Promise<void> {
    if (tabId === undefined || Number.isNaN(tabId)) return showStatus()
    const run = ++generation
    const before = rowKey(listing.shown)
    const hadError = error
    try {
      await listing.load(tabId, Math.max(PAGE_SIZE, listing.shown.length), () => run === generation)
      if (run !== generation) return
      error = ""
    } catch (e) {
      if (run !== generation) return
      listing.shown = []
      error = describeError(e, getI18n())
    }
    if (rowKey(listing.shown) === before && error === hadError && rows.childElementCount === listing.shown.length) return showStatus()
    await render()
  }

  /**
   * A folder that is shown for the first time, or whose messages are still being downloaded, fills its message list
   * after the change of folder, and no event says when. The list is read again SETTLE_DELAYS_MS after the change.
   */
  let settleTimers: ReturnType<typeof setTimeout>[] = []
  function settle(): void {
    for (const timer of settleTimers) clearTimeout(timer)
    settleTimers = SETTLE_DELAYS_MS.map((delay) => setTimeout(() => void reload(), delay))
  }

  more.addEventListener("click", async () => {
    const run = generation
    more.disabled = true
    try {
      await listing.more(() => run === generation)
    } catch (e) {
      error = describeError(e, getI18n())
    }
    more.disabled = false
    if (run === generation) await render()
  })

  openWindow.hidden = ownWindow || tabId === undefined
  openWindow.addEventListener("click", () => {
    void ext.windows.create({ type: "popup", url: ext.runtime.getURL(`subjects.html?tab=${tabId}`), ...WINDOW_SIZE })
    window.close()
  })

  let reloadTimer: ReturnType<typeof setTimeout> | undefined
  const reloadSoon = () => {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => void reload(), RELOAD_DELAY_MS)
  }
  const onFolder = (tab: { id?: number }) => {
    if (tab.id !== tabId) return
    void reload()
    settle()
  }
  browser.mailTabs.onDisplayedFolderChanged.addListener(onFolder)
  browser.messages.onNewMailReceived.addListener(reloadSoon)
  browser.messages.onDeleted.addListener(reloadSoon)
  browser.messages.onMoved.addListener(reloadSoon)
  // The page goes once: its listeners and timers go with it.
  addEventListener("pagehide", () => {
    clearTimeout(reloadTimer)
    for (const timer of settleTimers) clearTimeout(timer)
    listing.abort()
    browser.mailTabs.onDisplayedFolderChanged.removeListener(onFolder)
    browser.messages.onNewMailReceived.removeListener(reloadSoon)
    browser.messages.onDeleted.removeListener(reloadSoon)
    browser.messages.onMoved.removeListener(reloadSoon)
  }, { once: true })

  // A new interface language: the labels of the page and of its rows.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return
    const next = readSettings(changes[SETTINGS_KEY].newValue).uiLanguage
    if (next === uiLanguage) return
    uiLanguage = next
    void loadExtensionI18n(uiLanguage).then(() => {
      localizeDocument()
      return render()
    })
  })

  // Test build (npm run e2e): the probe reads the rows and clicks one.
  subjectsProbe?.({ client, tabId, reload })
  await reload()
  settle()
}

void main()
