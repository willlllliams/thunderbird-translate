/**
 * The catalog of an offline service (the dictionary index of a release, the
 * Bergamot model list) as the background page keeps it: read from the
 * network once, read again when it is older than ttlMs, and after a failed
 * read not asked for again before retryMs have passed.
 */

/** A catalog is read again after this long. */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000

/** After a failed read, a catalog is asked for again after this long at the earliest. */
export const CATALOG_RETRY_MS = 10 * 60 * 1000

export interface CatalogCacheOptions<T> {
  /** Reads the catalog from the network. */
  load: () => Promise<T>
  ttlMs?: number
  retryMs?: number
  /** A copy saved by an earlier session, asked for when a read fails and nothing was read yet; undefined when there is none. */
  fallback?: () => Promise<T | undefined>
  now?: () => number
}

export class CatalogCache<T> {
  /** What was read last, or the saved copy; `at` is when it was read (never fresh for the saved copy). */
  private value: { data: T; at: number } | null = null
  /** The last failed read, while no read has succeeded since. */
  private failed: { at: number; error: unknown } | null = null
  private loading: Promise<T | null> | null = null
  private readonly ttlMs: number
  private readonly retryMs: number
  private readonly now: () => number

  constructor(private readonly options: CatalogCacheOptions<T>) {
    this.ttlMs = options.ttlMs ?? CATALOG_TTL_MS
    this.retryMs = options.retryMs ?? CATALOG_RETRY_MS
    this.now = options.now ?? (() => Date.now())
  }

  /**
   * The catalog: the copy in memory while it is younger than ttlMs, else
   * read again. Within retryMs of a failed read nothing is read: the answer
   * is the copy in memory or null. `refresh` reads in any case (the user
   * asked for it). Never rejects; a failed read answers with the copy in
   * memory, the saved copy or null, and `error` tells why.
   */
  get(refresh = false): Promise<T | null> {
    if (!refresh) {
      const retrying = this.failed !== null && this.now() - this.failed.at < this.retryMs
      if (this.value && (retrying || this.now() - this.value.at < this.ttlMs)) return Promise.resolve(this.value.data)
      if (retrying) return Promise.resolve(null)
    }
    this.loading ??= this.read().finally(() => (this.loading = null))
    return this.loading
  }

  /** The catalog in memory, without reading: translations never wait for the network. Null before anything was read. */
  peek(): T | null {
    return this.value?.data ?? null
  }

  /** Why the last read failed, while no read has succeeded since; undefined otherwise. */
  get error(): unknown {
    return this.failed?.error
  }

  private async read(): Promise<T | null> {
    try {
      const data = await this.options.load()
      this.value = { data, at: this.now() }
      this.failed = null
      return data
    } catch (error) {
      this.failed = { at: this.now(), error }
      if (!this.value && this.options.fallback) {
        const saved = await this.options.fallback().catch(() => undefined)
        if (saved !== undefined) this.value = { data: saved, at: -Infinity }
      }
      return this.value?.data ?? null
    }
  }
}
