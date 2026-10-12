/**
 * The settings of the background script: read from storage.local when it
 * starts, stored again in the current form when reading migrated them, then
 * taken over from every change made elsewhere (storage.onChanged).
 */

import { SETTINGS_KEY, type Settings } from "../shared/settings"
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
}

export interface SettingsState {
  /** The settings now; the defaults until the first read. */
  current(): Settings
  /** Settles once the settings are read, stored in the current form and their interface language applied. */
  ready: Promise<void>
  /** Takes over settings written elsewhere. */
  adopt(stored: unknown): void
}

export function createSettingsState({ storage, beforeRead, onAdopt, onUiLanguage }: SettingsStateDeps): SettingsState {
  let settings = readSettings(undefined)
  const apply = (stored: unknown) => {
    settings = readSettings(stored)
    onAdopt(settings)
  }
  const ready = (async () => {
    await beforeRead?.()
    const stored = await storage.get(SETTINGS_KEY)
    apply(stored)
    // A fresh installation, or settings that reading migrated (earlier forms, copies of built-in prompts): store them in the current form.
    if (JSON.stringify(settings) !== JSON.stringify(stored)) await storage.set(SETTINGS_KEY, settings)
    await onUiLanguage(settings)
  })()
  return {
    current: () => settings,
    ready,
    adopt(stored) {
      const previous = settings.uiLanguage
      apply(stored)
      if (settings.uiLanguage !== previous) void onUiLanguage(settings)
    },
  }
}
