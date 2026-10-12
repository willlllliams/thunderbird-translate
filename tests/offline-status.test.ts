/** What the offline services lack for a pair of languages (background/offline-status.ts), from the catalogs and installed sets of their managers. */
import { describe, expect, it, vi } from "vitest"
import { createOfflineStatus } from "../src/background/offline-status"
import type { OfflineService } from "../src/shared/offline-needs"
import type { Settings } from "../src/shared/settings"

const both: Settings["tiers"] = { dictionary: "dictionary", machine: "bergamot", ai: null }

/** A manager stand-in: its catalog (null: not readable) and its installed keys (a rejection: the store cannot be read). */
function manager(catalog: string[] | null, installed: () => Promise<string[]> = async () => []) {
  return {
    catalog: vi.fn(async () => catalog && new Set(catalog)),
    installedKeys: vi.fn(async () => new Set(await installed())),
  }
}

function source(managers: Record<OfflineService, ReturnType<typeof manager>>) {
  return createOfflineStatus({ manager: (service) => managers[service] })
}

describe("offline status", () => {
  it("says what the offline services of the tiers lack for the languages", async () => {
    const offline = source({ dictionary: manager(["ja>en", "en>zh-Hans"], async () => ["en>zh-Hans"]), bergamot: manager(["en>zh-Hans", "ja>en"], async () => ["en>zh-Hans"]) })
    expect(await offline.status("ja", "zh-CN", both)).toEqual({
      dictionary: { required: ["ja>en", "en>zh-Hans"], missing: ["ja>en"], unsupported: false },
      bergamot: { required: ["ja>en", "en>zh-Hans"], missing: ["ja>en"], unsupported: false },
    })
    expect(await offline.status("ja", "zh-CN", { dictionary: "dictionary", machine: null, ai: null })).toEqual({
      dictionary: { required: ["ja>en", "en>zh-Hans"], missing: ["ja>en"], unsupported: false },
    })
    expect(await offline.status("auto", "zh-CN", { dictionary: null, machine: "google-free", ai: null })).toEqual({})
  })

  it("names nothing to download while a catalog is unknown", async () => {
    const offline = source({ dictionary: manager(null), bergamot: manager([]) })
    expect(await offline.status("auto", "zh-CN", both)).toEqual({
      dictionary: { required: ["en>zh-Hans"], missing: [], unsupported: false },
      bergamot: { required: [], missing: [], unsupported: true },
    })
  })

  it("says nothing about a service whose store cannot be read", async () => {
    const offline = source({ dictionary: manager([], () => Promise.reject(new Error("db gone"))), bergamot: manager([], () => Promise.reject(new Error("db gone"))) })
    expect(await offline.status("ja", "zh-CN", both)).toEqual({})
  })

  it("reads the catalogs of the offline services in use ahead", () => {
    const managers = { dictionary: manager([]), bergamot: manager([]) }
    const offline = source(managers)
    offline.readAhead({ dictionary: null, machine: "google-free", ai: null })
    expect([managers.dictionary.catalog.mock.calls.length, managers.bergamot.catalog.mock.calls.length]).toEqual([0, 0])
    offline.readAhead({ dictionary: "dictionary", machine: null, ai: null })
    expect([managers.dictionary.catalog.mock.calls.length, managers.bergamot.catalog.mock.calls.length]).toEqual([1, 0])
    offline.readAhead(both)
    expect([managers.dictionary.catalog.mock.calls.length, managers.bergamot.catalog.mock.calls.length]).toEqual([2, 1])
  })
})
