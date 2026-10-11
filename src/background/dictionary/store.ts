/**
 * Installed dictionary packs in IndexedDB (database "tt-dictionary"), shared
 * by the background script, which reads them, and the settings page, which
 * downloads and deletes them. The description of a pack and its compressed
 * file live in separate object stores, so listing the packs reads no data.
 */

export interface InstalledPack {
  /** "<src>><tgt>", see packId(). */
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

export const packId = (src: string, tgt: string) => `${src}>${tgt}`

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export class DictionaryStore {
  private db: Promise<IDBDatabase> | null = null

  /** `factory` is the IndexedDB to use; tests pass an in-memory one. */
  constructor(private readonly factory: () => IDBFactory = () => indexedDB) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory().open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(META, { keyPath: "id" })
        request.result.createObjectStore(DATA)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).catch((error) => {
      this.db = null
      throw error
    })
    return this.db
  }

  async list(): Promise<InstalledPack[]> {
    const db = await this.open()
    return done(db.transaction(META).objectStore(META).getAll() as IDBRequest<InstalledPack[]>)
  }

  /** The compressed file of a pack, or undefined when it is not installed. */
  async data(id: string): Promise<ArrayBuffer | undefined> {
    const db = await this.open()
    return done(db.transaction(DATA).objectStore(DATA).get(id) as IDBRequest<ArrayBuffer | undefined>)
  }

  async put(pack: InstalledPack, data: ArrayBuffer): Promise<void> {
    const tx = (await this.open()).transaction([META, DATA], "readwrite")
    tx.objectStore(META).put(pack)
    tx.objectStore(DATA).put(data, pack.id)
    await committed(tx)
  }

  async remove(id: string): Promise<void> {
    const tx = (await this.open()).transaction([META, DATA], "readwrite")
    tx.objectStore(META).delete(id)
    tx.objectStore(DATA).delete(id)
    await committed(tx)
  }
}
