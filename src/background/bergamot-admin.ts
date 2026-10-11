/**
 * Offline models (Bergamot) for the settings page: list, install with
 * progress and cancel, remove, and the directions a language pair needs.
 * Everything runs in the background script, where the engine lives, so the
 * engine notices every change. Progress is polled by the page.
 */

import {
  installBergamotPair,
  listBergamotPairs,
  missingBergamotPairs,
  pairKey,
  removeBergamotPair,
  requiredPairs,
} from "../offline/bergamot"
import { describeError } from "../shared/errors"
import { getI18n } from "../shared/i18n"
import type { BergamotRequest, BergamotResult } from "../shared/messages"

/** Running installations by "src>tgt". */
const installs = new Map<string, { done: number; total: number; controller: AbortController }>()

const failure = (error: unknown): BergamotResult => ({ ok: false, error: describeError(error, getI18n()) })

export async function handleBergamot(req: BergamotRequest): Promise<unknown> {
  switch (req.type) {
    case "bergamotList":
      try {
        return { ok: true, pairs: await listBergamotPairs(req.refresh === true) } satisfies BergamotResult
      } catch (error) {
        return failure(error)
      }
    case "bergamotProgress":
      return Object.fromEntries([...installs].map(([key, { done, total }]) => [key, { done, total }]))
    case "bergamotInstall": {
      const key = pairKey(req.src, req.tgt)
      const install = { done: 0, total: 0, controller: new AbortController() }
      installs.set(key, install)
      try {
        await installBergamotPair(
          req.src,
          req.tgt,
          (done, total) => Object.assign(install, { done, total }),
          install.controller.signal,
        )
        return { ok: true } satisfies BergamotResult
      } catch (error) {
        return install.controller.signal.aborted ? ({ ok: false, cancelled: true } satisfies BergamotResult) : failure(error)
      } finally {
        installs.delete(key)
      }
    }
    case "bergamotCancel":
      return installs.get(pairKey(req.src, req.tgt))?.controller.abort()
    case "bergamotRemove":
      try {
        await removeBergamotPair(req.src, req.tgt)
        return { ok: true } satisfies BergamotResult
      } catch (error) {
        return failure(error)
      }
    case "bergamotRequired":
      try {
        return { required: requiredPairs(req.src, req.tgt), missing: await missingBergamotPairs(req.src, req.tgt) }
      } catch {
        // Unknown language: nothing can be said.
        return { required: [], missing: [] }
      }
  }
}
