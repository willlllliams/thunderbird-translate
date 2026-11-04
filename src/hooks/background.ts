/** Hooks of the e2e test build, undefined in every other build; docs/development.md (End-to-end tests) says how they are replaced and called. */

import type { KeyValueStorage } from "../background/cache"
import type { ConsentKind } from "../shared/consent"
import type { DictionaryManager } from "../offline/dictionary/manager"

/** What the background script hands to its hook. */
export interface BackgroundHookDeps {
  /** storage.local of the background script. */
  storage: KeyValueStorage
  /** The dictionary packs of the background script. */
  dictionary: DictionaryManager
  /** Runs a keyboard command as if it was pressed in `tab`. */
  runCommand: (command: string, tab?: browser.tabs.Tab) => Promise<void>
  /** Answers the consent panel of `kind` in tab `tabId` as the popup does; false when no panel asked. */
  answerConsent: (tabId: number, kind: ConsentKind, allowed: boolean) => Promise<boolean>
}

/**
 * Called when the background script starts, before it reads its settings,
 * which wait for the returned promise. It must register its listeners
 * before its first await.
 */
export const beforeSettingsRead: ((deps: BackgroundHookDeps) => Promise<void>) | undefined = undefined
