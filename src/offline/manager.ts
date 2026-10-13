/**
 * What the managers of the two offline services have in common: the
 * dictionary packs (dictionary/manager.ts) and the Bergamot models
 * (bergamot/manager.ts). Each keeps the catalog of its service
 * (catalog-cache.ts), lists, installs and removes directions in its
 * IndexedDB database, and names the installed data in the cache key of its
 * translations. They live in the background page, which hands their work to
 * the extension pages (background/offline-admin.ts).
 */

import type { Catalog, OfflineService } from "../shared/offline-needs"

/** The directions of a service, and why its catalog is missing from them. */
export interface OfflineListing<T> {
  /** The directions of the catalog and the installed ones. */
  items: T[]
  /** Why the catalog could not be read; the items are then the installed directions only. */
  error?: unknown
}

export interface ListOptions {
  /** Read the catalog again, whatever its age. */
  refresh?: boolean
  /** Release tag of the dictionary packs, when it differs from the settings (the page may not have saved it yet). */
  tag?: string
}

export interface OfflineManager<T = unknown> {
  readonly service: OfflineService
  /** The directions of the catalog and the installed ones; rejects when nothing can be listed. */
  list(options?: ListOptions): Promise<OfflineListing<T>>
  /** Pair keys the service offers ("en>zh-Hans"), read again when old; null when the catalog cannot be read. */
  catalog(): Promise<Catalog>
  /** Pair keys of the installed directions. */
  installedKeys(): Promise<Set<string>>
  /** Download and store a direction; `onProgress` gets the bytes received and the total. */
  install(src: string, tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal, options?: Pick<ListOptions, "tag">): Promise<void>
  remove(src: string, tgt: string): Promise<void>
  /** Hash of the installed directions and their versions: part of the cache key of every translation of the service. */
  signature(): Promise<string>
}
