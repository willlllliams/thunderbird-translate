/** Settings in storage.local, as used by the popup, the settings page and the background script's shortcuts. */

import { ext } from "./ext"
import { thunderbirdUiLanguage } from "./i18n-ext"
import { normalizeSettings, SETTINGS_KEY, type Settings } from "./settings"

/** Stored settings (from storage or a storage change event) with defaults applied. */
export function readSettings(stored: unknown): Settings {
  return normalizeSettings(stored, thunderbirdUiLanguage())
}

export async function loadSettings(): Promise<Settings> {
  return readSettings((await ext.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY])
}

async function saveSettings(settings: Settings): Promise<void> {
  await ext.storage.local.set({ [SETTINGS_KEY]: settings })
}

/** Changes of this page, written one after the other. */
let updates: Promise<unknown> = Promise.resolve()

/**
 * Apply one change (popup, keyboard shortcut) to the settings in storage:
 * read, change, write, one change after the other, so changes of one page
 * never overtake each other.
 */
export function updateSettings(change: (s: Settings) => void): Promise<Settings> {
  const update = updates.then(async () => {
    const settings = await loadSettings()
    change(settings)
    await saveSettings(settings)
    return settings
  })
  updates = update.catch(() => {})
  return update
}

type Tree = Record<string, unknown>

const isTree = (v: unknown): v is Tree => typeof v === "object" && v !== null && !Array.isArray(v)

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Three-way merge into `target`, in place. Every value of `source` that
 * differs from `base` is copied into `target`, except a change of
 * `target`'s own: a value that differs from its value in one of the
 * trees of `own`, e.g. the settings as last stored.
 */
export function mergeChanges(target: object, base: object, source: object, own: object[] = []): void {
  const [tt, bt, st] = [target as Tree, base as Tree, source as Tree]
  for (const key of new Set([...Object.keys(bt), ...Object.keys(st)])) {
    const [t, b, s] = [tt[key], bt[key], st[key]]
    const mine = own.map((tree) => (tree as Tree)[key])
    if (isTree(s) && isTree(t)) {
      mergeChanges(t, isTree(b) ? b : {}, s, mine.map((m) => (isTree(m) ? m : {})))
    } else if (!sameValue(b, s) && mine.every((m) => sameValue(m, t))) {
      if (s === undefined) delete tt[key]
      else tt[key] = structuredClone(s)
    }
  }
}

/**
 * Write the edits of one page: what `edited` changed compared with `base`
 * (the settings as the page last saw them) goes on top of the settings in
 * storage, so changes made elsewhere in the meantime survive. Returns what
 * was stored.
 */
export async function saveChanges(base: Settings, edited: Settings): Promise<Settings> {
  const latest = await loadSettings()
  mergeChanges(latest, base, edited)
  await saveSettings(latest)
  return latest
}
