/**
 * What the offline services (dictionary, Bergamot) lack for a pair of
 * languages, from their catalogs and what is installed. The catalogs of the
 * services in use are read ahead; translations take the catalogs read so far
 * and never wait for the network.
 */

import type { OfflineManager } from "../offline/manager"
import type { OfflineStatus } from "../shared/messages"
import { type OfflineService, offlineServiceOf, offlineState } from "../shared/offline-needs"
import { TIERS } from "../shared/providers"
import type { TierSettings } from "../shared/settings"

export interface OfflineStatusDeps {
  /** The manager of an offline service. */
  manager: (service: OfflineService) => Pick<OfflineManager, "catalog" | "installedKeys">
}

export interface OfflineStatusSource {
  /** What the offline services among `tiers` lack for the languages; a store that cannot be read says nothing. */
  status(sourceLang: string, targetLang: string, tiers: TierSettings): Promise<OfflineStatus>
  /** Reads the catalogs of the offline services among `tiers` ahead. */
  readAhead(tiers: TierSettings): void
}

/** The offline services among the services of `tiers`, each once. */
const offlineKinds = (tiers: TierSettings) => [...new Set(TIERS.map((tier) => offlineServiceOf(tiers[tier])).filter((kind) => kind !== undefined))]

export function createOfflineStatus({ manager }: OfflineStatusDeps): OfflineStatusSource {
  return {
    async status(sourceLang, targetLang, tiers) {
      const status: OfflineStatus = {}
      await Promise.all(
        offlineKinds(tiers).map((kind) =>
          Promise.all([manager(kind).catalog(), manager(kind).installedKeys()]).then(
            ([catalog, installed]) => void (status[kind] = offlineState(kind, sourceLang, targetLang, catalog, installed)),
            () => {},
          ),
        ),
      )
      return status
    },
    readAhead(tiers) {
      for (const kind of offlineKinds(tiers)) void manager(kind).catalog()
    },
  }
}
