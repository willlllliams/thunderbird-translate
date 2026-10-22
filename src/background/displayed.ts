/**
 * The message displayed in a tab: its sender, date and subject for its
 * summary; its id, a part of it and the addresses of its remote images, for
 * the translation of its images.
 * The content script runs inside the body of the message and cannot see the
 * header, so the background script reads it
 * with messageDisplay.getDisplayedMessage(), which needs the messagesRead
 * permission. The call names the `browser` namespace directly rather than
 * going through shared/ext.ts, so that a review of the shipped code sees
 * which API it uses.
 */

import { type MessagePartLike, messageImageUrls } from "./remote-images"
import type { MailHeader } from "./summary"

/**
 * `date` in ISO 8601 as the clock of the reader shows it, to the minute, with its offset: "2026-10-22T07:00+08:00".
 * The summary resolves "tomorrow" against the date of the message, which is the date of the reader, not of UTC.
 */
export function localIso(date: Date, offset = -date.getTimezoneOffset()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const abs = Math.abs(offset)
  return `${new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 16)}${offset < 0 ? "-" : "+"}${pad(Math.trunc(abs / 60))}:${pad(abs % 60)}`
}

/** Sender, date (ISO 8601 in the time zone of the reader, "" when unreadable) and subject of the message on screen in `tabId`; null without a message. */
export async function displayedHeader(tabId: number): Promise<MailHeader | null> {
  const message = await browser.messageDisplay.getDisplayedMessage(tabId)
  if (!message) return null
  const date = new Date(message.date)
  return { author: message.author, date: Number.isNaN(date.getTime()) ? "" : localIso(date), subject: message.subject }
}

/** The id of the message on screen in `tabId`; null without a message. */
export async function displayedMessageId(tabId: number): Promise<number | null> {
  return (await browser.messageDisplay.getDisplayedMessage(tabId))?.id ?? null
}

/**
 * A part of a message as a file: an image of the body or an image attachment the user asked to translate, or one
 * that image translation in mode "auto" takes. getAttachmentFile() needs only the messagesRead permission and
 * reads any part by its part name, also an inline image that listAttachments() does not list (Thunderbird 128).
 */
export function messagePart(messageId: number, partName: string): Promise<File> {
  return browser.messages.getAttachmentFile(messageId, partName)
}

/**
 * The addresses of the remote images the HTML of a message names: a remote image of the displayed message is read
 * only at one of them. getFull() needs only the messagesRead permission and gives the decoded text of each text part;
 * the background page parses it without loading anything.
 */
export async function messageImageAddresses(messageId: number): Promise<Set<string>> {
  const full = await browser.messages.getFull(messageId)
  return messageImageUrls(full as MessagePartLike, (html) => new DOMParser().parseFromString(html, "text/html"))
}
