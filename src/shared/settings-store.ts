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

type Tree = Record<string, unknown>

const isTree = (v: unknown): v is Tree => typeof v === "object" && v !== null && !Array.isArray(v)

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Three-way merge into `target`, in place. Every value of `source` that
 * differs from `base` is copied into `target`. With `keepTarget`, a value
 * that `target` has changed itself since `base` stays as it is.
 */
export function mergeChanges(target: Tree, base: Tree, source: Tree, keepTarget: boolean): void {
  for (const key of new Set([...Object.keys(base), ...Object.keys(source)])) {
    const [t, b, s] = [target[key], base[key], source[key]]
    if (isTree(s) && isTree(t)) {
      mergeChanges(t, isTree(b) ? b : {}, s, keepTarget)
    } else if (!sameValue(b, s) && !(keepTarget && !sameValue(b, t))) {
      if (s === undefined) delete target[key]
      else target[key] = structuredClone(s)
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
  mergeChanges(latest as unknown as Tree, base as unknown as Tree, edited as unknown as Tree, false)
  await saveSettings(latest)
  return latest
}
