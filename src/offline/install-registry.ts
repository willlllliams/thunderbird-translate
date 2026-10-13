/**
 * The installations of one offline service in the background page, by pair
 * key. They run `limit` at a time (two by default) in the order they were
 * asked for; the others wait in a queue. A second request for a direction
 * that is queued or running shares the first one's progress, cancellation
 * and result, whichever page sent it. A cancelled direction that waits in
 * the queue is never downloaded. A request for a direction that was
 * cancelled while running, and has not stopped yet, queues a new
 * installation with its own tag, which starts once the cancelled one ended.
 */

import type { InstallProgress } from "../shared/messages"

/** How an installation ended. */
export type InstallOutcome = { ok: true } | { ok: false; cancelled: true } | { ok: false; error: unknown }


/** Installations of one service that run at the same time. */
export const INSTALL_LIMIT = 2

export interface InstallRegistryOptions {
  /** The pair key of a direction, the same for every spelling of its languages. */
  key: (src: string, tgt: string) => string
  /** Installs a direction; rejects when it fails or `signal` aborts. */
  run: (src: string, tgt: string, onProgress: (done: number, total: number) => void, signal: AbortSignal, tag?: string) => Promise<void>
  limit?: number
  /** After every change of snapshot(): a direction queued, started, progressing, ended or taken off the queue. */
  onChange?: () => void
  /** After each installation that ran, once, whatever its outcome (part of the data may be stored); the next one in the queue has already started. */
  onEnd?: (key: string, outcome: InstallOutcome) => void
}

interface Entry extends InstallProgress {
  src: string
  tgt: string
  tag?: string
  controller: AbortController
  outcome: Promise<InstallOutcome>
  settle: (outcome: InstallOutcome) => void
}

export class InstallRegistry {
  /** Queued and running installations; the order of the map is the order of the queue. */
  private readonly entries = new Map<string, Entry>()
  /** Pair keys whose run() has not returned, also those cancelled and replaced in `entries`. */
  private readonly running = new Set<string>()

  constructor(private readonly options: InstallRegistryOptions) {}

  private key(src: string, tgt: string): string {
    return this.options.key(src, tgt)
  }

  /** Queue a direction, or join its installation; `tag` goes to run(). Resolves when it ends; never rejects. */
  install(src: string, tgt: string, tag?: string): Promise<InstallOutcome> {
    const key = this.key(src, tgt)
    const found = this.entries.get(key)
    if (found && !found.controller.signal.aborted) return found.outcome
    // Cancelled and still stopping: a new installation takes its place, at the end of the queue.
    if (found) this.entries.delete(key)
    let settle!: (outcome: InstallOutcome) => void
    const outcome = new Promise<InstallOutcome>((resolve) => (settle = resolve))
    this.entries.set(key, { state: "queued", done: 0, total: 0, src, tgt, tag, controller: new AbortController(), outcome, settle })
    this.options.onChange?.()
    this.startNext()
    return outcome
  }

  /** Start queued installations while fewer than the limit run; a direction waits until a cancelled run of it has stopped. */
  private startNext(): void {
    for (const [key, entry] of this.entries) {
      if (this.running.size >= (this.options.limit ?? INSTALL_LIMIT)) return
      if (entry.state === "queued" && !this.running.has(key)) void this.start(key, entry)
    }
  }

  private async start(key: string, entry: Entry): Promise<void> {
    entry.state = "running"
    this.running.add(key)
    this.options.onChange?.()
    const onProgress = (done: number, total: number) => {
      Object.assign(entry, { done, total })
      this.options.onChange?.()
    }
    let outcome: InstallOutcome
    try {
      await this.options.run(entry.src, entry.tgt, onProgress, entry.controller.signal, entry.tag)
      outcome = { ok: true }
    } catch (error) {
      outcome = entry.controller.signal.aborted ? { ok: false, cancelled: true } : { ok: false, error }
    }
    this.running.delete(key)
    if (this.entries.get(key) === entry) this.entries.delete(key)
    this.startNext()
    this.options.onEnd?.(key, outcome)
    this.options.onChange?.()
    entry.settle(outcome)
  }

  /** Cancel a direction: a queued one leaves the queue, a running one stops. Nothing happens for a direction that is not being installed. */
  cancel(src: string, tgt: string): void {
    const key = this.key(src, tgt)
    const entry = this.entries.get(key)
    if (entry?.state === "queued") {
      this.entries.delete(key)
      this.options.onChange?.()
      entry.settle({ ok: false, cancelled: true })
    } else {
      entry?.controller.abort()
    }
  }

  /** Whether a direction is queued or running. */
  get busy(): boolean {
    return this.entries.size > 0
  }

  /** The installations that have not ended, by pair key, in the order of the queue. */
  snapshot(): Record<string, InstallProgress> {
    return Object.fromEntries([...this.entries].map(([key, { state, done, total }]) => [key, { state, done, total }]))
  }
}
