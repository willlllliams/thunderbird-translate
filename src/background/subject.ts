/**
 * The subject of the message displayed in a tab, for the line above the
 * body that shows its translation. The content script runs inside the body
 * of the message and cannot see the header, so the background script reads
 * the subject with messageDisplay.getDisplayedMessage(), which needs the
 * messagesRead permission. The call names the `browser` namespace directly
 * rather than going through shared/ext.ts, so that a review of the shipped
 * code sees which API it uses.
 */

import type { Ext } from "../shared/ext"

/** The subject of the message on screen in `tabId`; null without a message or with an empty subject. */
export async function displayedSubject(tabId: number): Promise<string | null> {
  // Thunderbird's own namespace, which the types of the WebExtension API leave out.
  const thunderbird = browser as unknown as Pick<Ext, "messageDisplay">
  const message = await thunderbird.messageDisplay.getDisplayedMessage(tabId)
  const subject = message?.subject
  return typeof subject === "string" && subject.trim() ? subject : null
}
