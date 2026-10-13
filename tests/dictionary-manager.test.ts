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

  it("reads again only the pack an installation stored; a failed or cancelled installation keeps the packs in memory", async () => {
    const m = managerFor({ "dicts-v1": [EN_DE, FR_EN] })
    await m.manager.install("en", "de")
    const data = vi.spyOn(m.store, "data")
    const reads = () => data.mock.calls.map(([id]) => id)
    expect(await texts(m.manager, ["hello"], "en", "de")).toEqual(["hallo"])
    expect(reads()).toEqual(["en>de"])
    m.state.offline = true
    await expect(m.manager.install("fr", "en")).rejects.toThrow("NetworkError")
    m.state.offline = false
    const cancel = new AbortController()
    cancel.abort(new DOMException("cancelled", "AbortError"))
    await expect(m.manager.install("fr", "en", undefined, cancel.signal)).rejects.toThrow("cancelled")
    expect(await texts(m.manager, ["hello"], "en", "de")).toEqual(["hallo"])
    expect(reads()).toEqual(["en>de"])
    // Installing fr>en drops fr>en only; en>de stays in memory, and the signature is worked out again.
    const before = await m.manager.signature()
    await m.manager.install("fr", "en")
    expect(await m.manager.signature()).not.toBe(before)
    expect(await texts(m.manager, ["hello"], "en", "de")).toEqual(["hallo"])
    expect(reads()).toEqual(["en>de"])
    // Installing en>de again reads it again.
    await m.manager.install("en", "de")
    expect(await texts(m.manager, ["hello"], "en", "de")).toEqual(["hallo"])
    expect(reads()).toEqual(["en>de", "en>de"])
  })

  describe("a release rebuilt while its index is kept", () => {
    /** A release whose index and files can be replaced: `packs` lists the entries, `files` serves the file names. */
    function rebuiltRelease(packs: ReturnType<typeof packEntry>[], files: Record<string, string>) {
      const release = { packs, files, offline: false }
      const fetch = vi.fn(async (url: string) => {
        const file = decodeURIComponent(url.split("/").at(-1)!)
        if (release.offline && file !== "dict-index.json") throw new TypeError("NetworkError when attempting to fetch resource.")
        if (file === "dict-index.json") return new Response(JSON.stringify({ version: 1, packs: release.packs }))
        const text = release.files[file]
        return text === undefined ? new Response("Not Found", { status: 404 }) : new Response(gz(text))
      })
      const store = new DictionaryStore(() => new IDBFactory())
      const manager = new DictionaryManager({ releaseTag: () => "dicts-v1", store, fetch: asFetch(fetch) })
      const reads = (name: string) => fetch.mock.calls.filter(([url]) => url.endsWith(`/${name}`)).length
      return { release, manager, store, reads }
    }
    const EN_DE_2 = tsv("en", "de", { hello: "servus", world: "Welt" })

    it("installs a pack whose file changed: a checksum error reads the index again once and downloads the new entry", async () => {
      const r = rebuiltRelease([packEntry(EN_DE)], { "dict-en-de.tsv.gz": EN_DE })
      await r.manager.list()
      // The release is rebuilt: same file name, new content and checksum.
      r.release.packs = [packEntry(EN_DE_2)]
      r.release.files = { "dict-en-de.tsv.gz": EN_DE_2 }
      await r.manager.install("en", "de")
      expect([r.reads("dict-index.json"), r.reads("dict-en-de.tsv.gz")]).toEqual([2, 2])
      expect(await texts(r.manager, ["hello"], "en", "de")).toEqual(["servus"])
    })

    it("installs a pack whose file was renamed: a 404 reads the index again once and downloads the new file", async () => {
      const r = rebuiltRelease([packEntry(EN_DE)], { "dict-en-de.tsv.gz": EN_DE })
      await r.manager.list()
      r.release.packs = [packEntry(EN_DE_2, { file: "dict-en-de-2.tsv.gz" })]
      r.release.files = { "dict-en-de-2.tsv.gz": EN_DE_2 }
      await r.manager.install("en", "de")
      expect([r.reads("dict-index.json"), r.reads("dict-en-de.tsv.gz"), r.reads("dict-en-de-2.tsv.gz")]).toEqual([2, 1, 1])
      expect(await texts(r.manager, ["hello"], "en", "de")).toEqual(["servus"])
    })

    it("fails when the index read again names the same file and checksum or the new entry fails too, and reads it again only after a checksum error or a 404", async () => {
      const r = rebuiltRelease([packEntry(EN_DE)], { "dict-en-de.tsv.gz": EN_DE_2 })
      await expect(r.manager.install("en", "de")).rejects.toThrow(ENGLISH.t("errDictionaryChecksum", ["dict-en-de.tsv.gz"]))
      expect([r.reads("dict-index.json"), r.reads("dict-en-de.tsv.gz")]).toEqual([2, 1])
      // The new entry fails as well: no third read of the index.
      r.release.packs = [packEntry(EN_DE_2)]
      r.release.files = {}
      await expect(r.manager.install("en", "de")).rejects.toThrow("HTTP 404")
      expect(r.reads("dict-index.json")).toBe(3)
      // A network failure is no sign of a rebuilt release.
      r.release.offline = true
      await expect(r.manager.install("en", "de")).rejects.toThrow("NetworkError")
      expect(r.reads("dict-index.json")).toBe(3)
      expect(await r.manager.installedKeys()).toEqual(new Set())
    })
  })

  it("installs and removes a pack named in another spelling of its languages, as the Bergamot models are", async () => {
    const m = managerFor({ "dicts-v1": [EN_ZH, FR_EN] })
    await m.manager.install("en", "zh-CN")
    await m.manager.install("FR", "en-US")
    expect(await m.manager.installedKeys()).toEqual(new Set(["en>zh-Hans", "fr>en"]))
    await m.manager.remove("en-GB", "zh")
    expect(await m.manager.installedKeys()).toEqual(new Set(["fr>en"]))
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
