/**
 * The background script's side of the offline lists: the handlers of
 * background/offline-admin.ts over a real DictionaryManager, which stores
 * into an in-memory IndexedDB and reads the release files from `fetchUrl`,
 * and a stand-in of the Bergamot manager.
 */
import { IDBFactory } from "fake-indexeddb"
import { vi } from "vitest"
import { offlineHandlers } from "../../src/background/offline-admin"
import { DictionaryManager } from "../../src/offline/dictionary/manager"
import { DictionaryStore } from "../../src/offline/dictionary/store"
import type { OfflineManager } from "../../src/offline/manager"
import type { BackgroundRequest, BergamotPairInfo, OfflineItem } from "../../src/shared/messages"
import type { OfflineService } from "../../src/shared/offline-needs"
import { asFetch } from "../helpers"

/** A Bergamot manager that offers `pairs` and installs at once; override what a test needs. */
export function bergamotStandIn(pairs: BergamotPairInfo[] = [], over: Partial<OfflineManager<OfflineItem>> = {}): OfflineManager<OfflineItem> {
  return {
    service: "bergamot",
    list: async () => ({ items: pairs }),
    catalog: async () => new Set(pairs.map((p) => `${p.src}>${p.tgt}`)),
    knownCatalog: () => null,
    installedKeys: async () => new Set(pairs.filter((p) => p.installed).map((p) => `${p.src}>${p.tgt}`)),
    install: async () => {},
    remove: async () => {},
    signature: async () => "",
    ...over,
  }
}

export interface OfflineBackgroundOptions {
  /** Answers the requests for the release files; without it every request fails as offline. */
  fetchUrl?: (url: string) => Promise<Response>
  /** The release tag of the settings. */
  tag?: () => string
  bergamot?: OfflineManager<OfflineItem>
}

export function offlineBackground({ fetchUrl, tag = () => "dicts-v1", bergamot = bergamotStandIn() }: OfflineBackgroundOptions = {}) {
  const idb = new IDBFactory()
  const store = new DictionaryStore(() => idb)
  const fetch = vi.fn(async (url: string) => {
    if (!fetchUrl) throw new TypeError("NetworkError when attempting to fetch resource.")
    return fetchUrl(url)
  })
  const dictionary = new DictionaryManager({ releaseTag: tag, store, fetch: asFetch(fetch) })
  /** Called after every installation and removal, with the service. */
  const changed = vi.fn((_service: OfflineService) => {})
  const handlers = offlineHandlers({ manager: (service) => (service === "dictionary" ? dictionary : bergamot), changed })
  const requests: BackgroundRequest[] = []
  return {
    handlers,
    dictionary,
    store,
    idb,
    fetch,
    changed,
    /** The offline requests the handlers answered. */
    requests,
    /** The answer to an offline request; undefined for any other request. */
    respond(req: BackgroundRequest): unknown {
      if (!Object.hasOwn(handlers, req.type)) return undefined
      requests.push(req)
      return (handlers[req.type as keyof typeof handlers] as (r: BackgroundRequest) => unknown)(req)
    },
  }
}

export type OfflineBackground = ReturnType<typeof offlineBackground>
