/**
 * IndexedDB database "tt-bergamot": installed direction pairs, their
 * compressed model files and the cached model list.
 *
 * Object stores:
 * - pairs: StoredPair, key "src>tgt".
 * - files: StoredFile, key = sha256 of the compressed file. A pair lists the
 *   hashes it uses; removing a pair deletes files no other pair lists.
 * - meta:  { key, value } entries, e.g. the model list from Remote Settings.
 */

import { BergamotInternalError } from "./internal-error"
import type { ModelFileType } from "./records"

export const DB_NAME = "tt-bergamot"
const DB_VERSION = 1

export interface StoredFileInfo {
  fileType: ModelFileType
  name: string
  /** sha256 of the compressed file; key in the files store. */
  hash: string
  decompressedHash: string
  size: number
  decompressedSize: number
}

export interface StoredPair {
  key: string
  src: string
  tgt: string
  version: string
  architecture: string
  files: StoredFileInfo[]
  bytes: number
  rawBytes: number
  installedAt: number
}

export interface StoredFile {
  hash: string
  /** zstd-compressed bytes as downloaded. */
  bytes: ArrayBuffer
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"))
  })
}

export class BergamotStore {
  private db: Promise<IDBDatabase> | null = null

  constructor(
    private readonly factory: IDBFactory,
    private readonly name = DB_NAME,
  ) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.factory.open(this.name, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains("pairs")) db.createObjectStore("pairs", { keyPath: "key" })
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "hash" })
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" })
      }
      req.onsuccess = () => {
        const db = req.result
        // Another page upgrading the schema: let it proceed and reopen next time.
        db.onversionchange = () => {
          db.close()
          this.db = null
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error("IndexedDB open blocked"))
    }).catch((e) => {
      this.db = null
      throw e
    })
    return this.db
  }

  async listPairs(): Promise<StoredPair[]> {
    const db = await this.open()
    return promisify(db.transaction("pairs").objectStore("pairs").getAll() as IDBRequest<StoredPair[]>)
  }

  async getPair(key: string): Promise<StoredPair | undefined> {
    const db = await this.open()
    return promisify(db.transaction("pairs").objectStore("pairs").get(key) as IDBRequest<StoredPair | undefined>)
  }

  /** Compressed bytes of every file of `pair`, in the pair's file order. */
  async readFiles(pair: StoredPair): Promise<Array<StoredFileInfo & { bytes: ArrayBuffer }>> {
    const db = await this.open()
    const store = db.transaction("files").objectStore("files")
    const rows = await Promise.all(pair.files.map((f) => promisify(store.get(f.hash) as IDBRequest<StoredFile | undefined>)))
    return pair.files.map((f, i) => {
      const row = rows[i]
      if (!row) throw new BergamotInternalError(`model file ${f.name} of ${pair.key} is missing from storage`)
      return { ...f, bytes: row.bytes }
    })
  }

  /**
   * Save a pair and its files in one transaction, replacing an older
   * installation of the same pair; files only the old installation used are
   * deleted.
   */
  async putPair(pair: StoredPair, files: StoredFile[]): Promise<void> {
    const db = await this.open()
    const tx = db.transaction(["pairs", "files"], "readwrite")
    const pairs = tx.objectStore("pairs")
    const fileStore = tx.objectStore("files")
    // Requests are issued from promise continuations of earlier requests, so the transaction stays active.
    const stored = await promisify(pairs.getAll() as IDBRequest<StoredPair[]>)
    const previous = stored.find((p) => p.key === pair.key)
    const others = stored.filter((p) => p.key !== pair.key)
    for (const f of files) fileStore.put(f)
    pairs.put(pair)
    if (previous) {
      const keep = new Set([...others, pair].flatMap((p) => p.files.map((f) => f.hash)))
      for (const f of previous.files) if (!keep.has(f.hash)) fileStore.delete(f.hash)
    }
    await done(tx)
  }

  /** Delete a pair and the files no other pair uses. Returns false when it was not installed. */
  async deletePair(key: string): Promise<boolean> {
    const db = await this.open()
    const tx = db.transaction(["pairs", "files"], "readwrite")
    const pairs = tx.objectStore("pairs")
    const fileStore = tx.objectStore("files")
    const all = await promisify(pairs.getAll() as IDBRequest<StoredPair[]>)
    const target = all.find((p) => p.key === key)
    if (!target) {
      await done(tx)
      return false
    }
    const keep = new Set(all.filter((p) => p.key !== key).flatMap((p) => p.files.map((f) => f.hash)))
    pairs.delete(key)
    for (const f of target.files) if (!keep.has(f.hash)) fileStore.delete(f.hash)
    await done(tx)
    return true
  }

  /** Hashes in the files store (for tests and diagnostics). */
  async fileHashes(): Promise<string[]> {
    const db = await this.open()
    return (await promisify(db.transaction("files").objectStore("files").getAllKeys())).map(String)
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.open()
    const row = await promisify(db.transaction("meta").objectStore("meta").get(key) as IDBRequest<{ key: string; value: T } | undefined>)
    return row?.value
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    const db = await this.open()
    const tx = db.transaction("meta", "readwrite")
    tx.objectStore("meta").put({ key, value })
    await done(tx)
  }

  close(): void {
    void this.db?.then((db) => db.close()).catch(() => {})
    this.db = null
  }
}
