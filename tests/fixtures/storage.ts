/** A storage area (storage.local) of the extension API: values are copied in and out, writes are announced through onChanged. */
import { vi } from "vitest"
import { type FakeEvent, fakeEvent } from "./events"

export type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>

export interface StorageAreaOptions {
  /** Second argument of the onChanged listeners. */
  areaName?: string
  /** storage.onChanged of the extension API, shared by its areas. */
  onChanged?: FakeEvent<[StorageChanges, string]>
  /**
   * A write announces its change before it reports back (true, the default),
   * so a listener sees the change while the writer still waits; false: after.
   * The order matters while writes are held, see hold().
   */
  changeBeforeWriteEnds?: boolean
}

export function fakeStorageArea(initial: Record<string, unknown> = {}, { areaName = "local", onChanged = fakeEvent(), changeBeforeWriteEnds = true }: StorageAreaOptions = {}) {
  /** What the area holds; tests may read and change it directly. */
  const data: Record<string, unknown> = structuredClone(initial)
  let failure: Error | null = null
  let gate: Promise<void> | null = null
  return {
    data,
    onChanged,
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(data[key]) })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      if (failure) throw failure
      const changes: StorageChanges = {}
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: data[key], newValue: structuredClone(value) }
        data[key] = structuredClone(value)
      }
      const held = gate
      if (changeBeforeWriteEnds) onChanged.fire(changes, areaName)
      if (held) await held
      if (!changeBeforeWriteEnds) onChanged.fire(changes, areaName)
    }),
    remove: vi.fn(async (key: string) => void delete data[key]),
    /** Writes from now on store their values but do not report back until the returned function is called. */
    hold(): () => void {
      let release!: () => void
      gate = new Promise<void>((resolve) => (release = resolve))
      return () => {
        gate = null
        release()
      }
    },
    /** Writes from now on fail with `error` and store nothing; false: they succeed again. */
    failWrites(error: Error | false = new Error("quota exceeded")) {
      failure = error || null
    },
    /** Announce the current values of `keys` as written elsewhere (another page, the background script). */
    announce(...keys: string[]) {
      onChanged.fire(Object.fromEntries(keys.map((key) => [key, { newValue: structuredClone(data[key]) }])), areaName)
    },
  }
}

export type FakeStorageArea = ReturnType<typeof fakeStorageArea>
