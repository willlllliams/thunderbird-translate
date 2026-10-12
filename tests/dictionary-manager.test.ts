/** The dictionary packs as the background page manages them (offline/dictionary/manager.ts): index per release tag, list, install, remove, translation. */
import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CATALOG_RETRY_MS, CATALOG_TTL_MS } from "../src/offline/catalog-cache"
import { DictionaryManager } from "../src/offline/dictionary/manager"
import { installPack } from "../src/offline/dictionary/download"
import { DictionaryStore } from "../src/offline/dictionary/store"
import { describeError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { gz, packEntry, releaseServer, tsv } from "./fixtures/dictionary"
import { asFetch, useFakeTimers } from "./helpers"

const EN_DE = tsv("en", "de", { hello: "hallo", world: "Welt" })
const FR_EN = tsv("fr", "en", { bonjour: "hello" })
const EN_ZH = tsv("en", "zh-Hans", { hello: "你好", world: "世界" })

beforeEach(() => useFakeTimers(new Date("2026-10-01T00:00:00Z")))
afterEach(() => vi.useRealTimers())

/** A manager over an in-memory IndexedDB and a release server per tag; `offline` makes every request fail. */
function managerFor(releases: Record<string, string[]>, tag = "dicts-v1") {
  const servers = Object.fromEntries(Object.entries(releases).map(([t, texts]) => [t, releaseServer(texts)]))
  const state = { offline: false, tag }
  const fetch = vi.fn(async (url: string) => {
    if (state.offline) throw new TypeError("NetworkError when attempting to fetch resource.")
    const [releaseTag] = url.split("/").slice(-2)
    return servers[decodeURIComponent(releaseTag!)]?.(url) ?? new Response("Not Found", { status: 404 })
  })
  const idb = new IDBFactory()
  const store = new DictionaryStore(() => idb)
  const manager = new DictionaryManager({ releaseTag: () => state.tag, store, fetch: asFetch(fetch) })
  const indexReads = () => fetch.mock.calls.filter(([url]) => url.endsWith("dict-index.json")).length
  return { manager, store, fetch, state, indexReads, idb }
}

const ids = (items: { src: string; tgt: string; installed: boolean }[]) => items.map((i) => `${i.src}>${i.tgt}${i.installed ? " (installed)" : ""}`)
const texts = async (m: DictionaryManager, input: string[], source: string, target: string) =>
  (await m.translate(input, source, target)).map((r) => (r.status === "fulfilled" ? r.value : `! ${describeError(r.reason, ENGLISH)}`))

describe("dictionary manager", () => {
  it("lists the packs of the index and the installed ones, each once", async () => {
    const m = managerFor({ "dicts-v1": [EN_DE, FR_EN], other: [EN_ZH] })
    await m.manager.install("en", "zh-Hans", undefined, undefined, { tag: "other" })
    const { items, error } = await m.manager.list()
    expect(error).toBeUndefined()
    expect(ids(items)).toEqual(["en>de", "fr>en", "en>zh-Hans (installed)"])
    expect(items[0]).toEqual({ src: "en", tgt: "de", bytes: packEntry(EN_DE).bytes, entries: 2, license: "MIT", attribution: "Test contributors; MIT", installed: false })
    expect(items[2]).toMatchObject({ version: "20261011", entries: 2 })
    await m.manager.install("en", "de")
    expect(ids((await m.manager.list()).items)).toEqual(["en>de (installed)", "fr>en", "en>zh-Hans (installed)"])
  })

  it("lists the installed packs and says why when the index cannot be read; reads it again after ten minutes or when asked", async () => {
    const m = managerFor({ "dicts-v1": [EN_DE] })
    await installPack(packEntry(EN_DE), "dicts-v1", m.store, { fetchFn: asFetch(releaseServer([EN_DE])) })
    m.state.offline = true
    const failed = await m.manager.list()
    expect(ids(failed.items)).toEqual(["en>de (installed)"])
    expect(describeError(failed.error, ENGLISH)).toMatch(new RegExp(`^${ENGLISH.t("dictIndexFailed", ["github.com:"])}.*NetworkError`, "s"))
    expect(m.indexReads()).toBe(1)
    // Within ten minutes of the failure the index is not asked for again, unless the user does.
    m.state.offline = false
    await vi.advanceTimersByTimeAsync(CATALOG_RETRY_MS - 1)
    expect((await m.manager.list()).error).toBeDefined()
    expect(m.indexReads()).toBe(1)
    expect((await m.manager.list({ refresh: true })).error).toBeUndefined()
    expect(m.indexReads()).toBe(2)
    m.state.offline = true
    await vi.advanceTimersByTimeAsync(CATALOG_TTL_MS)
    // A failed read after six hours keeps the index read before.
    expect(await m.manager.list()).toEqual({ items: [expect.objectContaining({ src: "en", tgt: "de", installed: true })] })
    expect(m.indexReads()).toBe(3)
  })

  it("keeps the index for six hours, and reports a refresh that fails while showing the index it has", async () => {
    const m = managerFor({ "dicts-v1": [EN_DE] })
    await m.manager.list()
    await vi.advanceTimersByTimeAsync(CATALOG_TTL_MS - 1)
    await m.manager.list()
    expect(m.indexReads()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    await m.manager.list()
    expect(m.indexReads()).toBe(2)
    m.state.offline = true
    const refreshed = await m.manager.list({ refresh: true })
    expect(ids(refreshed.items)).toEqual(["en>de"])
    expect(refreshed.error).toBeDefined()
  })

  it("keeps one index per release tag; a list or an installation may name its tag", async () => {
    const m = managerFor({ "dicts-v1": [EN_DE], "dicts-v2": [FR_EN] })
    expect(m.manager.knownCatalog()).toBeNull()
    expect(await m.manager.catalog()).toEqual(new Set(["en>de"]))
    expect(m.manager.knownCatalog()).toEqual(new Set(["en>de"]))
    expect(ids((await m.manager.list({ tag: "dicts-v2" })).items)).toEqual(["fr>en"])
    // The catalog follows the tag of the settings.
    expect(m.manager.knownCatalog()).toEqual(new Set(["en>de"]))
    m.state.tag = "dicts-v2"
    expect(m.manager.knownCatalog()).toEqual(new Set(["fr>en"]))
    await m.manager.install("fr", "en")
    expect(await m.manager.installedKeys()).toEqual(new Set(["fr>en"]))
    await expect(m.manager.install("en", "de")).rejects.toThrow(ENGLISH.t("errDictionaryNoPack", ["en → de"]))
    expect(m.indexReads()).toBe(2)
  })

  it("installs with progress, and translations use the pack at once", async () => {
    const m = managerFor({ "dicts-v1": [EN_DE] })
    expect(await texts(m.manager, ["hello world"], "en", "de")).toEqual([`! ${ENGLISH.t("errDictionaryMissing", ["en → de"])}\n${ENGLISH.t("hintDictionaryDownload")}`])
    const before = await m.manager.signature()
    const progress: [number, number][] = []
    await m.manager.install("en", "de", (done, total) => progress.push([done, total]))
    expect(progress.at(-1)).toEqual([packEntry(EN_DE).bytes, packEntry(EN_DE).bytes])
    expect(await m.manager.signature()).not.toBe(before)
    expect(await texts(m.manager, ["hello world"], "en", "de")).toEqual(["hallo Welt"])
    await m.manager.remove("en", "de")
    expect(await m.manager.installedKeys()).toEqual(new Set())
    expect((await texts(m.manager, ["hello"], "en", "de"))[0]).toMatch(/^! /)
  })

  it("fails an installation while the index cannot be read", async () => {
    const m = managerFor({ "dicts-v1": [EN_DE] })
    m.state.offline = true
    const error = await m.manager.install("en", "de").catch((e) => e)
    expect(describeError(error, ENGLISH)).toContain(ENGLISH.t("dictIndexFailed", [""]).trim())
    expect(await m.manager.installedKeys()).toEqual(new Set())
  })

  it("lists and uses the packs the settings page of version 1.12 stored in tt-dictionary", async () => {
    const m = managerFor({ "dicts-v1": [EN_DE] })
    // The database as 1.12 wrote it: version 1, the description in "packs" (key path id), the compressed file in "data" under the id.
    await new Promise<void>((resolve, reject) => {
      const open = m.idb.open("tt-dictionary", 1)
      open.onupgradeneeded = () => {
        open.result.createObjectStore("packs", { keyPath: "id" })
        open.result.createObjectStore("data")
      }
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(["packs", "data"], "readwrite")
        const data = gz(EN_ZH)
        tx.objectStore("packs").put({ id: "en>zh-Hans", src: "en", tgt: "zh-Hans", version: "20261011", source: "Test source", license: "MIT", attribution: "Test contributors; MIT", bytes: data.byteLength, entries: 2, forms: 0 })
        tx.objectStore("data").put(data.buffer, "en>zh-Hans")
        tx.oncomplete = () => {
          open.result.close()
          resolve()
        }
      }
    })
    expect(ids((await m.manager.list()).items)).toEqual(["en>de", "en>zh-Hans (installed)"])
    expect(await texts(m.manager, ["hello world"], "en", "zh-CN")).toEqual(["你好世界"])
  })
})
