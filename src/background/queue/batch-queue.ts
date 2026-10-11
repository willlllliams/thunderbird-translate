/**
 * Collects items for a short window and hands them to an executor in groups.
 *
 * Grouping rules (same as Read Frog's BatchQueue, simplified):
 * - items are grouped by key (provider, model, endpoint, target language…);
 * - a group is flushed when the time window elapses, when it reaches
 *   `maxItems`, or when adding the next item would exceed `maxChars`;
 * - an item larger than `maxChars` travels alone.
 */

export interface BatchLimits {
  maxItems: number
  maxChars: number
}

/** Pure grouping used by the queue and by tests: split a list into batches within limits. */
export function groupIntoBatches<T>(items: T[], size: (item: T) => number, limits: BatchLimits): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let chars = 0
  for (const item of items) {
    const n = size(item)
    const wouldOverflow = current.length > 0 && (chars + n > limits.maxChars || current.length >= limits.maxItems)
    if (wouldOverflow) {
      batches.push(current)
      current = []
      chars = 0
    }
    current.push(item)
    chars += n
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export interface BatchQueueOptions<T, R> {
  delayMs: () => number
  /** Limits of the group an item joins. */
  limits: (item: T) => BatchLimits
  getKey: (item: T) => string
  getSize: (item: T) => number
  /** Must resolve with one result per item, in order. */
  execute: (key: string, items: T[]) => Promise<R[]>
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
    const { items, waiters } = batch
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
