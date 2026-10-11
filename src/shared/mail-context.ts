/**
 * The message as context for precise mode. Built by the content script from
 * the paragraphs it found, registered once per translation with the
 * background script, and referenced by id from every paragraph request.
 */

import { hashText } from "./hash"

export interface MailContext {
  /** Hash of the whole body; part of cache keys and batch keys, so two messages never share either. */
  id: string
  /** Paragraphs in document order. */
  paragraphs: string[]
  /** Positions of the paragraphs that are translated; the others are already in the target language. */
  targets: number[]
  /** Plain text of the body, cut to MAX_CONTEXT_CHARS. */
  text: string
}

const MAX_CONTEXT_CHARS = 20000

export function createMailContext(paragraphs: string[], targets: number[]): MailContext {
  const full = paragraphs.join("\n\n")
  const text = full.length > MAX_CONTEXT_CHARS ? `${full.slice(0, MAX_CONTEXT_CHARS)}\n[… truncated, the message continues]` : full
  return { id: hashText(full), paragraphs, targets, text }
}
