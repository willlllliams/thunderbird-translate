import { ext } from "./ext"
import { normalizeSettings, SETTINGS_KEY, type Settings } from "./settings"

/** Used by the popup and the options page (privileged extension pages). */
export async function loadSettings(): Promise<Settings> {
  const stored = (await ext.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]
  return normalizeSettings(stored, ext.i18n.getUILanguage())
}

export async function saveSettings(settings: Settings): Promise<void> {
  await ext.storage.local.set({ [SETTINGS_KEY]: settings })
}

export async function updateSettings(change: (s: Settings) => void): Promise<Settings> {
  const s = await loadSettings()
  change(s)
  await saveSettings(s)
  return s
}
