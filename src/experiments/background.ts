/**
 * The background script of the experimental build (npm run
 * build:experimental), which no other build reads: the background script of
 * every build (background/index.ts), and the column "Translated subject" in
 * Thunderbird's message list through the experiment API translatedColumn
 * (translated-column/). column.ts decides what is translated and when.
 *
 * Like the background script it builds on, it registers its listeners in
 * its first run, so that an event that woke the background page reaches
 * them.
 */

import { backgroundParts } from "../background/index"
import { ext } from "../shared/ext"
import { loadExtensionI18n } from "../shared/i18n-ext"
import { browserDetector } from "../shared/lang-detect"
import { listedMessages } from "../shared/message-list"
import { toPublicSettings } from "../shared/settings"
import { onStoredSettings, readSettings } from "../shared/settings-store"
import { type ColumnApi, createColumnSync } from "./column"

const { service, settings } = backgroundParts

/** The experiment API of this build (translated-column/schema.json), which the types of the WebExtension API do not know. */
const column = () => (browser as unknown as { translatedColumn: ColumnApi }).translatedColumn

/** The header of the column in the interface language of the settings. */
const columnName = async (uiLanguage: unknown) => (await loadExtensionI18n(uiLanguage)).t("columnTranslatedSubject")

let uiLanguage = settings.current().uiLanguage
let header = ""

const sync = createColumnSync({
  api: {
    add: (name) => column().add(name),
    set: (entries) => column().set(entries),
    clear: () => column().clear(),
    show: () => column().show(),
  },
  ready: settings.ready,
  settings: () => toPublicSettings(settings.current(), settings.credentials()),
  columnName: () => header,
  translate: (request, onTier, options) => service.translateForPage(request, onTier, options),
  listed: listedMessages,
  activeMailTabs: async () => (await browser.mailTabs.query({ active: true })).map((tab) => tab.id),
  detect: browserDetector(ext.i18n),
})

/** Add the column with the header of the interface language of the settings. */
async function addColumn(): Promise<void> {
  await settings.ready()
  uiLanguage = settings.current().uiLanguage
  header = await columnName(uiLanguage)
  await sync.addColumn()
}

/* ---------- listeners: all of them in this first run ---------- */

browser.mailTabs.onDisplayedFolderChanged.addListener((tab) => sync.folderChanged(tab.id))
// Another mail tab comes to the front; a tab of another kind is no mail tab, and mailTabs.get() refuses it.
browser.tabs.onActivated.addListener(({ tabId }) => {
  void browser.mailTabs.get(tabId).then(
    () => sync.translateTab(tabId),
    () => {},
  )
})
browser.messages.onNewMailReceived.addListener(() => void sync.translateActive())
onStoredSettings((stored) => {
  void sync.settingsChanged()
  if (readSettings(stored).uiLanguage !== uiLanguage) void addColumn().catch((error) => console.error("translatedColumn:", error))
})
ext.runtime.onInstalled.addListener((details) => {
  // After a new installation the column shows in the folders on screen; elsewhere the column picker of the message list shows it.
  if (details.reason === "install") void addColumn().then(() => column().show()).catch((error) => console.error("translatedColumn:", error))
})

void addColumn()
  .then(() => sync.translateActive())
  .catch((error) => console.error("translatedColumn:", error))
