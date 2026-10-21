/**
 * The header of the message displayed in a tab: the subject for the line
 * above the body that shows its translation, and the sender, date and
 * subject for its summary. The content script runs inside the body of the
 * message and cannot see the header, so the background script reads it
 * with messageDisplay.getDisplayedMessage(), which needs the messagesRead
 * permission. The call names the `browser` namespace directly rather than
 * going through shared/ext.ts, so that a review of the shipped code sees
 * which API it uses.
 */

import type { MailHeader } from "./summary"

/** The subject of the message on screen in `tabId`; null without a message or with an empty subject. */
export async function displayedSubject(tabId: number): Promise<string | null> {
  const message = await browser.messageDisplay.getDisplayedMessage(tabId)
  const subject = message?.subject
  return typeof subject === "string" && subject.trim() ? subject : null
}

/** Sender, date (ISO 8601, "" when unreadable) and subject of the message on screen in `tabId`; null without a message. */
export async function displayedHeader(tabId: number): Promise<MailHeader | null> {
  const message = await browser.messageDisplay.getDisplayedMessage(tabId)
  if (!message) return null
  const date = new Date(message.date)
  return { author: message.author, date: Number.isNaN(date.getTime()) ? "" : date.toISOString(), subject: message.subject }
}
