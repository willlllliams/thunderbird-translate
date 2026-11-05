/**
 * Two-level translation cache: the entries used in this session in memory,
 * all of them in IndexedDB, one record per key with the time it was used
 * last. A burst of results and uses goes to the database in one transaction
 * a moment later; the entries used least recently go beyond the maximum.
 * The cache of version 3.1 and earlier, one array in storage.local, moves
 * into the database at the first use and leaves storage.local: a value there
 * is copied to every page that listens to storage changes, at every write.
 */

import { hashText } from "../shared/hash"
import { idbCommit, idbRequest, lazyDatabase } from "../shared/idb"

/** `languages`: the target language, or "<source>><target>" for translations; `variant`: whatever else shapes the result (endpoint, prompt, settings, data). */
export function cacheKey(providerId: string, model: string, languages: string, text: string, variant = ""): string {
  return `${providerId}|${model}|${languages}|${variant}|${hashText(text)}`
}

export class LruCache<V> {
  private map = new Map<string, V>()

  /** `onEvict`: told of each entry that leaves because the cache is full, not of one that is deleted or cleared. */
  constructor(
    private maxEntries: number,
    private readonly onEvict?: (value: V) => void,
  ) {}

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

  private evict(): void {
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string
      const value = this.map.get(oldest) as V
      this.map.delete(oldest)
      this.onEvict?.(value)
    }
  }
}

export interface KeyValueStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

/** The key of the cache in storage.local up to version 3.1; moved into the database at the first use. */
export const CACHE_STORAGE_KEY = "translationCache"

/** A value of the cache and the time it was used last. */
export interface CacheEntry {
  v: string
  used: number
}

/** The entries of the cache as stored. */
export interface CacheStore {
  get(key: string): Promise<string | undefined>
  /** Writes the entries `put` and deletes `deleted`, in one transaction. */
  write(put: ReadonlyMap<string, CacheEntry>, deleted: ReadonlySet<string>): Promise<void>
  /** Adds the entries of `list` that are not stored yet. */
  addMissing(list: [string, CacheEntry][]): Promise<void>
  count(): Promise<number>
  /** Deletes the entries used least recently until at most `keep` remain. */
  trim(keep: number): Promise<void>
  clear(): Promise<void>
}

/** The entries in the IndexedDB database tt-cache: the object store "entries" by key, with an index of the time of use. */
export function idbCacheStore(factory: () => IDBFactory = () => indexedDB): CacheStore {
  const open = lazyDatabase(factory, "tt-cache", 1, (db) => db.createObjectStore("entries").createIndex("used", "used"))
  const entries = async (mode: IDBTransactionMode) => (await open()).transaction("entries", mode).objectStore("entries")
  return {
    get: async (key) => ((await idbRequest((await entries("readonly")).get(key))) as CacheEntry | undefined)?.v,
    async write(put, deleted) {
      const store = await entries("readwrite")
      for (const [key, entry] of put) store.put(entry, key)
      for (const key of deleted) store.delete(key)
      await idbCommit(store.transaction)
    },
    async addMissing(list) {
      const store = await entries("readwrite")
      // A key stored already keeps its newer value; the failed add aborts nothing and is no error of the transaction.
      for (const [key, entry] of list) {
        store.add(entry, key).onerror = (event) => {
          event.preventDefault()
          event.stopPropagation()
        }
      }
      await idbCommit(store.transaction)
    },
    count: async () => idbRequest((await entries("readonly")).count()),
    async trim(keep) {
      const store = await entries("readwrite")
      let excess = (await idbRequest(store.count())) - keep
      const cursor = store.index("used").openCursor()
      cursor.onsuccess = () => {
        if (!cursor.result || excess-- <= 0) return
        cursor.result.delete()
        cursor.result.continue()
      }
      await idbCommit(store.transaction)
    },
    async clear() {
      const store = await entries("readwrite")
      store.clear()
      await idbCommit(store.transaction)
    },
  }
}

/** A write goes to the database this long after it, together with the writes until then. */
const SAVE_DELAY_MS = 5000
/** After a failed move of the old cache, the next use tries again this much later; until then the cache works in memory and storage.local stays unread. */
const MIGRATE_RETRY_MS = 60_000
/** Entries kept in memory as well, the ones used last. */
const HOT_ENTRIES = 2000

export class PersistentCache {
  private lru: LruCache<string>
  private maxEntries: number
  /** What goes to the database with the next write: new values and times of use, and deleted keys. */
  private pending = new Map<string, CacheEntry>()
  private deleted = new Set<string>()
  /** The move of the cache of storage.local into the database; tried again some time after a failure. */
  private migrated: Promise<void> | null = null
  private retryMigrationAt = 0
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private clock = 0
  /** Counts the clears: a read of the database that started before one answers nothing. */
  private epoch = 0
  private enabled = true
  /** The maximum went down: the entries beyond it go with the next write. */
  private trimDue = false

  /** `storage`: storage.local, which held the cache up to version 3.1. */
  constructor(
    private readonly storage: KeyValueStorage,
    maxEntries: number,
    private readonly saveDelayMs = SAVE_DELAY_MS,
    private readonly store: CacheStore = idbCacheStore(),
  ) {
    this.maxEntries = maxEntries
    this.lru = new LruCache(Math.min(maxEntries, HOT_ENTRIES))
  }

  configure(enabled: boolean, maxEntries: number): void {
    this.enabled = enabled
    const before = this.maxEntries
    this.maxEntries = Math.max(0, maxEntries)
    this.lru.setMaxEntries(Math.min(this.maxEntries, HOT_ENTRIES))
    // A lower maximum drops the oldest entries with the next write; the same settings again do not touch the database.
    if (this.maxEntries < before) this.trimDue = true
    if (enabled && this.trimDue) this.scheduleSave()
  }

  /** The entries of storage.local, oldest first, into the database, older than every entry written since. */
  private migrate(): Promise<void> {
    if (!this.migrated && Date.now() < this.retryMigrationAt) return Promise.resolve()
    this.migrated ??= (async () => {
      const stored = await this.storage.get(CACHE_STORAGE_KEY)
      if (stored === undefined) return
      const valid = Array.isArray(stored) ? stored.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string") : []
      await this.store.addMissing(valid.map(([key, v], i) => [key, { v, used: i + 1 }]))
      await this.storage.remove(CACHE_STORAGE_KEY)
    })().catch(() => {
      this.migrated = null
      this.retryMigrationAt = Date.now() + MIGRATE_RETRY_MS
    })
    return this.migrated
  }

  /** A time of use later than every one before. */
  private now(): number {
    return (this.clock = Math.max(Date.now(), this.clock + 1))
  }

  async get(key: string): Promise<string | undefined> {
    if (!this.enabled) return undefined
    await this.migrate()
    const known = () => this.lru.get(key) ?? (this.deleted.has(key) ? null : this.pending.get(key)?.v)
    let value = known()
    if (value === undefined) {
      const epoch = this.epoch
      const stored = await this.store.get(key).catch(() => undefined)
      if (epoch !== this.epoch) return undefined
      // Written or deleted during the read: that is newer.
      const meanwhile = known()
      value = meanwhile === undefined ? stored : meanwhile
    }
    if (!value || !this.enabled) return undefined
    this.lru.set(key, value)
    this.pending.set(key, { v: value, used: this.now() })
    this.scheduleSave()
    return value
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.enabled || !value) return
    await this.migrate()
    this.lru.set(key, value)
    this.deleted.delete(key)
    this.pending.set(key, { v: value, used: this.now() })
    this.scheduleSave()
  }

  /** Forget one entry, e.g. the result of an image before it is read again. */
  async delete(key: string): Promise<void> {
    if (!this.enabled) return
    await this.migrate()
    this.lru.delete(key)
    this.pending.delete(key)
    this.deleted.add(key)
    this.scheduleSave()
  }

  async clear(): Promise<void> {
    // A move still running would bring the old entries back after clearing.
    await this.migrate()
    this.epoch++
    this.lru.clear()
    this.pending.clear()
    this.deleted.clear()
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    await this.store.clear()
  }

  async size(): Promise<number> {
    await this.migrate()
    await this.save()
    return this.store.count().catch(() => this.lru.size)
  }

  private scheduleSave(): void {
    this.saveTimer ??= setTimeout(() => void this.save(), this.saveDelayMs)
  }

  /** What is pending into the database; the entries used least recently go beyond the maximum. A failed write loses only cached results. */
  private async save(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    const [put, deleted] = [this.pending, this.deleted]
    this.pending = new Map()
    this.deleted = new Set()
    const trim = put.size > 0 || this.trimDue
    this.trimDue = false
    await (put.size > 0 || deleted.size > 0 ? this.store.write(put, deleted) : Promise.resolve())
      .then(() => (trim ? this.store.trim(this.maxEntries) : undefined))
      .catch(() => {})
  }
}
