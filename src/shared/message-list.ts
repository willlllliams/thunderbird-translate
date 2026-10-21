/**
 * The message list of a mail tab read page by page, for the page of
 * translated subjects and the column of the experimental build.
 */

import type { MessageHeader, MessageList } from "./ext"

/** Messages listed at first, and added by every "Show more". */
export const PAGE_SIZE = 100
/** After a change of folder the list is read again after these delays: a folder fills its list while Thunderbird reads or downloads its messages. */
export const SETTLE_DELAYS_MS = [1000, 3000]

/** The messages of the message list of a mail tab, read page by page. */
export class Listing {
  /** The messages on the page. */
  shown: MessageHeader[] = []
  /** Messages read but not shown yet. */
  private buffer: MessageHeader[] = []
  /** The id of the next page of the list; null after the last one. */
  private next: string | null = null

  get hasMore(): boolean {
    return this.buffer.length > 0 || this.next !== null
  }

  /** Read the list of `tabId` from the start and show at least `count` messages, PAGE_SIZE at a time. */
  async load(tabId: number, count: number, current: () => boolean): Promise<void> {
    this.abort()
    const list = await browser.mailTabs.getListedMessages(tabId)
    if (!current()) return void this.release(list)
    this.shown = []
    this.buffer = [...list.messages]
    this.next = list.id
    do await this.more(current)
    while (current() && this.shown.length < count && this.hasMore)
  }

  /** Show PAGE_SIZE more messages, reading further pages as needed. */
  async more(current: () => boolean): Promise<void> {
    while (this.buffer.length < PAGE_SIZE && this.next !== null) {
      const page = await browser.messages.continueList(this.next)
      if (!current()) return void this.release(page)
      this.buffer.push(...page.messages)
      this.next = page.id
    }
    this.shown.push(...this.buffer.splice(0, PAGE_SIZE))
  }

  /** Stop reading the list: Thunderbird keeps the pages of a list until it is read to the end or aborted. */
  abort(): void {
    if (this.next !== null) void browser.messages.abortList(this.next).catch(() => {})
    this.next = null
    this.buffer = []
  }

  /** A list read for a load that is no longer current. */
  private release(list: MessageList): void {
    if (list.id !== null) void browser.messages.abortList(list.id).catch(() => {})
  }
}

/** The first `count` messages listed in the mail tab `tabId`; the rest of the list is aborted, also after an error. */
export async function listedMessages(tabId: number, count: number): Promise<MessageHeader[]> {
  const listing = new Listing()
  try {
    await listing.load(tabId, count, () => true)
    return listing.shown.slice(0, count)
  } finally {
    listing.abort()
  }
}
