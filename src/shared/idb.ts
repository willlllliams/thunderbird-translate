/** IndexedDB as promises, for the dictionary packs and the offline models. */

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Settles when the transaction has committed. */
export function idbCommit(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"))
  })
}

/**
 * A database opened on first use and kept open. A failed open is tried again
 * on the next use. When another page upgrades the schema, this connection
 * closes so the upgrade can proceed, and the next use opens it again.
 */
export function lazyDatabase(factory: () => IDBFactory, name: string, version: number, upgrade: (db: IDBDatabase) => void): () => Promise<IDBDatabase> {
  let db: Promise<IDBDatabase> | null = null
  return () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory().open(name, version)
      request.onupgradeneeded = () => upgrade(request.result)
      request.onsuccess = () => {
        const opened = request.result
        opened.onversionchange = () => {
          opened.close()
          db = null
        }
        resolve(opened)
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error("IndexedDB open blocked"))
    }).catch((error) => {
      db = null
      throw error
    }))
}
