/** WebExtension glue for the i18n runtime (extension pages and background). */

import { ext } from "./ext"
import { compileMessagesJson, EN_MESSAGES, type I18n, loadI18n, setI18n, useEnglishMessages } from "./i18n"
import type { UiLocale } from "./locales"

/** Thunderbird's UI language, e.g. "de" or "zh-TW". */
export function thunderbirdUiLanguage(): string {
  try {
    return ext.i18n.getUILanguage()
  } catch {
    return "en"
  }
}

/** Read `_locales/<locale>/messages.json` packaged with the extension. */
export async function fetchPackagedMessages(locale: UiLocale): Promise<unknown> {
  const resp = await fetch(ext.runtime.getURL(`_locales/${locale}/messages.json`))
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

/** The English table of a page, read once from the packaged file when the bundle came without it. */
let english: Promise<void> | null = null

function ensureEnglish(): Promise<void> {
  if (Object.keys(EN_MESSAGES).length > 0) return Promise.resolve()
  english ??= fetchPackagedMessages("en").then(
    (json) => useEnglishMessages(compileMessagesJson(json)),
    () => {
      // Without the file the keys show; the next load tries again.
      english = null
    },
  )
  return english
}

/** Load the locale for a setting value and make it the current instance, with the English table as its fallback. */
export async function loadExtensionI18n(setting: unknown): Promise<I18n> {
  await ensureEnglish()
  const i18n = await loadI18n(setting, thunderbirdUiLanguage(), fetchPackagedMessages)
  setI18n(i18n)
  return i18n
}

/**
 * Follow the interface language of a page that loaded the locale of `current`: the function it returns loads the
 * locale of a new setting and runs `redraw`, and does nothing for the setting it has. Loads run one after the other
 * and only the latest setting is drawn, so two quick changes cannot end in the first language.
 */
export function followUiLanguage(current: unknown, redraw: () => void | Promise<void>): (setting: unknown) => Promise<void> {
  let latest = current
  let done = Promise.resolve()
  return (setting) => {
    if (setting === latest) return done
    latest = setting
    done = done.then(async () => {
      if (setting !== latest) return
      await loadExtensionI18n(setting)
      if (setting === latest) await redraw()
    })
    return done
  }
}
