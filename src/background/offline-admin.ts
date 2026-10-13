/**
 * Dictionary packs and offline models for the extension pages: list,
 * install with progress and cancel, remove. The work runs in the background
 * script, which translates with the data, so it goes on after the page that
 * asked for it is closed, also for the directions still waiting in the
 * queue, and a direction two pages ask for is installed once. Requests name
 * their service; each service has its manager (offline/manager.ts) and its
 * installations, two at a time (offline/install-registry.ts).
 *
 * The pages hear of the progress of every installation (offlineProgressChanged, at
 * most every 250 ms) and of every installation that ended and every removal
 * (offlineDataChanged). The content scripts forget their results once the
 * installations of a service have all ended, and after every removal.
 */

import { InstallRegistry, type InstallOutcome } from "../offline/install-registry"
import type { OfflineManager } from "../offline/manager"
import { describeError } from "../shared/errors"
import { getI18n } from "../shared/i18n"
import { pairKey } from "../shared/languages"
import type { BackgroundHandlers, OfflineItem, OfflineProgress, OfflineRequest, OfflineResult, PageNotice } from "../shared/messages"
import { type OfflineService, serviceLang } from "../shared/offline-needs"

/** The pages hear of the progress at most this often. */
export const PROGRESS_INTERVAL_MS = 250

export interface OfflineAdminDeps {
  /** The manager of an offline service. */
  manager: (service: OfflineService) => OfflineManager<OfflineItem>
  /** Tells the content scripts that offline data changed: their results may be outdated. */
  contentScripts: () => void
  /** Sends a notice to the extension pages. */
  pages: (notice: PageNotice) => void
}

const describe = (error: unknown) => describeError(error, getI18n())

const resultOf = (outcome: InstallOutcome): OfflineResult => (outcome.ok ? { ok: true } : "cancelled" in outcome ? { ok: false, cancelled: true } : { ok: false, error: describe(outcome.error) })

/** The pair key of a direction in the language tags of the service ("zh-CN" → "zh-Hans"). */
const keyOf = (service: OfflineService) => (src: string, tgt: string) => pairKey(serviceLang(service, src) ?? src, serviceLang(service, tgt) ?? tgt)

export function offlineHandlers({ manager, contentScripts, pages }: OfflineAdminDeps): Pick<BackgroundHandlers, OfflineRequest["type"]> {
  const registries = new Map<OfflineService, InstallRegistry>()
  const progress = (): OfflineProgress => Object.fromEntries([...registries].map(([service, installs]) => [service, installs.snapshot()]))
  let progressTimer: ReturnType<typeof setTimeout> | null = null
  const progressChanged = () => {
    progressTimer ??= setTimeout(() => {
      progressTimer = null
      pages({ type: "offlineProgressChanged", progress: progress() })
    }, PROGRESS_INTERVAL_MS)
  }
  const registry = (service: OfflineService): InstallRegistry => {
    let found = registries.get(service)
    if (!found) {
      const installs = new InstallRegistry({
        key: keyOf(service),
        run: (src, tgt, onProgress, signal, tag) => manager(service).install(src, tgt, onProgress, signal, { tag }),
        onChange: progressChanged,
        onEnd: () => {
          pages({ type: "offlineDataChanged" })
          if (!installs.busy) contentScripts()
        },
      })
      registries.set(service, installs)
      found = installs
    }
    return found
  }
  const remove = async (service: OfflineService, src: string, tgt: string): Promise<OfflineResult> => {
    try {
      await manager(service).remove(src, tgt)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: describe(error) }
    } finally {
      pages({ type: "offlineDataChanged" })
      contentScripts()
    }
  }

  return {
    offlineList: async ({ service, refresh, tag }) => {
      try {
        const { items, error } = await manager(service).list({ refresh: refresh === true, tag })
        return { ok: true, items, ...(error === undefined ? {} : { error: describe(error) }) }
      } catch (error) {
        return { ok: false, error: describe(error) }
      }
    },
    offlineInstall: async ({ service, pairs, tag }) => {
      const installs = registry(service)
      return (await Promise.all(pairs.map(({ src, tgt }) => installs.install(src, tgt, tag)))).map(resultOf)
    },
    offlineCancel: ({ service, src, tgt }) => registry(service).cancel(src, tgt),
    offlineProgress: () => progress(),
    offlineRemove: ({ service, src, tgt }) => remove(service, src, tgt),
  }
}
