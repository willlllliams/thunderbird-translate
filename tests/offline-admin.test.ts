/** The requests of the offline lists in the background script (background/offline-admin.ts), over manager stand-ins, on simulated time. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { offlineHandlers, PROGRESS_INTERVAL_MS } from "../src/background/offline-admin"
import { LocalizedError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest, BergamotPairInfo, PageNotice } from "../src/shared/messages"
import { bergamotStandIn } from "./fixtures/offline"
import { nextTask, useFakeTimers } from "./helpers"

beforeEach(() => useFakeTimers())
afterEach(() => vi.useRealTimers())

const PAIR: BergamotPairInfo = { src: "en", tgt: "zh-Hans", version: "3.0", architecture: "base", bytes: 1, rawBytes: 2, installed: false }

/** Installations that wait for the test, by "src>tgt": `progress` reports bytes, `finish` ends one, `fail` fails it; each rejects when cancelled. */
function heldInstalls() {
  const held = new Map<string, { progress: (done: number, total: number) => void; finish: () => void; fail: (error: unknown) => void }>()
  const install = vi.fn(
    (src: string, tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        held.set(`${src}>${tgt}`, { progress: onProgress!, finish: resolve, fail: reject })
        signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
      }),
  )
  const started = () => install.mock.calls.map(([src, tgt]) => `${src}>${tgt}`)
  return { held, install, started, one: (key: string) => held.get(key)! }
}

/** The handlers over a Bergamot stand-in and a dictionary stand-in; records the notices to content scripts and pages. */
function admin(over: { bergamot?: Parameters<typeof bergamotStandIn>[1]; dictionary?: Parameters<typeof bergamotStandIn>[1] } = {}) {
  const managers = { bergamot: bergamotStandIn([PAIR], over.bergamot), dictionary: { ...bergamotStandIn([], over.dictionary), service: "dictionary" as const } }
  const contentScripts = vi.fn(() => {})
  const pages = vi.fn((_notice: PageNotice) => {})
  const handlers = offlineHandlers({ manager: (service) => managers[service], contentScripts, pages })
  const send = (req: BackgroundRequest) => (handlers[req.type as keyof typeof handlers] as (r: BackgroundRequest) => unknown)(req)
  const notices = () => ({ contentScripts: contentScripts.mock.calls.length, pages: pages.mock.calls.filter(([n]) => n.type === "offlineDataChanged").length })
  const broadcasts = () => pages.mock.calls.flatMap(([n]) => (n.type === "offlineProgress" ? [n.progress] : []))
  return { handlers, send, notices, broadcasts, managers }
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

  it("reports the progress of an installation to the pages at most every 250 ms, and its end", async () => {
    const installs = heldInstalls()
    const { send, notices, broadcasts } = admin({ dictionary: { install: installs.install } })
    const result = send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "de" }], tag: "dicts-v2" })
    expect(installs.install).toHaveBeenCalledWith("en", "de", expect.any(Function), expect.any(AbortSignal), { tag: "dicts-v2" })
    for (const done of [1, 2, 5]) installs.one("en>de").progress(done, 10)
    expect(await send({ type: "offlineProgress" })).toEqual({ dictionary: { "en>de": { state: "running", done: 5, total: 10 } } })
    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS - 1)
    expect(broadcasts()).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(broadcasts()).toEqual([{ dictionary: { "en>de": { state: "running", done: 5, total: 10 } } }])
    installs.one("en>de").finish()
    expect(await result).toEqual([{ ok: true }])
    expect(notices()).toEqual({ contentScripts: 1, pages: 1 })
    expect(await send({ type: "offlineProgress" })).toEqual({ dictionary: {} })
    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS)
    expect(broadcasts().at(-1)).toEqual({ dictionary: {} })
  })

  it("installs a direction two pages ask for once, with one progress, one result and one notice", async () => {
    const installs = heldInstalls()
    const { send, notices } = admin({ bergamot: { install: installs.install } })
    const first = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "en", tgt: "zh-Hans" }] })
    // The second page names the languages differently.
    const second = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "EN", tgt: "zh-CN" }] })
    installs.one("en>zh-Hans").progress(7, 10)
    expect(await send({ type: "offlineProgress" })).toEqual({ bergamot: { "en>zh-Hans": { state: "running", done: 7, total: 10 } } })
    installs.one("en>zh-Hans").finish()
    expect(await Promise.all([first, second])).toEqual([[{ ok: true }], [{ ok: true }]])
    expect(installs.install).toHaveBeenCalledTimes(1)
    expect(notices()).toEqual({ contentScripts: 1, pages: 1 })
  })

  it("runs five directions of one request two at a time, never downloads a cancelled queued one, and tells the content scripts once at the end", async () => {
    const installs = heldInstalls()
    const { send, notices } = admin({ dictionary: { install: installs.install } })
    const pairs = ["en>de", "de>en", "en>fr", "fr>en", "en>ja"].map((key) => ({ src: key.split(">")[0]!, tgt: key.split(">")[1]! }))
    const result = send({ type: "offlineInstall", service: "dictionary", pairs })
    expect(installs.started()).toEqual(["en>de", "de>en"])
    const states = async () => Object.entries(((await send({ type: "offlineProgress" })) as { dictionary: Record<string, { state: string }> }).dictionary).map(([key, { state }]) => `${key} ${state}`)
    expect(await states()).toEqual(["en>de running", "de>en running", "en>fr queued", "fr>en queued", "en>ja queued"])
    await send({ type: "offlineCancel", service: "dictionary", src: "fr", tgt: "en" })
    expect(await states()).toEqual(["en>de running", "de>en running", "en>fr queued", "en>ja queued"])
    installs.one("de>en").finish()
    await vi.waitFor(() => expect(installs.started()).toEqual(["en>de", "de>en", "en>fr"]))
    // An installation ended while others run: the pages hear of it, the content scripts not yet.
    expect(notices()).toEqual({ contentScripts: 0, pages: 1 })
    installs.one("en>de").fail(new Error("disk full"))
    await vi.waitFor(() => expect(installs.started()).toEqual(["en>de", "de>en", "en>fr", "en>ja"]))
    installs.one("en>fr").finish()
    installs.one("en>ja").finish()
    expect(await result).toEqual([{ ok: false, error: "disk full" }, { ok: true }, { ok: true }, { ok: false, cancelled: true }, { ok: true }])
    expect(installs.started()).not.toContain("fr>en")
    expect(notices()).toEqual({ contentScripts: 1, pages: 4 })
  })

  it("keeps installing the directions of a page that is gone, the queued ones too", async () => {
    const installs = heldInstalls()
    const { send, notices } = admin({ dictionary: { install: installs.install } })
    // Nobody waits for the answer.
    void send({ type: "offlineInstall", service: "dictionary", pairs: ["en>de", "de>en", "en>fr"].map((key) => ({ src: key.split(">")[0]!, tgt: key.split(">")[1]! })) })
    installs.one("en>de").finish()
    installs.one("de>en").finish()
    await vi.waitFor(() => expect(installs.started()).toContain("en>fr"))
    installs.one("en>fr").finish()
    await vi.waitFor(() => expect(notices()).toEqual({ contentScripts: 1, pages: 3 }))
  })

  it("cancels a running installation, also one that two pages asked for", async () => {
    const installs = heldInstalls()
    const { send, notices } = admin({ bergamot: { install: installs.install } })
    const first = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "ja", tgt: "en" }] })
    const second = send({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "ja", tgt: "en" }] })
    expect(await send({ type: "offlineCancel", service: "bergamot", src: "ja", tgt: "en" })).toBeUndefined()
    expect(await Promise.all([first, second])).toEqual([[{ ok: false, cancelled: true }], [{ ok: false, cancelled: true }]])
    // Part of the data may be stored: the content scripts hear of it.
    expect(notices()).toEqual({ contentScripts: 1, pages: 1 })
    expect(await send({ type: "offlineCancel", service: "bergamot", src: "xx", tgt: "en" })).toBeUndefined()
    await nextTask()
    expect(notices()).toEqual({ contentScripts: 1, pages: 1 })
  })

  it("queues a new installation with its own tag when the direction asked for is cancelled but still running", async () => {
    const runs: { tag?: string; signal: AbortSignal; end: (error?: unknown) => void }[] = []
    // An installation that notices its cancellation only when its download step ends.
    const install = vi.fn(
      (_src: string, _tgt: string, _onProgress?: (done: number, total: number) => void, signal?: AbortSignal, options?: { tag?: string }) =>
        new Promise<void>((resolve, reject) => runs.push({ tag: options?.tag, signal: signal!, end: (error) => (error ? reject(error) : resolve()) })),
    )
    const { send } = admin({ dictionary: { install } })
    const first = send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "de" }], tag: "dicts-v1" })
    await nextTask()
    await send({ type: "offlineCancel", service: "dictionary", src: "en", tgt: "de" })
    const second = send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "de" }], tag: "dicts-v2" })
    await nextTask()
    // The second request does not take the result of the cancelled one; it starts once the first has ended.
    expect(runs.map((r) => r.tag)).toEqual(["dicts-v1"])
    expect(send({ type: "offlineProgress" })).toEqual({ dictionary: { "en>de": { state: "queued", done: 0, total: 0 } } })
    runs[0]!.end(new DOMException("Aborted", "AbortError"))
    expect(await first).toEqual([{ ok: false, cancelled: true }])
    await nextTask()
    expect(runs.map((r) => [r.tag, r.signal.aborted])).toEqual([
      ["dicts-v1", true],
      ["dicts-v2", false],
    ])
    expect(send({ type: "offlineProgress" })).toEqual({ dictionary: { "en>de": { state: "running", done: 0, total: 0 } } })
    runs[1]!.end()
    expect(await second).toEqual([{ ok: true }])
  })

  it("describes a failed installation in the interface language", async () => {
    const { send, notices } = admin({ dictionary: { install: () => Promise.reject(new LocalizedError("dictionaryStorageFailed", [], "disk full")) } })
    expect(await send({ type: "offlineInstall", service: "dictionary", pairs: [{ src: "en", tgt: "de" }] })).toEqual([{ ok: false, error: `${ENGLISH.t("dictionaryStorageFailed")} - disk full` }])
    expect(notices()).toEqual({ contentScripts: 1, pages: 1 })
  })

  it("removes a direction and describes a failed removal; content scripts and pages hear of both at once", async () => {
    const remove = vi.fn(async () => {})
    const { send, notices } = admin({ dictionary: { remove } })
    expect(await send({ type: "offlineRemove", service: "dictionary", src: "en", tgt: "de" })).toEqual({ ok: true })
    expect(remove).toHaveBeenCalledWith("en", "de")
    remove.mockRejectedValueOnce(new Error("locked"))
    expect(await send({ type: "offlineRemove", service: "dictionary", src: "en", tgt: "de" })).toEqual({ ok: false, error: "locked" })
    expect(notices()).toEqual({ contentScripts: 2, pages: 2 })
  })
})
