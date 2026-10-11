/**
 * Offline models (Bergamot) for the settings page: list, install with
 * progress and cancel, remove, and the directions a language pair needs.
 * Everything runs in the background script, where the engine lives, so the
 * engine notices every change. Progress is polled by the page.
 */

import { getBergamot, requiredPairs } from "../offline/bergamot"
import { normalizeBergamotLang } from "../offline/bergamot/languages"
import { describeError } from "../shared/errors"
import { getI18n } from "../shared/i18n"
import { pairKey } from "../shared/languages"
import type { BergamotRequest, BergamotResult } from "../shared/messages"

/** Running installations by "src>tgt" (model tags); a second request for the same pair shares the first one's progress, cancellation and result. */
const installs = new Map<string, { done: number; total: number; controller: AbortController; result: Promise<BergamotResult> }>()

const failure = (error: unknown): BergamotResult => ({ ok: false, error: describeError(error, getI18n()) })

const installKey = (src: string, tgt: string) => pairKey(normalizeBergamotLang(src), normalizeBergamotLang(tgt))

function install(src: string, tgt: string): Promise<BergamotResult> {
  const key = installKey(src, tgt)
  const running = installs.get(key)
  if (running) return running.result
  const entry = { done: 0, total: 0, controller: new AbortController(), result: Promise.resolve<BergamotResult>({ ok: true }) }
  installs.set(key, entry)
  entry.result = (async (): Promise<BergamotResult> => {
    try {
      await getBergamot().install(src, tgt, (done, total) => Object.assign(entry, { done, total }), entry.controller.signal)
      return { ok: true }
    } catch (error) {
      return entry.controller.signal.aborted ? { ok: false, cancelled: true } : failure(error)
    } finally {
      installs.delete(key)
    }
  })()
  return entry.result
}

export async function handleBergamot(req: BergamotRequest): Promise<unknown> {
  switch (req.type) {
    case "bergamotList":
      try {
        return { ok: true, pairs: await getBergamot().listPairs(req.refresh === true) } satisfies BergamotResult
      } catch (error) {
        return failure(error)
      }
    case "bergamotProgress":
      return Object.fromEntries([...installs].map(([key, { done, total }]) => [key, { done, total }]))
    case "bergamotInstall":
      return install(req.src, req.tgt)
    case "bergamotCancel":
      return installs.get(installKey(req.src, req.tgt))?.controller.abort()
    case "bergamotRemove":
      try {
        await getBergamot().remove(req.src, req.tgt)
        return { ok: true } satisfies BergamotResult
      } catch (error) {
        return failure(error)
      }
    case "bergamotRequired":
      try {
        const required = requiredPairs(req.src, req.tgt)
        return { required, missing: await getBergamot().missingPairs(required) }
      } catch {
        // Unknown language: nothing can be said.
        return { required: [], missing: [] }
      }
  }
}
