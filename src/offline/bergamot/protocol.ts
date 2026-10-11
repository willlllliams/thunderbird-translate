/**
 * Messages between the background page and bergamot-worker.js.
 *
 * Every request carries an id; the worker answers each request exactly once
 * with the same id, in the order the requests arrived.
 */

/** One model file, still zstd-compressed. */
export interface WorkerModelFile {
  fileType: string
  name: string
  bytes: ArrayBuffer
}

export type WorkerRequest =
  /** Load a direction pair into the engine under `key`; the worker loads the wasm first if needed. */
  | { id: number; type: "load"; key: string; src: string; tgt: string; files: WorkerModelFile[] }
  /** Free a loaded pair. */
  | { id: number; type: "unload"; key: string }
  /** Translate plain-text `texts` with one pair, or two pairs through English. */
  | { id: number; type: "translate"; keys: string[]; texts: string[] }

export type WorkerResponse =
  | { id: number; ok: true; result?: string[] }
  | { id: number; ok: false; error: string }

/** Path of the worker script inside the extension. */
export const WORKER_FILE = "bergamot-worker.js"
/** Paths the worker resolves relative to its own URL. */
export const GLUE_FILE = "bergamot-translator.js"
export const WASM_FILE = "bergamot-translator.wasm.zst"
