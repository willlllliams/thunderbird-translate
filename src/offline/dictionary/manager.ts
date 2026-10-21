/**
 * The dictionary packs as the background page manages them: the index of
 * each release tag (dict-index.json, kept by a CatalogCache), the installed
 * packs (DictionaryStore), their download and removal, and the translation
 * with them (Dictionary). Counterpart of bergamot/manager.ts.
 */

import type { LanguageDetector } from "../../shared/lang-detect"
import { describeError, LocalizedError } from "../../shared/errors"
import { HttpError } from "../../shared/http"
import { getI18n } from "../../shared/i18n"
import { dictLang, pairKey } from "../../shared/languages"
import type { DictionaryPackInfo } from "../../shared/messages"
import type { Catalog } from "../../shared/offline-needs"
import { CatalogCache } from "../catalog-cache"
import type { ListOptions, OfflineListing, OfflineManager } from "../manager"
import { fetchDictionaryIndex, type IndexedPack, installPack } from "./download"
import { Dictionary } from "./index"
import { DictionaryStore } from "./store"

export interface DictionaryManagerDeps {
  /** The release tag of the settings. */
  releaseTag: () => string
  store?: DictionaryStore
  /** fetch() for the release files; the global fetch when absent. */
  fetch?: typeof fetch
  /** Language detector for source language "auto", from sourceDetector(). */
  detect?: LanguageDetector
  /** Time without translations after which the packs in memory are released. */
  idleMs?: number
  now?: () => number
}

const keyOf = (pack: { src: string; tgt: string }) => pairKey(pack.src, pack.tgt)
/** The pair key of a direction in the language codes of the packs ("zh-CN" → "zh-Hans"); a language no pack has stays as it is. */
const packKey = (src: string, tgt: string) => pairKey(dictLang(src) ?? src, dictLang(tgt) ?? tgt)

/** A failure that a rebuilt release explains: the file has another checksum, or it is gone. */
const releaseChanged = (error: unknown) => (error instanceof LocalizedError && error.i18nText.key === "errDictionaryChecksum") || (error instanceof HttpError && error.status === 404)

export class DictionaryManager implements OfflineManager<DictionaryPackInfo> {
  readonly service = "dictionary"
  private readonly store: DictionaryStore
  private readonly dictionary: Dictionary
  /**
   * The index of the release tag of the settings and of the tag a page asked for last: read again after six hours,
   * after a failed read not before ten minutes. A page that tries tags one after the other keeps only the latest.
   */
  private readonly indexes = new Map<string, CatalogCache<IndexedPack[]>>()

  constructor(private readonly deps: DictionaryManagerDeps) {
    this.store = deps.store ?? new DictionaryStore()
    // Translations take the index read so far: they never wait for the network.
    this.dictionary = new Dictionary(this.store, { detect: deps.detect, idleMs: deps.idleMs, catalog: () => this.knownCatalog() })
  }

  private index(tag = this.deps.releaseTag()): CatalogCache<IndexedPack[]> {
    let index = this.indexes.get(tag)
    if (!index) {
      index = new CatalogCache({ load: () => fetchDictionaryIndex(tag, this.deps.fetch), now: this.deps.now })
      const current = this.deps.releaseTag()
      for (const other of this.indexes.keys()) if (other !== current) this.indexes.delete(other)
      this.indexes.set(tag, index)
    }
    return index
  }

  /** The packs of the index and the installed ones; a pack in both is described as stored. An index that cannot be read leaves the installed packs and its error. */
  async list({ refresh = false, tag }: ListOptions = {}): Promise<OfflineListing<DictionaryPackInfo>> {
    const index = this.index(tag)
    const [available, installed] = await Promise.all([index.get(refresh), this.store.list()])
    const rows = new Map<string, DictionaryPackInfo>()
    for (const { src, tgt, bytes, entries, license, attribution } of available ?? []) rows.set(pairKey(src, tgt), { src, tgt, bytes, entries, license, attribution, installed: false })
    for (const { id, src, tgt, bytes, entries, license, attribution, version } of installed) rows.set(id, { src, tgt, bytes, entries, license, attribution, installed: true, version })
    const failed = available === null || (refresh && index.error !== undefined)
    return { items: [...rows.values()], ...(failed ? { error: new LocalizedError("dictIndexFailed", [describeError(index.error, getI18n())]) } : {}) }
  }

  async catalog(): Promise<Catalog> {
    const index = await this.index().get()
    return index && new Set(index.map(keyOf))
  }

  knownCatalog(): Catalog {
    const index = this.index().peek()
    return index && new Set(index.map(keyOf))
  }

  installedKeys(): Promise<Set<string>> {
    return this.dictionary.installedIds()
  }

  /**
   * Download the pack of the index of `tag` (the settings' by default), check
   * and store it; translations use it at once. The index is kept for hours,
   * and the release may be rebuilt meanwhile: when the file fails its
   * checksum or is not found, the index is read again once, and a changed
   * entry (another checksum or file) is downloaded instead. Only a stored
   * pack is read again by the translations: a failed or cancelled
   * installation keeps every pack they have in memory.
   */
  async install(src: string, tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal, { tag = this.deps.releaseTag() }: Pick<ListOptions, "tag"> = {}): Promise<void> {
    const index = this.index(tag)
    const packs = await index.get()
    if (!packs) throw new LocalizedError("dictIndexFailed", [describeError(index.error, getI18n())])
    const key = packKey(src, tgt)
    const find = (list: IndexedPack[] | null) => list?.find((p) => keyOf(p) === key)
    const pack = find(packs)
    if (!pack) throw new LocalizedError("errDictionaryNoPack", [key.replace(">", " → ")])
    const download = (entry: IndexedPack) => installPack(entry, tag, this.store, { fetchFn: this.deps.fetch, onProgress, signal })
    try {
      await download(pack)
    } catch (error) {
      if (signal?.aborted || !releaseChanged(error)) throw error
      const fresh = find(await index.get(true))
      if (!fresh || (fresh.sha256 === pack.sha256 && fresh.file === pack.file)) throw error
      await download(fresh)
    }
    this.dictionary.invalidate(key)
  }

  async remove(src: string, tgt: string): Promise<void> {
    const key = packKey(src, tgt)
    try {
      await this.store.remove(key)
    } finally {
      this.dictionary.invalidate(key)
    }
  }

  signature(): Promise<string> {
    return this.dictionary.signature()
  }

  /** Translate with the installed packs, see Dictionary.translate(). */
  translate(texts: string[], sourceLang: string, targetLang: string): Promise<PromiseSettledResult<string>[]> {
    return this.dictionary.translate(texts, sourceLang, targetLang)
  }
}
