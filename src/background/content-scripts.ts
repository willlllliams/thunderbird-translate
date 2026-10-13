/**
 * The content script in the message display: registered for messages opened from now on, injected into those already
 * on screen. Both need the messagesModify permission. The calls name the `browser` namespace directly rather than
 * going through shared/ext.ts, so that a review of the shipped code sees which API each one uses.
 */

import type { Ext } from "../shared/ext"

declare const __DEBUG__: boolean

export async function registerContentScripts(): Promise<void> {
  // Thunderbird's own namespace, which the types of the WebExtension API leave out.
  const thunderbird = browser as unknown as Pick<Ext, "messageDisplayScripts">
  await thunderbird.messageDisplayScripts.register({
    js: [{ file: "/content.js" }],
    css: [{ file: "/content.css" }],
  })
  if (__DEBUG__) console.info("[thunderbird-translate] message display script registered")
  // Registered scripts only reach messages opened from now on; inject into
  // messages that are already on screen (e.g. right after installation).
  for (const tab of await browser.tabs.query({})) {
    const type = (tab as { type?: string }).type
    if (tab.id === undefined || (type !== "mail" && type !== "messageDisplay")) continue
    try {
      await browser.tabs.insertCSS(tab.id, { file: "/content.css" })
      await browser.tabs.executeScript(tab.id, { file: "/content.js" })
    } catch {
      // No message displayed in this tab.
    }
  }
}
