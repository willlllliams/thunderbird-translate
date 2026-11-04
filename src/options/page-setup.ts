/**
 * The start the settings page and the setup guide share: the session with its notes about saving, the offline lists,
 * the prompts and the style controls, the interface language that follows the setting with its select, the progress
 * of the downloads that other pages started, and the filters of the offline lists.
 */

import { ext } from "../shared/ext"
import { followUiLanguage, loadExtensionI18n } from "../shared/i18n-ext"
import { normalizeUiLanguageSetting } from "../shared/locales"
import { $, showSaved, showSaveError } from "../shared/page"
import type { PromptName } from "../shared/prompts"
import type { Settings } from "../shared/settings"
import type { BergamotSection } from "./bergamot"
import type { DictionarySection } from "./dictionaries"
import { loadSystemLanguages } from "./offline-list"
import { offlineSections } from "./offline-sections"
import { PromptEditor } from "./prompt-editor"
import { SettingsSession } from "./session"
import { mountStyleControls } from "./style-controls"

export interface SettingsPage {
  session: SettingsSession
  settings: Settings
  dictionaries: DictionarySection
  bergamot: BergamotSection
  prompts: PromptEditor
  /** The interface language set on the page: stored with the next save, the page redrawn in it. */
  changeUiLanguage: (value: unknown) => Promise<void>
}

export async function openSettingsPage(page: {
  /** The prompts the page edits; all of them when absent. */
  kinds?: readonly PromptName[]
  offline?: Parameters<typeof offlineSections>[1]
  /** Draws the sample of the style. */
  stylePreview: () => void
  /** Writes every text of the page in the interface language of the moment. */
  applyLanguage: () => void
  onRemoteChange: (before: Settings) => void
}): Promise<SettingsPage> {
  const session = await SettingsSession.open()
  const settings = session.settings
  session.onRemoteChange = page.onRemoteChange
  session.onSaved = showSaved
  session.onSaveError = showSaveError
  const { dictionaries, bergamot } = offlineSections(() => settings, page.offline)
  const prompts = page.kinds ? new PromptEditor($("promptEditor"), session, page.kinds) : new PromptEditor($("promptEditor"), session)
  mountStyleControls($("styleControls"), session, page.stylePreview)
  await Promise.all([loadExtensionI18n(settings.uiLanguage), loadSystemLanguages()])
  const followLanguage = followUiLanguage(settings.uiLanguage, page.applyLanguage)
  const changeUiLanguage = async (value: unknown) => {
    settings.uiLanguage = normalizeUiLanguageSetting(value)
    await followLanguage(settings.uiLanguage)
  }
  const uiLanguage = $<HTMLSelectElement>("uiLanguage")
  uiLanguage.addEventListener("change", () => {
    void changeUiLanguage(uiLanguage.value)
    session.save()
  })
  // The progress of the downloads, also those another page started, and installed or deleted packs and models.
  ext.runtime.onMessage.addListener((message: unknown) => {
    dictionaries.receive(message)
    bergamot.receive(message)
  })
  $("dictFilter").addEventListener("input", () => dictionaries.render())
  $("bergamotFilter").addEventListener("input", () => bergamot.render())
  return { session, settings, dictionaries, bergamot, prompts, changeUiLanguage }
}
