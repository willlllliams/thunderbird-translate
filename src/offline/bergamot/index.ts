/**
 * Offline machine translation with Mozilla's Bergamot engine (the engine of
 * Firefox Translations), for use in the background page.
 *
 * The engine (wasm) ships with the extension; models are downloaded per
 * direction pair from Mozilla Remote Settings and kept in IndexedDB
 * ("tt-bergamot"). Every model has English on one side, so other pairs need
 * two models (see shared/offline-needs.ts). Details: docs/bergamot.md.
 */

import type { WorkerLike } from "./engine"
import { BergamotManager } from "./manager"
import { WORKER_FILE } from "./protocol"
import { BergamotStore } from "./store"

declare const __E2E__: boolean
declare const __E2E_SERVER__: string

let manager: BergamotManager | null = null

/** The manager of the background page, created on first use with the browser's IndexedDB, fetch and Worker. */
export function getBergamot(): BergamotManager {
  manager ??= new BergamotManager({
    store: new BergamotStore(indexedDB),
    // Test build (npm run e2e): the model list of the local mock server instead of Mozilla's.
    serverUrl: __E2E__ ? `${__E2E_SERVER__}/bergamot/v1/` : undefined,
    fetch: (input, init) => fetch(input, init),
    createWorker: () => new Worker(browser.runtime.getURL(WORKER_FILE)) as unknown as WorkerLike,
  })
  return manager
}
