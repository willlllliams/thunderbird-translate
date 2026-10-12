/**
 * What the offline services (dictionary, Bergamot) lack for a pair of
 * languages, from their catalogs and what is installed. The catalogs of the
 * services in use are read ahead; translations take the catalogs read so far
 * and never wait for the network.
 */

import { getBergamot } from "../offline/bergamot"
import { CatalogCache } from "../offline/catalog-cache"
import { fetchDictionaryIndex } from "../offline/dictionary/download"
import { releaseFetch } from "../hooks/servers"
import { pairKey } from "../shared/languages"
import type { OfflineStatus } from "../shared/messages"
import { type Catalog, offlineServiceOf, offlineState } from "../shared/offline-needs"
import { TIERS } from "../shared/providers"
import type { TierSettings } from "../shared/settings"

export interface OfflineStatusDeps {
  /** The release tag of the dictionary packs in use. */
  releaseTag: () => string
  /** Pair keys of the installed dictionary packs. */
  installedPacks: () => Promise<Set<string>>
}

export interface OfflineStatusSource {
  /** What the offline services among `tiers` lack for the languages; a store that cannot be read says nothing. */
  status(sourceLang: string, targetLang: string, tiers: TierSettings): Promise<OfflineStatus>
  /** Reads the catalogs of the offline services among `tiers` ahead. */
  readAhead(tiers: TierSettings): void
  /** The dictionary index of the release in use read so far; null before it is read. */
  knownDictionaryCatalog(): Catalog
}

/** The offline services among the services of `tiers`. */
const offlineKinds = (tiers: TierSettings) => TIERS.map((tier) => offlineServiceOf(tiers[tier]))

export function createOfflineStatus({ releaseTag, installedPacks }: OfflineStatusDeps): OfflineStatusSource {
  /** Pair keys of the dictionary packs of each release tag: read again after six hours, after a failed read not before ten minutes. */
  const dictionaryCatalogs = new Map<string, CatalogCache<Set<string>>>()
  const dictionaryCatalog = (): CatalogCache<Set<string>> => {
    const tag = releaseTag()
    let catalog = dictionaryCatalogs.get(tag)
    if (!catalog) {
      catalog = new CatalogCache({ load: async () => new Set((await fetchDictionaryIndex(tag, releaseFetch)).map((p) => pairKey(p.src, p.tgt))) })
      dictionaryCatalogs.set(tag, catalog)
    }
    return catalog
  }

  return {
    async status(sourceLang, targetLang, tiers) {
      const status: OfflineStatus = {}
      const kinds = offlineKinds(tiers)
      await Promise.all([
        kinds.includes("dictionary") &&
          Promise.all([dictionaryCatalog().get(), installedPacks()]).then(
            ([catalog, installed]) => void (status.dictionary = offlineState("dictionary", sourceLang, targetLang, catalog, installed)),
            () => {},
          ),
        kinds.includes("bergamot") &&
          Promise.all([getBergamot().catalog(), getBergamot().installedKeys()]).then(
            ([catalog, installed]) => void (status.bergamot = offlineState("bergamot", sourceLang, targetLang, catalog, installed)),
            () => {},
          ),
      ])
      return status
    },
    readAhead(tiers) {
      const kinds = offlineKinds(tiers)
      if (kinds.includes("dictionary")) void dictionaryCatalog().get()
      if (kinds.includes("bergamot")) void getBergamot().catalog()
    },
    knownDictionaryCatalog: () => dictionaryCatalog().peek(),
  }
}
