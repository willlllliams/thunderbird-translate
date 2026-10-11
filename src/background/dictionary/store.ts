/**
 * Installed dictionary packs in IndexedDB (database "tt-dictionary"), shared
 * by the background script, which reads them, and the settings page, which
 * downloads and deletes them. The description of a pack and its compressed
 * file live in separate object stores, so listing the packs reads no data.
 */

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

export class DictionaryStore {
  private readonly open: () => Promise<IDBDatabase>

  /** `factory` is the IndexedDB to use; tests pass an in-memory one. */
  constructor(factory: () => IDBFactory = () => indexedDB) {
    this.open = lazyDatabase(factory, DB_NAME, 1, (db) => {
      db.createObjectStore(META, { keyPath: "id" })
      db.createObjectStore(DATA)
    })
  }

  async list(): Promise<InstalledPack[]> {
    const db = await this.open()
    return idbRequest(db.transaction(META).objectStore(META).getAll() as IDBRequest<InstalledPack[]>)
  }

  /** The compressed file of a pack, or undefined when it is not installed. */
  async data(id: string): Promise<ArrayBuffer | undefined> {
    const db = await this.open()
    return idbRequest(db.transaction(DATA).objectStore(DATA).get(id) as IDBRequest<ArrayBuffer | undefined>)
  }

  async put(pack: InstalledPack, data: ArrayBuffer): Promise<void> {
    const tx = (await this.open()).transaction([META, DATA], "readwrite")
    tx.objectStore(META).put(pack)
    tx.objectStore(DATA).put(data, pack.id)
    await idbCommit(tx)
  }

  async remove(id: string): Promise<void> {
    const tx = (await this.open()).transaction([META, DATA], "readwrite")
    tx.objectStore(META).delete(id)
    tx.objectStore(DATA).delete(id)
    await idbCommit(tx)
  }
}
