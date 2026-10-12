/**
 * The installations of one offline service in the background page, by pair
 * key: a second request for a direction that is being installed shares the
 * first one's progress, cancellation and result, whichever page sent it.
 */

/** How an installation ended. */
export type InstallOutcome = { ok: true } | { ok: false; cancelled: true } | { ok: false; error: unknown }

/** An installation that has not ended: bytes received and expected. */
export interface InstallState {
  done: number
  total: number
}

export interface InstallRegistryOptions {
  /** The pair key of a direction, the same for every spelling of its languages. */
  key: (src: string, tgt: string) => string
  /** Installs a direction; rejects when it fails or `signal` aborts. */
  run: (src: string, tgt: string, onProgress: (done: number, total: number) => void, signal: AbortSignal, tag?: string) => Promise<void>
  /** After each installation, once, whatever its outcome: part of the data may be stored. */
  onEnd?: (key: string, outcome: InstallOutcome) => void
}

interface Entry extends InstallState {
  controller: AbortController
  outcome: Promise<InstallOutcome>
}

export class InstallRegistry {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly options: InstallRegistryOptions) {}

  key(src: string, tgt: string): string {
    return this.options.key(src, tgt)
  }

  /** Install a direction, or join its running installation; `tag` goes to run(). Never rejects. */
  install(src: string, tgt: string, tag?: string): Promise<InstallOutcome> {
    const key = this.key(src, tgt)
    const running = this.entries.get(key)
    if (running) return running.outcome
    const entry: Entry = { done: 0, total: 0, controller: new AbortController(), outcome: Promise.resolve({ ok: true }) }
    this.entries.set(key, entry)
    entry.outcome = (async (): Promise<InstallOutcome> => {
      let outcome: InstallOutcome
      try {
        await this.options.run(src, tgt, (done, total) => Object.assign(entry, { done, total }), entry.controller.signal, tag)
        outcome = { ok: true }
      } catch (error) {
        outcome = entry.controller.signal.aborted ? { ok: false, cancelled: true } : { ok: false, error }
      }
      this.entries.delete(key)
      this.options.onEnd?.(key, outcome)
      return outcome
    })()
    return entry.outcome
  }

  /** Cancel the installation of a direction; nothing happens when none runs. */
  cancel(src: string, tgt: string): void {
    this.entries.get(this.key(src, tgt))?.controller.abort()
  }

  /** The installations that have not ended, by pair key. */
  snapshot(): Record<string, InstallState> {
    return Object.fromEntries([...this.entries].map(([key, { done, total }]) => [key, { done, total }]))
  }
}
