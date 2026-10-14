/**
 * The parts of the page of translated subjects (index.ts) that run without
 * the page: the size of a page of the list, the list of a mail tab read page
 * by page, the cells of the translated subjects as units for the translation
 * controller, and the sender names.
 */

import type { Collected, Unit } from "../content/paragraphs"
import { hasTranslatableText } from "../content/text"
import type { MessageHeader, MessageList } from "../shared/ext"

/** Messages listed at first, and added by every "Show more". */
export const PAGE_SIZE = 100
/** After messages arrived, were deleted or moved, the list is read again once this long has passed without another change. */
export const RELOAD_DELAY_MS = 500
/** Class of the cell that receives the translated subject. */
export const CLS_CELL = "subject-translation"

/** The name of a sender ("Alice Walker <alice@example.com>" → "Alice Walker"), else the address. */
export function senderName(author: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(author)
  if (!match) return author.trim()
  return match[1].trim() || match[2].trim()
}

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

/** The cells of the translated subjects as units for the translation controller; the rows put back nothing on restore. */
export function collectCells(root: HTMLElement): Collected {
  const units: Unit[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`.${CLS_CELL}`))) {
    const text = el.dataset.text ?? ""
    if (hasTranslatableText(text)) units.push({ id: units.length + 1, el, text, pre: false })
  }
  return { units, restore: () => {} }
}
