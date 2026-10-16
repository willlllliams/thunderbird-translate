/*
 * WebExtension Experiment "translatedColumn" of the experimental build of
 * Multi Translate for Thunderbird (parent process, scope addon_parent).
 *
 * It adds the column "Translated subject" to the message list (thread pane)
 * with Thunderbird's internal module ThreadPaneColumns, which Thunderbird
 * 128 to 160 load from chrome://messenger/content/ThreadPaneColumns.mjs
 * (115 from thread-pane-columns.mjs). Thunderbird asks the column for the
 * text of a row synchronously, through textCallback, so the translations
 * live here: the background script of the extension pushes them with set(),
 * keyed by the subject as the message database holds it
 * (nsIMsgDBHdr.mime2DecodedSubject, the same text as MessageHeader.subject of
 * the WebExtension API), and refreshCustomColumn() makes every message list
 * fill its rows again. A message without a translation shows an empty cell.
 *
 * The column is removed when the extension is disabled, removed or updated
 * (onShutdown), and before it is added again, so that a reload of the
 * extension never finds the id taken.
 */

/* global ChromeUtils, Services */
"use strict"

var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs")
var { ExtensionUtils } = ChromeUtils.importESModule("resource://gre/modules/ExtensionUtils.sys.mjs")
var { ExtensionError } = ExtensionUtils

/** The id of the column; Thunderbird also uses it, in lower case, as the class of its cells. */
const COLUMN_ID = "multiTranslateSubjectCol"

/** The module URLs of ThreadPaneColumns, newest first. */
const MODULE_URLS = ["chrome://messenger/content/ThreadPaneColumns.mjs", "chrome://messenger/content/thread-pane-columns.mjs"]

/** Translations by subject; read by the column for every row it draws. */
const translations = new Map()

/** ThreadPaneColumns of this Thunderbird. */
function threadPaneColumns() {
  const errors = []
  for (const url of MODULE_URLS) {
    try {
      return ChromeUtils.importESModule(url).ThreadPaneColumns
    } catch (error) {
      errors.push(`${url}: ${error}`)
    }
  }
  throw new Error(`ThreadPaneColumns not found (${errors.join("; ")})`)
}

/** Whether the column is registered. */
function registered(columns) {
  return columns.getCustomColumns().some((column) => column.id === COLUMN_ID)
}

/** Remove the column when it is registered. */
function removeColumn() {
  const columns = threadPaneColumns()
  if (registered(columns)) columns.removeCustomColumn(COLUMN_ID)
}

/** The windows of the message lists (about:3pane) of every mail tab of every main window. */
function threePanes() {
  const panes = []
  for (const win of Services.wm.getEnumerator("mail:3pane")) {
    for (const tab of win.gTabmail?.tabInfo ?? []) {
      const pane = tab.chromeBrowser?.contentWindow
      if (pane?.threadPane && pane.threadTree) panes.push(pane)
    }
  }
  return panes
}

var translatedColumn = class extends ExtensionCommon.ExtensionAPI {
  onShutdown(isAppShutdown) {
    // Thunderbird closes: nothing to clean up.
    if (isAppShutdown) return
    translations.clear()
    try {
      removeColumn()
    } catch (error) {
      console.error("translatedColumn: the column could not be removed", error)
    }
    // Scripts of an experiment are cached; an updated version must load its own.
    Services.obs.notifyObservers(null, "startupcache-invalidate")
  }

  getAPI(context) {
    /** The about:3pane window of the mail tab `tabId`. */
    const paneOf = (tabId) => {
      const pane = context.extension.tabManager.get(tabId)?.nativeTab?.chromeBrowser?.contentWindow
      if (!pane?.threadPane) throw new ExtensionError(`Tab ${tabId} shows no message list`)
      return pane
    }
    return {
      translatedColumn: {
        /** Add the column with the header `name`, again with a new name when it exists. */
        async add(name) {
          const columns = threadPaneColumns()
          if (registered(columns)) columns.removeCustomColumn(COLUMN_ID)
          columns.addCustomColumn(COLUMN_ID, {
            name,
            hidden: false,
            resizable: true,
            sortable: false,
            textCallback: (msgHdr) => translations.get(msgHdr.mime2DecodedSubject) ?? "",
          })
        },

        /** Take over translations ([subject, translation] pairs) and fill the rows of every message list again. */
        async set(entries) {
          for (const [subject, translation] of entries) translations.set(subject, translation)
          threadPaneColumns().refreshCustomColumn(COLUMN_ID)
        },

        /** Forget every translation, e.g. for a new target language. */
        async clear() {
          translations.clear()
          threadPaneColumns().refreshCustomColumn(COLUMN_ID)
        },

        /**
         * Make the column visible in the folders the message lists show now. A folder with column settings of its own
         * keeps the column hidden until it is shown, as the column picker of the message list does.
         */
        async show() {
          let shown = 0
          for (const pane of threePanes()) {
            const column = pane.threadPane.columns?.find((c) => c.id === COLUMN_ID)
            if (!column || !column.hidden) continue
            column.hidden = false
            pane.threadPane.persistColumnStates()
            pane.threadPane.updateColumns(true)
            pane.threadTree.reset()
            shown++
          }
          return shown
        },

        /**
         * The state of the column in the mail tab `tabId`: whether it is registered and visible, and for the first `rows`
         * rows the subject, the text the column gives the row, and the text of its cell on screen (null for a row that
         * is not drawn).
         */
        async inspect(tabId, rows) {
          const pane = paneOf(tabId)
          const column = pane.threadPane.columns?.find((c) => c.id === COLUMN_ID)
          const view = pane.gDBView
          const count = Math.min(view?.rowCount ?? 0, rows)
          const list = []
          for (let index = 0; index < count; index++) {
            const msgHdr = view.getMsgHdrAt(index)
            const [text] = view.cellDataForColumns(index, [COLUMN_ID], {}, {})
            const cell = pane.threadTree.getRowAtIndex?.(index)?.querySelector(`.${COLUMN_ID.toLowerCase()}-column`)
            list.push({ subject: msgHdr.mime2DecodedSubject, text, cell: cell ? cell.textContent : null })
          }
          return {
            registered: registered(threadPaneColumns()),
            visible: Boolean(column && !column.hidden),
            // What the message list shows, whichever setting chose it: the preference mail.threadpane.listview
            // (Thunderbird 140 and later) or the XUL store (128). Only the table view has columns.
            tableView: pane.threadTree.getAttribute("rows") === "thread-row",
            translations: translations.size,
            rows: list,
          }
        },
      },
    }
  }
}
