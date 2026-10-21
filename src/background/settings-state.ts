/**
 * The settings of the background script: read from storage.local when it
 * starts, stored again in the current form when reading migrated them, then
 * taken over from every change made elsewhere (storage.onChanged).
 *
 * A failure of storage leaves the extension working: when the settings
 * cannot be read, the defaults apply and the next request reads them again;
 * when the migrated settings cannot be written back, they apply all the
 * same. A change taken over before the first read ended is newer than what
 * the read returns, so the read neither applies nor writes back its result.
 */

import { credentialsOf, SETTINGS_KEY, type Settings } from "../shared/settings"
import { readSettings } from "../shared/settings-store"
import type { KeyValueStorage } from "./cache"

export interface SettingsStateDeps {
  /** storage.local. */
  storage: KeyValueStorage
  /** Called at once; the settings are read after the returned promise settles (the hook of the e2e build). */
  beforeRead?: () => Promise<void>
  /** Called with the settings of the first read and of every change. */
  onAdopt: (settings: Settings) => void
  /** Applies the interface language: after the first read, and after a change to another language. */
  onUiLanguage: (settings: Settings) => Promise<void>
  /** Records a failure that the extension works around; console.warn by default. */
  warn?: (message: string, error: unknown) => void
}

export interface SettingsState {
  /** The settings now; the defaults until the first read. */
  current(): Settings
  /**
   * Settles once the settings are read, stored in the current form and their
   * interface language applied; never rejects. After a failed read the
   * defaults apply and the next call reads again.
   */
  ready(): Promise<void>
  /** Takes over settings written elsewhere. */
  adopt(stored: unknown): void
  /** Counts the changes of the credentials of the services (credentialsOf()) it took over. */
  credentials(): number
}

const defaultWarn = (message: string, error: unknown) => console.warn(`[thunderbird-translate] ${message}`, error)

export function createSettingsState({ storage, beforeRead, onAdopt, onUiLanguage, warn = defaultWarn }: SettingsStateDeps): SettingsState {
  let settings = readSettings(undefined)
  /** A change was taken over: newer than anything a read still running returns. */
  let adopted = false
  /** The settings were read: no more reads. */
  let done = false
  let pending: Promise<void> | null = null
  let credentials = 0
  const apply = (stored: unknown) => {
    const before = credentialsOf(settings)
    settings = readSettings(stored)
    if (credentialsOf(settings) !== before) credentials++
    onAdopt(settings)
  }
  const uiLanguage = () => onUiLanguage(settings).catch((error) => warn("could not apply the interface language", error))
  const before = (beforeRead?.() ?? Promise.resolve()).catch((error) => warn("the hook before reading the settings failed", error))

  async function load(): Promise<void> {
    await before
    let stored: unknown
    try {
      stored = await storage.get(SETTINGS_KEY)
    } catch (error) {
      warn("could not read the settings; the defaults apply until the next request reads them again", error)
      if (!adopted) apply(undefined)
      await uiLanguage()
      return
    }
    done = true
    if (!adopted) {
      apply(stored)
      // A fresh installation, or settings that reading migrated (earlier forms, copies of built-in prompts): store them in the current form.
      if (JSON.stringify(settings) !== JSON.stringify(stored)) await storage.set(SETTINGS_KEY, settings).catch((error) => warn("could not store the settings in their current form", error))
    }
    await uiLanguage()
  }

  const ready = (): Promise<void> => {
    if (pending) return pending
    // Read, or a change taken over, which holds the settings a read would return.
    if (done || adopted) return Promise.resolve()
    const started = load().finally(() => {
      if (pending === started) pending = null
    })
    pending = started
    return started
  }
  void ready()

  return {
    current: () => settings,
    credentials: () => credentials,
    ready,
    adopt(stored) {
      adopted = true
      const previous = settings.uiLanguage
      apply(stored)
      if (settings.uiLanguage !== previous) void uiLanguage()
    },
  }
}
