/**
 * Installed dictionary packs in IndexedDB (database "tt-dictionary"), read
 * and written by the background script (dictionary/manager.ts). The
 * description of a pack and its compressed file live in separate object
 * stores, so listing the packs reads no data. A failure of the database
 * fails with the localized error dictionaryStorageFailed and the cause as
 * its detail.
 */

import { LocalizedError } from "../../shared/errors"
import { idbCommit, idbRequest, lazyDatabase } from "../../shared/idb"

export interface InstalledPack {
  /** pairKey(src, tgt). */
  id: string
  src: string
  tgt: string
  version: string
  source: string
  license: string
  attribution: string
  /** Size of the compressed file. */
  bytes: number
  entries: number
  forms: number
}

const DB_NAME = "tt-dictionary"
const META = "packs"
const DATA = "data"

/** The work of `operation`, failing with dictionaryStorageFailed. */
async function stored<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw new LocalizedError("dictionaryStorageFailed", [], error instanceof Error ? error.message || error.name : String(error))
  }
}

export class DictionaryStore {
  private readonly open: () => Promise<IDBDatabase>

  /** `factory` is the IndexedDB to use; tests pass an in-memory one. */
  constructor(factory: () => IDBFactory = () => indexedDB) {
    this.open = lazyDatabase(factory, DB_NAME, 1, (db) => {
      db.createObjectStore(META, { keyPath: "id" })
      db.createObjectStore(DATA)
    })
  }

  list(): Promise<InstalledPack[]> {
    return stored(async () => {
      const db = await this.open()
      return idbRequest(db.transaction(META).objectStore(META).getAll() as IDBRequest<InstalledPack[]>)
    })
  }

  /** The compressed file of a pack, or undefined when it is not installed. */
  data(id: string): Promise<ArrayBuffer | undefined> {
    return stored(async () => {
      const db = await this.open()
      return idbRequest(db.transaction(DATA).objectStore(DATA).get(id) as IDBRequest<ArrayBuffer | undefined>)
    })
  }

  put(pack: InstalledPack, data: ArrayBuffer): Promise<void> {
    return stored(async () => {
      const tx = (await this.open()).transaction([META, DATA], "readwrite")
      tx.objectStore(META).put(pack)
      tx.objectStore(DATA).put(data, pack.id)
      await idbCommit(tx)
    })
  }

  remove(id: string): Promise<void> {
    return stored(async () => {
      const tx = (await this.open()).transaction([META, DATA], "readwrite")
      tx.objectStore(META).delete(id)
      tx.objectStore(DATA).delete(id)
      await idbCommit(tx)
    })
  }
}
