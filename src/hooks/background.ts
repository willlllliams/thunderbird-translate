/**
 * Hooks of the e2e test build. Every hook under src/hooks/ is undefined here;
 * scripts/build.mjs --e2e replaces each module of src/hooks/ with the module
 * of the same name in src/e2e/hooks/, which defines them. No other build
 * contains code of src/e2e/.
 *
 * Arguments of a hook may only be values already computed or references to
 * objects: `hook?.(expr)` does not evaluate expr when the hook is undefined,
 * so an effect of expr would happen in the test build only.
 */

import type { KeyValueStorage } from "../background/cache"

/** What the background script hands to its hook. */
export interface BackgroundHookDeps {
  /** storage.local of the background script. */
  storage: KeyValueStorage
  /** The dictionary of the background script, to read the packs again. */
  dictionary: { invalidate(): void }
  /** Runs a keyboard command as if it was pressed in `tab`. */
  runCommand: (command: string, tab?: browser.tabs.Tab) => Promise<void>
}

/**
 * Called when the background script starts, before it reads its settings,
 * which wait for the returned promise. It must register its listeners
 * before its first await.
 */
export const beforeSettingsRead: ((deps: BackgroundHookDeps) => Promise<void>) | undefined = undefined
