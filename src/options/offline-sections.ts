/**
 * The two lists of offline data, dictionary packs and offline models, as the settings page and the setup guide show
 * them: over the elements of the same ids, for the languages and the recommendation of the settings.
 */

import { $ } from "../shared/page"
import type { Settings } from "../shared/settings"
import { BergamotSection } from "./bergamot"
import { DictionarySection } from "./dictionaries"
import { type OfflineListDeps, recommendedFor } from "./offline-list"

/** Both lists over `settings`; `extra` holds what a page adds: the check boxes of the setup guide and what follows a redraw. */
export function offlineSections(settings: () => Settings, extra: Pick<OfflineListDeps, "pick" | "onRender"> = {}): { dictionaries: DictionarySection; bergamot: BergamotSection } {
  const shared = {
    ...extra,
    languages: () => ({ source: settings().sourceLang, target: settings().targetLang }),
    recommended: () => recommendedFor(settings()),
  }
  return {
    dictionaries: new DictionarySection({
      ...shared,
      tag: () => settings().dictionary.releaseTag,
      list: $("dictList"),
      status: $("dictStatus"),
      common: $("dictCommon"),
      filter: $<HTMLInputElement>("dictFilter"),
    }),
    bergamot: new BergamotSection({
      ...shared,
      list: $("bergamotList"),
      status: $("bergamotStatus"),
      common: $("bergamotCommon"),
      needed: $("bergamotNeeded"),
      filter: $<HTMLInputElement>("bergamotFilter"),
    }),
  }
}
