/** The requests of the offline lists in the background script (background/offline-admin.ts), over manager stand-ins. */
import { describe, expect, it, vi } from "vitest"
import { offlineHandlers } from "../src/background/offline-admin"
import { LocalizedError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest, BergamotPairInfo } from "../src/shared/messages"
import type { OfflineService } from "../src/shared/offline-needs"
import { bergamotStandIn } from "./fixtures/offline"

const PAIR: BergamotPairInfo = { src: "en", tgt: "zh-Hans", version: "3.0", architecture: "base", bytes: 1, rawBytes: 2, installed: false }

/** An installation that waits for the test: `progress` reports bytes, `finish` ends it, `fail` fails it; it rejects when cancelled. */
function heldInstall() {
  const held = { progress: (_done: number, _total: number) => {}, finish: () => {}, fail: (_error: unknown) => {} }
  const install = vi.fn(
    (_src: string, _tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        Object.assign(held, { progress: onProgress!, finish: resolve, fail: reject })
        signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
      }),
  )
  return { held, install }
}

/** The handlers over a Bergamot stand-in and a dictionary stand-in; `changed` records the services told about. */
function admin(over: { bergamot?: Parameters<typeof bergamotStandIn>[1]; dictionary?: Parameters<typeof bergamotStandIn>[1] } = {}) {
  const managers = { bergamot: bergamotStandIn([PAIR], over.bergamot), dictionary: { ...bergamotStandIn([], over.dictionary), service: "dictionary" as const } }
  const changed = vi.fn((_service: OfflineService) => {})
  const handlers = offlineHandlers({ manager: (service) => managers[service], changed })
  const send = (req: BackgroundRequest) => (handlers[req.type as keyof typeof handlers] as (r: BackgroundRequest) => unknown)(req)
  return { handlers, send, changed, managers }
}

describe("offline lists in the background script", () => {
  it("lists the directions of a service with the tag of the page, and says why a list failed or is incomplete", async () => {
    const list = vi.fn(async () => ({ items: [], error: new LocalizedError("dictIndexFailed", ["offline"]) }))
    const { send } = admin({ dictionary: { list } })
    expect(await send({ type: "offlineList", service: "bergamot", refresh: true })).toEqual({ ok: true, items: [PAIR] })
    expect(await send({ type: "offlineList", service: "dictionary", tag: "dicts-v2" })).toEqual({ ok: true, items: [], error: ENGLISH.t("dictIndexFailed", ["offline"]) })
    expect(list).toHaveBeenCalledWith({ refresh: false, tag: "dicts-v2" })
    list.mockRejectedValueOnce(new LocalizedError("dictionaryStorageFailed"))
    expect(await send({ type: "offlineList", service: "dictionary" })).toEqual({ ok: false, error: ENGLISH.t("dictionaryStorageFailed") })
  })

  it("reports the progress of an installation, and its end", async () => {
    const { held, install } = heldInstall()
    const { send, changed } = admin({ dictionary: { install } })
    const result = send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "de" }], tag: "dicts-v2" })
    await vi.waitFor(() => expect(install).toHaveBeenCalledWith("en", "de", expect.any(Function), expect.any(AbortSignal), { tag: "dicts-v2" }))
    held.progress(5, 10)
    expect(await send({ type: "offlineProgress" })).toEqual({ dictionary: { "en>de": { state: "running", done: 5, total: 10 } } })
    held.finish()
    expect(await result).toEqual([{ ok: true }])
    expect(changed.mock.calls).toEqual([["dictionary"]])
    expect(await send({ type: "offlineProgress" })).toEqual({ dictionary: {} })
  })

  it("installs a direction two pages ask for once, with one progress, one result and one notice", async () => {
    const { held, install } = heldInstall()
    const { send, changed } = admin({ bergamot: { install } })
    const first = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "en", tgt: "zh-Hans" }] })
    await vi.waitFor(() => expect(install).toHaveBeenCalled())
    // The second page names the languages differently.
    const second = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "EN", tgt: "zh-CN" }] })
    held.progress(7, 10)
    expect(await send({ type: "offlineProgress" })).toEqual({ bergamot: { "en>zh-Hans": { state: "running", done: 7, total: 10 } } })
    held.finish()
    expect(await Promise.all([first, second])).toEqual([[{ ok: true }], [{ ok: true }]])
    expect(install).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it("cancels an installation, also one that two pages asked for", async () => {
    const { install } = heldInstall()
    const { send, changed } = admin({ bergamot: { install } })
    const first = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "ja", tgt: "en" }] })
    const second = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "ja", tgt: "en" }] })
    await vi.waitFor(() => expect(install).toHaveBeenCalled())
    expect(await send({ type: "offlineCancel", service: "bergamot", src: "ja", tgt: "en" })).toBeUndefined()
    expect(await Promise.all([first, second])).toEqual([[{ ok: false, cancelled: true }], [{ ok: false, cancelled: true }]])
    // Part of the data may be stored: the content scripts hear of it.
    expect(changed).toHaveBeenCalledTimes(1)
    expect(await send({ type: "offlineCancel", service: "bergamot", src: "xx", tgt: "en" })).toBeUndefined()
  })

  it("describes a failed installation in the interface language", async () => {
    const { send, changed } = admin({ dictionary: { install: () => Promise.reject(new LocalizedError("dictionaryStorageFailed", [], "disk full")) } })
    expect(await send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "de" }] })).toEqual([{ ok: false, error: `${ENGLISH.t("dictionaryStorageFailed")} - disk full` }])
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it("removes a direction and describes a failed removal; the content scripts hear of both", async () => {
    const remove = vi.fn(async () => {})
    const { send, changed } = admin({ dictionary: { remove } })
    expect(await send({ type: "offlineRemove", service: "dictionary", src: "en", tgt: "de" })).toEqual({ ok: true })
    expect(remove).toHaveBeenCalledWith("en", "de")
    remove.mockRejectedValueOnce(new Error("locked"))
    expect(await send({ type: "offlineRemove", service: "dictionary", src: "en", tgt: "de" })).toEqual({ ok: false, error: "locked" })
    expect(changed.mock.calls).toEqual([["dictionary"], ["dictionary"]])
  })
})
