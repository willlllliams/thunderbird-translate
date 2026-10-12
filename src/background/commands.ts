/** The keyboard commands of the manifest: toggle the translation, retranslate, switch the display mode. */

import { ext } from "../shared/ext"
import type { PortPush } from "../shared/messages"
import { updateSettings } from "../shared/settings-store"

/** Commands for the message of the tab of the shortcut, else of the active tab. */
const TAB_COMMANDS = new Map<string, PortPush>([
  ["toggle-translation", { type: "toggle" }],
  ["retranslate", { type: "retranslate" }],
])

export interface CommandDeps {
  /** Settles once the settings are read. */
  ready: Promise<void>
  /** Sends a command to the content scripts of a tab. */
  postToTab: (tabId: number, msg: PortPush) => void
}

/** Runs a command, `tab` being the tab the shortcut was pressed in. */
export type CommandRunner = (command: string, tab?: browser.tabs.Tab) => Promise<void>

export function createCommandRunner({ ready, postToTab }: CommandDeps): CommandRunner {
  return async (command, tab) => {
    await ready
    const push = TAB_COMMANDS.get(command)
    if (push) {
      const tabId = tab?.id ?? (await ext.tabs.query({ active: true, currentWindow: true }))[0]?.id
      if (tabId !== undefined) postToTab(tabId, push)
    } else if (command === "toggle-display-mode") {
      // The change reaches the content scripts through storage.onChanged.
      await updateSettings((s) => (s.mode = s.mode === "bilingual" ? "translation-only" : "bilingual"))
    }
  }
}
