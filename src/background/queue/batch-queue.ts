/**
 * Collects items for a short window and hands them to an executor in groups.
 *
 * Grouping rules (same as Read Frog's BatchQueue, simplified):
 * - items are grouped by key (provider, model, endpoint, target language…);
 * - a group is flushed when the time window elapses, when it reaches
 *   `maxItems`, or when adding the next item would exceed `maxChars`;
 * - an item larger than `maxChars` travels alone.
 *
 * splitText() and joinParts() cut a paragraph longer than `maxChars` into
 * pieces that fit, and put the translated pieces together again.
 */

import { baseLang } from "../../shared/languages"

export interface BatchLimits {
  maxItems: number
  maxChars: number
}

/** A piece of a paragraph and the whitespace that followed it in the paragraph. */
export interface TextPart {
  text: string
  gap: string
}

/** `text` cut into pieces of at most `max` characters, each at a space when there is one in its second half. */
function hardCut(text: string, max: number): string[] {
  const pieces: string[] = []
  while (text.length > max) {
    let cut = text.lastIndexOf(" ", max - 1) + 1
    if (cut <= max / 2) cut = max - (/[\uD800-\uDBFF]/.test(text[max - 1]) ? 1 : 0)
    pieces.push(text.slice(0, cut))
    text = text.slice(cut)
  }
  return [...pieces, text]
}

/** The units a piece is made of: each line, or the sentences of a line longer than `maxChars` (Intl.Segmenter), cut by length when still longer. */
function units(text: string, maxChars: number): string[] {
  const sentences = new Intl.Segmenter(undefined, { granularity: "sentence" })
  return text.split(/(?<=\n)/).flatMap((line) => (line.length <= maxChars ? [line] : [...sentences.segment(line)].flatMap((s) => hardCut(s.segment, maxChars))))
}

/**
 * A paragraph in pieces of at most `maxChars` characters. A piece takes
 * lines, line breaks included, as long as they fit; when the next line or
 * sentence would not fit, the piece ends at its last line break, or between
 * sentences when it has none. A paragraph that fits stays one piece.
 * Whitespace at the start of a long paragraph becomes a first part without
 * text, which is not sent for translation (TranslationService).
 */
export function splitText(text: string, maxChars: number): TextPart[] {
  if (text.length <= maxChars) return [{ text, gap: "" }]
  const lead = text.length - text.trimStart().length
  const pieces: string[] = []
  let current = ""
  /** Length of `current` up to its last line break; 0 when it has none. */
  let lineEnd = 0
  for (const unit of units(text.slice(lead), maxChars)) {
    // Whitespace alone stays with the piece before it.
    if (current && unit.trim() && current.length + unit.length > maxChars) {
      const cut = lineEnd || current.length
      pieces.push(current.slice(0, cut))
      current = current.slice(cut)
      lineEnd = 0
      if (current && current.length + unit.length > maxChars) {
        pieces.push(current)
        current = ""
      }
    }
    current += unit
    if (unit.endsWith("\n")) lineEnd = current.length
  }
  if (current) pieces.push(current)
  const parts = pieces.map((piece) => {
    const body = piece.trimEnd()
    return { text: body, gap: piece.slice(body.length) }
  })
  return lead ? [{ text: "", gap: text.slice(0, lead) }, ...parts] : parts
}

/** Translations of the pieces of splitText() as one text: line breaks as in the source, else a space, none for Chinese and Japanese, and none after a part without text. */
export function joinParts(parts: readonly TextPart[], translations: readonly string[], targetLang: string): string {
  const space = ["zh", "ja"].includes(baseLang(targetLang)) ? "" : " "
  const gap = ({ text, gap }: TextPart) => (gap.includes("\n") ? gap : text ? space : "")
  return translations.map((text, i) => (i === parts.length - 1 ? text : text + gap(parts[i]))).join("")
}

export interface BatchQueueOptions<T, R> {
  delayMs: () => number
  /** Limits of the group an item joins. */
  limits: (item: T) => BatchLimits
  getKey: (item: T) => string
  getSize: (item: T) => number
  /** Must resolve with one result per item, in order. */
  execute: (key: string, items: T[]) => Promise<R[]>
  /** An item no one waits for any more: left out of its batch when the batch goes, its promise rejected with dropError(). */
  dropped?: (item: T) => boolean
  dropError?: () => unknown
}

interface Pending<T, R> {
  items: T[]
  chars: number
  waiters: { resolve: (r: R) => void; reject: (e: unknown) => void }[]
  timer: ReturnType<typeof setTimeout> | null
}

export class BatchQueue<T, R> {
  private pending = new Map<string, Pending<T, R>>()

  constructor(private readonly options: BatchQueueOptions<T, R>) {}

  enqueue(item: T): Promise<R> {
    const key = this.options.getKey(item)
    const size = this.options.getSize(item)
    const limits = this.options.limits(item)

    let batch = this.pending.get(key)
    if (batch && (batch.chars + size > limits.maxChars || batch.items.length >= limits.maxItems)) {
      this.flush(key)
      batch = undefined
    }
    if (!batch) {
      batch = { items: [], chars: 0, waiters: [], timer: null }
      this.pending.set(key, batch)
      const delay = Math.max(0, this.options.delayMs())
      batch.timer = setTimeout(() => this.flush(key), delay)
    }

    const promise = new Promise<R>((resolve, reject) => {
      batch!.waiters.push({ resolve, reject })
    })
    batch.items.push(item)
    batch.chars += size

    if (batch.items.length >= limits.maxItems || batch.chars >= limits.maxChars) {
      this.flush(key)
    }
    return promise
  }

  private flush(key: string): void {
    const batch = this.pending.get(key)
    if (!batch) return
    this.pending.delete(key)
    if (batch.timer) clearTimeout(batch.timer)
    const { dropped, dropError } = this.options
    const kept = batch.items.map((item) => !dropped?.(item))
    batch.waiters.forEach((w, i) => kept[i] || w.reject(dropError?.()))
    const items = batch.items.filter((_, i) => kept[i])
    const waiters = batch.waiters.filter((_, i) => kept[i])
    if (items.length === 0) return
    this.options
      .execute(key, items)
      .then((results) => {
        if (!Array.isArray(results) || results.length !== items.length) {
          throw new Error(`Batch executor returned ${results?.length} results for ${items.length} items`)
        }
        waiters.forEach((w, i) => w.resolve(results[i]))
      })
      .catch((error) => waiters.forEach((w) => w.reject(error)))
  }
}
