/**
 * Offline machine translation with Mozilla's Bergamot engine (the engine of
 * Firefox Translations), for use in the background page.
 *
 * The engine (wasm) ships with the extension; models are downloaded per
 * direction pair from Mozilla Remote Settings and kept in IndexedDB
 * ("tt-bergamot"). Every model has English on one side, so other pairs need
 * two models (see requiredPairs). Details: docs/bergamot.md.
 */

import { browserDetector } from "./detect"
import type { WorkerLike } from "./engine"
import { requiredPairs } from "./languages"
import { type BergamotPairInfo, BergamotManager, type ManagerDeps, type TranslateOptions } from "./manager"
import { WORKER_FILE } from "./protocol"
import { BergamotStore } from "./store"

export { BERGAMOT_MESSAGES, BergamotError, type BergamotMessageKey } from "./errors"
export { type LanguagePair, normalizeBergamotLang, PIVOT, pairKey, requiredPairs } from "./languages"
export type { BergamotPairInfo, ManagerDeps, TranslateOptions } from "./manager"

let manager: BergamotManager | null = null
let overrides: Partial<ManagerDeps> = {}

function defaultDeps(): ManagerDeps {
  return {
    store: new BergamotStore(indexedDB),
    fetch: (input, init) => fetch(input, init),
    createWorker: () => new Worker(browser.runtime.getURL(WORKER_FILE)) as unknown as WorkerLike,
    detector: browserDetector(),
  }
}

/** The shared manager, created on first use. */
export function getBergamot(): BergamotManager {
  manager ??= new BergamotManager({ ...defaultDeps(), ...overrides })
  return manager
}

/**
 * Replace dependencies (model server, fetch, worker factory, detector, timers)
 * for tests and self-tests. Stops the current engine.
 */
export function configureBergamot(deps: Partial<ManagerDeps>): void {
  manager?.engine.shutdown()
  manager = null
  overrides = deps
}

/**
 * Translate plain-text `texts` from `src` to `tgt`. `src` may be "auto":
 * the language is detected with browser.i18n.detectLanguage, falling back
 * to `options.fallbackSource`. Language codes such as "zh-CN" or "zh-TW"
 * are accepted and mapped to the model tags (zh-Hans, zh-Hant). Throws a
 * LocalizedError (BergamotError) with key bergamotModelMissing when a
 * needed pair is not installed.
 */
export function bergamotTranslate(texts: string[], src: string, tgt: string, options?: TranslateOptions): Promise<string[]> {
  return getBergamot().translate(texts, src, tgt, options)
}

/** Pairs offered by Mozilla (fetched and cached) plus installed ones. */
export function listBergamotPairs(forceRefresh = false): Promise<BergamotPairInfo[]> {
  return getBergamot().listPairs(forceRefresh)
}

/** Download, verify and store one direction pair; `onProgress` receives bytes. */
export function installBergamotPair(src: string, tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  return getBergamot().install(src, tgt, onProgress, signal)
}

/** Delete one direction pair; other pairs are not affected. */
export function removeBergamotPair(src: string, tgt: string): Promise<void> {
  return getBergamot().remove(src, tgt)
}

/** Pairs among requiredPairs(src, tgt) that are not installed. */
export function missingBergamotPairs(src: string, tgt: string): Promise<Array<[string, string]>> {
  return getBergamot().missingPairs(requiredPairs(src, tgt))
}
