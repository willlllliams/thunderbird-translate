/**
 * Entry of bergamot-worker.js, a classic (non-module) Worker started by the
 * background page. It loads the Emscripten glue with importScripts(), fetches
 * and decompresses the bundled wasm, and serves WorkerRequest messages one at
 * a time.
 */

import { BergamotInternalError } from "./internal-error"
import { GLUE_FILE, WASM_FILE, type WorkerRequest, type WorkerResponse } from "./protocol"
import { createEngineHandler, instantiateBergamot, type LoadBergamot } from "./worker-core"
import { zstdDecompress } from "./verify"

interface WorkerScope {
  location: { href: string }
  importScripts(...urls: string[]): void
  postMessage(message: WorkerResponse): void
  addEventListener(type: "message", listener: (event: { data: WorkerRequest }) => void): void
  loadBergamot?: LoadBergamot
}

const scope = self as unknown as WorkerScope

async function loadEngine() {
  scope.importScripts(new URL(GLUE_FILE, scope.location.href).href)
  if (typeof scope.loadBergamot !== "function") throw new BergamotInternalError(`${GLUE_FILE} did not define loadBergamot`)
  const res = await fetch(new URL(WASM_FILE, scope.location.href).href)
  if (!res.ok) throw new BergamotInternalError(`${WASM_FILE}: HTTP ${res.status}`)
  const wasm = zstdDecompress(new Uint8Array(await res.arrayBuffer()))
  return instantiateBergamot(scope.loadBergamot, wasm)
}

const handle = createEngineHandler(loadEngine)

// Requests run strictly one after another; translation is synchronous inside wasm anyway.
let queue: Promise<void> = Promise.resolve()
scope.addEventListener("message", ({ data }) => {
  queue = queue.then(async () => scope.postMessage(await handle(data)))
})
