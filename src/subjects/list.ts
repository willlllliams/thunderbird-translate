/**
 * The parts of the page of translated subjects (index.ts) that run without
 * the page: the cells of the translated subjects as units for the
 * translation controller, and the sender names.
 */

import type { Collected, Unit } from "../content/paragraphs"
import { hasTranslatableText } from "../shared/text"
import type { MessageHeader } from "../shared/ext"

/** After messages arrived, were deleted or moved, the list is read again once this long has passed without another change. */
export const RELOAD_DELAY_MS = 500
/** Class of the cell that receives the translated subject. */
export const CLS_CELL = "subject-translation"

/** The name of a sender ("Alice Walker <alice@example.com>" → "Alice Walker"), else the address. */
export function senderName(author: string): string {
  const match = /^(.*?)\s*<([^<>]+)>\s*$/.exec(author)
  if (!match) return author.trim()
  return match[1].trim().replace(/^"(.*)"$/, "$1").trim() || match[2].trim()
}

/** What tells two lists apart for the page: the ids and subjects of their messages, in order. */
export const rowKey = (messages: MessageHeader[]) => JSON.stringify(messages.map((m) => [m.id, m.subject]))

/** The cells of the translated subjects as units for the translation controller; the rows put back nothing on restore. */
export function collectCells(root: HTMLElement): Collected {
  const units: Unit[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`.${CLS_CELL}`))) {
    const text = el.dataset.text ?? ""
    if (hasTranslatableText(text)) units.push({ el, text, pre: false })
  }
  return { units, restore: () => {} }
}
