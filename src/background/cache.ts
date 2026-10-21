/**
 * Two-level translation cache: an in-memory LRU, mirrored to storage.local.
 *
 * The persisted copy is a single array of [key, value] pairs in LRU order
 * (oldest first). Writes are debounced so a burst of translations costs one
 * storage write. A failed read is tried again on the next access, and
 * nothing is written before a read succeeded: a write would replace the
 * stored entries with the few of this session.
 */

import { hashText } from "../shared/hash"

/** `languages`: the target language, or "<source>><target>" for translations; `variant`: whatever else shapes the result (endpoint, prompt, settings, data). */
export function cacheKey(providerId: string, model: string, languages: string, text: string, variant = ""): string {
  return `${providerId}|${model}|${languages}|${variant}|${hashText(text)}`
}

export class LruCache<V> {
  private map = new Map<string, V>()

  constructor(private maxEntries: number) {}

  get size(): number {
    return this.map.size
  }

  setMaxEntries(n: number): void {
    this.maxEntries = Math.max(0, n)
    this.evict()
  }

  get(key: string): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    // Refresh recency.
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: string, value: V): void {
    this.map.delete(key)
    this.map.set(key, value)
    this.evict()
  }

  delete(key: string): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  entries(): [string, V][] {
    return [...this.map.entries()]
  }

  load(entries: [string, V][]): void {
    this.map.clear()
    for (const [k, v] of entries) this.map.set(k, v)
    this.evict()
  }

  private evict(): void {
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string
      this.map.delete(oldest)
    }
  }
}

export interface KeyValueStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export const CACHE_STORAGE_KEY = "translationCache"

/** A write goes to storage this long after it, and the whole list goes there at most once per SAVE_INTERVAL_MS. */
const SAVE_DELAY_MS = 5000
const SAVE_INTERVAL_MS = 30_000

export class PersistentCache {
  private lru: LruCache<string>
  /** The read of the stored entries; resolves to whether it succeeded. */
  private loaded: Promise<boolean> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private lastSave = -Infinity
  private enabled = true

  /**
   * Every save writes the whole list (up to 100000 entries, tens of MB), so a translation that brings results every
   * second saves after `saveDelayMs` and then at most once per `saveIntervalMs`; the last results follow once more.
   */
  constructor(
    private readonly storage: KeyValueStorage,
    maxEntries: number,
    private readonly saveDelayMs = SAVE_DELAY_MS,
    private readonly saveIntervalMs = saveDelayMs && SAVE_INTERVAL_MS,
  ) {
    this.lru = new LruCache(maxEntries)
  }

  configure(enabled: boolean, maxEntries: number): void {
    this.enabled = enabled
    this.lru.setMaxEntries(maxEntries)
  }

  private ensureLoaded(): Promise<boolean> {
    this.loaded ??= this.storage.get(CACHE_STORAGE_KEY).then(
      (stored) => {
        if (Array.isArray(stored)) {
          const valid = stored.filter(
            (e): e is [string, string] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string",
          )
          // Entries written while loading are newer; keep them on top.
          const fresh = this.lru.entries()
          this.lru.load([...valid, ...fresh])
        }
        return true
      },
      () => {
        this.loaded = null
        return false
      },
    )
    return this.loaded
  }

  async get(key: string): Promise<string | undefined> {
    if (!this.enabled) return undefined
    await this.ensureLoaded()
    return this.lru.get(key)
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.enabled || !value) return
    await this.ensureLoaded()
    this.lru.set(key, value)
    this.scheduleSave()
  }

  /** Forget one entry, e.g. the result of an image before it is read again. */
  async delete(key: string): Promise<void> {
    if (!this.enabled) return
    await this.ensureLoaded()
    this.lru.delete(key)
    this.scheduleSave()
  }

  async clear(): Promise<void> {
    // A load still running would bring the old entries back after clearing.
    await this.ensureLoaded()
    this.lru.clear()
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    await this.storage.remove(CACHE_STORAGE_KEY)
  }

  async size(): Promise<number> {
    await this.ensureLoaded()
    return this.lru.size
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    const delay = Math.max(this.saveDelayMs, this.lastSave + this.saveIntervalMs - Date.now())
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null
      this.lastSave = Date.now()
      if (await this.ensureLoaded()) await this.storage.set(CACHE_STORAGE_KEY, this.lru.entries()).catch(() => {})
    }, delay)
  }
}
