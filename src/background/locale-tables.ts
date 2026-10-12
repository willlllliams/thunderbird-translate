/**
 * The interface messages of each language for the content scripts, which
 * get them from the background script instead of fetching moz-extension://
 * URLs. Each language is read and compiled once: every displayed message
 * asks for them.
 */

import { loadI18n } from "../shared/i18n"
import { fetchPackagedMessages } from "../shared/i18n-ext"
import { resolveUiLocale } from "../shared/locales"
import type { LocaleMessages } from "../shared/messages"

/** The messages of the language a setting names; "auto" follows `uiLang`, Thunderbird's language. */
export function createLocaleTables(uiLang: string): (setting: unknown) => Promise<LocaleMessages> {
  const tables = new Map<string, Promise<LocaleMessages>>()
  return (setting) => {
    const locale = resolveUiLocale(setting, uiLang)
    let table = tables.get(locale)
    if (!table) {
      // English in place of a locale whose file could not be read is not kept: the next request reads the file again.
      table = loadI18n(locale, uiLang, fetchPackagedMessages).then((i18n) => {
        if (i18n.locale !== locale) tables.delete(locale)
        return { locale: i18n.locale, messages: i18n.messages }
      })
      tables.set(locale, table)
    }
    return table
  }
}
