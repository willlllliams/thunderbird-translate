/**
 * Background-side owner of the Bergamot worker.
 *
 * - One worker, started on first use. Requests are serialized.
 * - At most `maxModels` direction pairs stay loaded (default 2, enough for a
 *   translation through English); the least recently used one is unloaded
 *   to make room.
 * - After `idleMs` without requests (default 5 minutes) the worker is
 *   terminated: the wasm heap never shrinks, so this is the only way to give
 *   the memory back.
 * - A worker that does not answer a request within `timeoutMs` (default 2
 *   minutes) is terminated; the next request starts a fresh one.
 */

import type { WorkerModelFile, WorkerRequest, WorkerResponse } from "./protocol"

/** What the engine needs from a Worker; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: { data: WorkerResponse }) => void) | null
  onerror: ((event: { message?: string } | Event) => void) | null
}

interface PairPayload {
  src: string
  tgt: string
  files: WorkerModelFile[]
}

export interface EngineOptions {
  createWorker: () => WorkerLike
  /** Compressed files of an installed pair, by pairKey(). */
  loadPair: (key: string) => Promise<PairPayload>
  maxModels?: number
  idleMs?: number
  timeoutMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

const DEFAULT_MAX_MODELS = 2
const DEFAULT_IDLE_MS = 5 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000

export class EngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EngineError"
  }
}

export class BergamotEngine {
  private worker: WorkerLike | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>()
  /** Loaded pair keys, least recently used first. */
  private loaded: string[] = []
  private chain: Promise<unknown> = Promise.resolve()
  private busy = 0
  private idleTimer: unknown = null

  private readonly maxModels: number
  private readonly idleMs: number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  constructor(private readonly options: EngineOptions) {
    this.maxModels = Math.max(2, options.maxModels ?? DEFAULT_MAX_MODELS)
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  }

  /** Pair keys currently loaded in the worker, least recently used first. */
  get loadedPairs(): readonly string[] {
    return this.loaded
  }

  get running(): boolean {
    return this.worker !== null
  }

  /** Translate with one pair key, or two keys through English. */
  translate(keys: string[], texts: string[]): Promise<string[]> {
    return this.serialize(async () => {
      try {
        for (const key of keys) await this.ensureLoaded(key, keys)
        const res = await this.request({ id: 0, type: "translate", keys, texts })
        const result = res.result ?? []
        if (result.length !== texts.length) throw new EngineError(`engine returned ${result.length} translations for ${texts.length} texts`)
        return result
      } catch (e) {
        // A failure inside wasm can leave the module in an unknown state: start a fresh worker next time.
        if (e instanceof EngineError) this.kill(e)
        throw e
      }
    })
  }

  /** Drop a pair from the worker (after it was removed or reinstalled). */
  forget(key: string): Promise<void> {
    return this.serialize(async () => {
      if (!this.loaded.includes(key)) return
      await this.request({ id: 0, type: "unload", key })
      this.loaded = this.loaded.filter((k) => k !== key)
    })
  }

  /** Terminate the worker now. */
  shutdown(): void {
    if (this.idleTimer !== null) this.clearTimer(this.idleTimer)
    this.idleTimer = null
    this.kill(new EngineError("offline engine stopped"))
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    this.busy++
    if (this.idleTimer !== null) {
      this.clearTimer(this.idleTimer)
      this.idleTimer = null
    }
    const run = this.chain.then(task)
    this.chain = run.catch(() => {})
    return run.finally(() => {
      if (--this.busy === 0 && this.worker) this.idleTimer = this.setTimer(() => this.onIdle(), this.idleMs)
    })
  }

  private onIdle(): void {
    this.idleTimer = null
    if (this.busy === 0) this.kill(new EngineError("offline engine stopped after idling"))
  }

  private async ensureLoaded(key: string, needed: string[]): Promise<void> {
    if (this.loaded.includes(key)) {
      this.loaded = [...this.loaded.filter((k) => k !== key), key]
      return
    }
    while (this.loaded.length >= this.maxModels) {
      const victim = this.loaded.find((k) => !needed.includes(k))
      if (!victim) break
      await this.request({ id: 0, type: "unload", key: victim })
      this.loaded = this.loaded.filter((k) => k !== victim)
    }
    const payload = await this.options.loadPair(key)
    await this.request(
      { id: 0, type: "load", key, src: payload.src, tgt: payload.tgt, files: payload.files },
      payload.files.map((f) => f.bytes),
    )
    this.loaded.push(key)
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker
    const worker = this.options.createWorker()
    worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id)
      if (!p) return
      this.pending.delete(data.id)
      p.resolve(data)
    }
    worker.onerror = (event) => {
      const message = (event as { message?: string }).message
      this.kill(new EngineError(message ? `worker error: ${message}` : "worker error"))
    }
    this.worker = worker
    return worker
  }

  private kill(error: Error): void {
    const worker = this.worker
    this.worker = null
    this.loaded = []
    if (worker) {
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
    }
    for (const p of this.pending.values()) p.reject(error)
    this.pending.clear()
  }

  private async request(message: WorkerRequest, transfer: Transferable[] = []): Promise<WorkerResponse & { ok: true }> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timer = this.setTimer(() => {
      // A worker stuck in wasm answers nothing else either: replace it.
      if (this.pending.has(id)) this.kill(new EngineError(`offline engine did not answer within ${Math.round(timeoutMs / 1000)} s`))
    }, timeoutMs)
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        worker.postMessage({ ...message, id }, transfer)
      } catch (e) {
        this.pending.delete(id)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }).finally(() => this.clearTimer(timer))
    if (!response.ok) throw new EngineError(response.error)
    return response
  }
}
