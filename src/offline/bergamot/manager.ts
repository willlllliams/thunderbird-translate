/**
 * Model list, installation, removal and translation, with every external
 * dependency (fetch, IndexedDB, Worker) injected.
 */

import { downloadBody, IDLE_TIMEOUT_MS, LIST_TIMEOUT_MS } from "../../shared/download"
import { LocalizedError, MissingDataError, TimeoutError } from "../../shared/errors"
import { hashText } from "../../shared/hash"
import { timeoutSignal } from "../../shared/http"
import { isChinesePair, normalizeBergamotLang, pairKey } from "../../shared/languages"
import type { BergamotPairInfo } from "../../shared/messages"
import { type Catalog, pairNeeds } from "../../shared/offline-needs"
import { retryable } from "../../shared/retryable"
import { CatalogCache } from "../catalog-cache"
import type { ListOptions, OfflineListing, OfflineManager } from "../manager"
import { BergamotEngine, type EngineOptions, type WorkerLike } from "./engine"
import { type ModelFileType, type ModelRecord, type PairFiles, selectPairs } from "./records"
import type { BergamotStore, StoredFile, StoredPair } from "./store"
import { prepareTexts } from "./text"
import { verifyModelFile } from "./verify"

export const DEFAULT_SERVER_URL = "https://firefox.settings.services.mozilla.com/v1/"
export const DEFAULT_ATTACHMENTS_BASE = "https://firefox-settings-attachments.cdn.mozilla.net/"
const MODELS_PATH = "buckets/main/collections/translations-models-v2/records"
const RECORDS_META_KEY = "records"

export interface ManagerDeps {
  store: BergamotStore
  fetch: typeof fetch
  createWorker: () => WorkerLike
  serverUrl?: string
  /** Fixed attachments base; when absent it is read from the server root. */
  attachmentsBase?: string
  now?: () => number
  /** The model list fails after this long without an answer. */
  listTimeoutMs?: number
  /** A model file download fails when nothing arrives for this long. */
  idleTimeoutMs?: number
  engine?: Partial<Pick<EngineOptions, "maxModels" | "idleMs" | "timeoutMs" | "loadTimeoutMs" | "pauseMs" | "now" | "setTimer" | "clearTimer">>
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

/** The model list as it is saved; a copy saved before 3.0.0 also has the time it was read, which nothing reads. */
interface CachedRecords {
  attachmentsBase: string
  records: ModelRecord[]
}

/** Only the record fields we keep in the cache. */
function slim(r: ModelRecord): ModelRecord {
  return {
    name: r.name,
    sourceLanguage: r.sourceLanguage,
    targetLanguage: r.targetLanguage,
    fileType: r.fileType,
    version: r.version,
    architecture: r.architecture,
    filter_expression: r.filter_expression,
    attachment: { location: r.attachment?.location, hash: r.attachment?.hash, size: r.attachment?.size },
    decompressedHash: r.decompressedHash,
    decompressedSize: r.decompressedSize,
  }
}

export class BergamotManager implements OfflineManager<BergamotPairInfo> {
  readonly service = "bergamot"
  readonly engine: BergamotEngine
  /** The model list: read again after six hours, after a failed read not before ten minutes, the copy of an earlier session when Mozilla cannot be reached. */
  private readonly records: CatalogCache<CachedRecords>
  /** Hash of the installed pairs and their versions. */
  private readonly installed = retryable(async () => hashText((await this.listInstalled()).map((p) => `${p.key}@${p.version}`).sort().join(",")))
  private readonly serverUrl: string
  private readonly now: () => number

  constructor(private readonly deps: ManagerDeps) {
    this.serverUrl = (deps.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/?$/, "/")
    this.now = deps.now ?? Date.now
    this.records = new CatalogCache({
      load: () => this.downloadRecords(),
      fallback: () => this.deps.store.getMeta<CachedRecords>(RECORDS_META_KEY),
      now: this.now,
    })
    this.engine = new BergamotEngine({
      ...deps.engine,
      createWorker: deps.createWorker,
      loadPair: (key) => this.loadPair(key),
    })
  }

  /* ---------- model list ---------- */

  private async fetchJson(url: string): Promise<unknown> {
    const timeoutMs = this.deps.listTimeoutMs ?? LIST_TIMEOUT_MS
    const { signal, clear } = timeoutSignal(timeoutMs)
    try {
      const res = await this.deps.fetch(url, { cache: "no-cache", signal })
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      throw signal.aborted ? new TimeoutError("Mozilla Remote Settings", timeoutMs) : e
    } finally {
      clear()
    }
  }

  private async attachmentsBase(): Promise<string> {
    if (this.deps.attachmentsBase) return this.deps.attachmentsBase.replace(/\/?$/, "/")
    try {
      const root = (await this.fetchJson(this.serverUrl)) as { capabilities?: { attachments?: { base_url?: unknown } } }
      const base = root?.capabilities?.attachments?.base_url
      if (typeof base === "string" && base) return base.replace(/\/?$/, "/")
    } catch {
      // The CDN address has been stable for years; use it when the root is unavailable.
    }
    return DEFAULT_ATTACHMENTS_BASE
  }

  private async downloadRecords(): Promise<CachedRecords> {
    const [body, attachmentsBase] = await Promise.all([this.fetchJson(this.serverUrl + MODELS_PATH), this.attachmentsBase()])
    const data = (body as { data?: unknown })?.data
    if (!Array.isArray(data)) throw new Error("the model list has no data array")
    const cached: CachedRecords = { attachmentsBase, records: (data as ModelRecord[]).map(slim) }
    try {
      await this.deps.store.setMeta(RECORDS_META_KEY, cached)
    } catch {
      // The list still works for this session.
    }
    return cached
  }

  /**
   * Remote Settings records, from memory, from Mozilla, or from the copy
   * saved by an earlier session when Mozilla cannot be reached. A refresh
   * the user asked for fails when Mozilla cannot be reached.
   */
  async getRecords(forceRefresh = false): Promise<CachedRecords> {
    const records = await this.records.get(forceRefresh)
    const { error } = this.records
    if (records && !(forceRefresh && error !== undefined)) return records
    throw new LocalizedError("bergamotRecordsFailed", [], errorText(error))
  }

  async availablePairs(forceRefresh = false): Promise<Map<string, PairFiles>> {
    return selectPairs((await this.getRecords(forceRefresh)).records)
  }

  /** Pairs offered by Mozilla plus installed pairs, sorted by source then target. */
  async listPairs(forceRefresh = false): Promise<BergamotPairInfo[]> {
    const [available, installed] = await Promise.all([this.availablePairs(forceRefresh), this.listInstalled()])
    const installedByKey = new Map(installed.map((p) => [p.key, p]))
    const out: BergamotPairInfo[] = []
    for (const [key, p] of available) {
      const inst = installedByKey.get(key)
      out.push({
        src: p.src,
        tgt: p.tgt,
        version: p.version,
        architecture: p.architecture,
        bytes: p.bytes,
        rawBytes: p.rawBytes,
        installed: !!inst,
        ...(inst && inst.version !== p.version ? { installedVersion: inst.version } : {}),
      })
    }
    for (const p of installed) {
      if (available.has(p.key)) continue
      out.push({ src: p.src, tgt: p.tgt, version: p.version, architecture: p.architecture, bytes: p.bytes, rawBytes: p.rawBytes, installed: true })
    }
    return out.sort((a, b) => a.src.localeCompare(b.src) || a.tgt.localeCompare(b.tgt))
  }

  /** The pairs of listPairs(); fails when the model list cannot be read. */
  async list({ refresh = false }: ListOptions = {}): Promise<OfflineListing<BergamotPairInfo>> {
    return { items: await this.listPairs(refresh) }
  }

  private async listInstalled(): Promise<StoredPair[]> {
    try {
      return await this.deps.store.listPairs()
    } catch (e) {
      throw new LocalizedError("bergamotStorageFailed", [], errorText(e))
    }
  }

  /* ---------- install / remove ---------- */

  /** Download and store a pair. A second request for a running installation is merged by the caller (offline/install-registry.ts), which shares progress and cancellation. */
  install(src: string, tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    return this.doInstall(normalizeBergamotLang(src), normalizeBergamotLang(tgt), onProgress, signal)
  }

  /** One file; `onProgress` gets the bytes received so far. Fails when nothing arrives for a while, however long the whole download takes. */
  private async download(url: string, name: string, onProgress: (received: number) => void, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    const request = async (idle: AbortSignal) => {
      const res = await this.deps.fetch(url, { signal: idle })
      if (!res.ok) throw new LocalizedError("bergamotDownloadFailed", [name], `HTTP ${res.status}`)
      return res
    }
    try {
      return await downloadBody(request, onProgress, { name, idleMs: this.deps.idleTimeoutMs ?? IDLE_TIMEOUT_MS, signal })
    } catch (e) {
      // A stalled download is a LocalizedError as well.
      if (signal?.aborted || e instanceof LocalizedError) throw e
      throw new LocalizedError("bergamotDownloadFailed", [name], errorText(e))
    }
  }

  private async doInstall(src: string, tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    const key = pairKey(src, tgt)
    const { attachmentsBase, records } = await this.getRecords()
    const pair = selectPairs(records).get(key)
    if (!pair) throw new LocalizedError("bergamotUnsupportedPair", [src, tgt])
    const existing = await this.deps.store.getPair(key).catch(() => undefined)
    if (existing && existing.version === pair.version) {
      onProgress?.(pair.bytes, pair.bytes)
      return
    }

    let done = 0
    onProgress?.(0, pair.bytes)
    const files: StoredFile[] = []
    for (const record of pair.files) {
      signal?.throwIfAborted()
      const before = done
      const bytes = await this.download(
        attachmentsBase + record.attachment.location,
        record.name,
        (received) => {
          done = before + received
          onProgress?.(Math.min(done, pair.bytes), pair.bytes)
        },
        signal,
      )
      const check = await verifyModelFile(bytes, {
        name: record.name,
        hash: record.attachment.hash,
        decompressedHash: record.decompressedHash,
        decompressedSize: record.decompressedSize,
      })
      if (!check.ok) throw new LocalizedError("bergamotChecksumMismatch", [record.name], check.detail)
      files.push({ hash: record.attachment.hash.toLowerCase(), bytes: bytes.buffer })
    }
    signal?.throwIfAborted()

    const stored: StoredPair = {
      key,
      src,
      tgt,
      version: pair.version,
      architecture: pair.architecture,
      files: pair.files.map((r) => ({
        fileType: r.fileType as ModelFileType,
        name: r.name,
        hash: r.attachment.hash.toLowerCase(),
        decompressedHash: r.decompressedHash,
        size: r.attachment.size,
        decompressedSize: r.decompressedSize,
      })),
      bytes: pair.bytes,
      rawBytes: pair.rawBytes,
      installedAt: this.now(),
    }
    try {
      await this.deps.store.putPair(stored, files)
    } catch (e) {
      throw new LocalizedError("bergamotStorageFailed", [], errorText(e))
    } finally {
      this.installed.reset()
    }
    if (existing) await this.engine.forget(key).catch(() => {})
    onProgress?.(pair.bytes, pair.bytes)
  }

  async remove(src: string, tgt: string): Promise<void> {
    const key = pairKey(normalizeBergamotLang(src), normalizeBergamotLang(tgt))
    await this.engine.forget(key).catch(() => {})
    try {
      await this.deps.store.deletePair(key)
    } catch (e) {
      throw new LocalizedError("bergamotStorageFailed", [], errorText(e))
    } finally {
      this.installed.reset()
    }
  }

  /** Hash of the installed pairs and their versions: part of the cache key of every offline translation. */
  signature(): Promise<string> {
    return this.installed.get()
  }

  private async loadPair(key: string) {
    let pair: StoredPair | undefined
    let files: Awaited<ReturnType<BergamotStore["readFiles"]>>
    try {
      pair = await this.deps.store.getPair(key)
      if (!pair) throw new Error(`${key} is not installed`)
      files = await this.deps.store.readFiles(pair)
    } catch (e) {
      throw new LocalizedError("bergamotStorageFailed", [], errorText(e))
    }
    return { src: pair.src, tgt: pair.tgt, files: files.map((f) => ({ fileType: f.fileType, name: f.name, bytes: f.bytes })) }
  }

  /* ---------- translation ---------- */

  /** Keys of the installed pairs ("en>zh-Hans"). */
  async installedKeys(): Promise<Set<string>> {
    return new Set((await this.listInstalled()).map((p) => p.key))
  }

  /** Keys of the pairs Mozilla offers, read again when the list is older than six hours; null when the list cannot be read. */
  catalog(): Promise<Catalog> {
    return this.availablePairs().then(
      (pairs) => new Set(pairs.keys()),
      () => null,
    )
  }

  /** Keys of the pairs Mozilla offers in the list already read; null before it is read. Translations use it and never wait for the network. */
  knownCatalog(): Catalog {
    const records = this.records.peek()
    return records && new Set(selectPairs(records.records).keys())
  }

  /** Translate texts of one language; detecting it is up to the caller (background/translators/bergamot.ts). */
  async translate(texts: string[], src: string, tgt: string): Promise<string[]> {
    const target = normalizeBergamotLang(tgt)
    if (!target || target === "auto") throw new LocalizedError("bergamotUnsupportedPair", [src, tgt])
    const source = normalizeBergamotLang(src)
    if (!source || source === "auto") throw new LocalizedError("bergamotDetectFailed")
    if (source === target || texts.length === 0) return texts.slice()
    if (isChinesePair(source, target)) throw new LocalizedError("errChineseVariants")

    const installed = await this.installedKeys()
    const { required, missing, unsupported } = pairNeeds("bergamot", source, target, this.knownCatalog(), installed)
    if (unsupported) throw new LocalizedError("bergamotUnsupportedPair", [source, target])
    const absent = required.filter((id) => !installed.has(id))
    if (absent.length) {
      const args = [source, target, absent.map((id) => id.replace(">", " → ")).join(", ")]
      // Without the model list, nothing is known to be downloadable: the error names no models.
      throw missing.length ? new MissingDataError("bergamotModelMissing", args, { service: "bergamot", pair: pairKey(source, target), models: missing }) : new LocalizedError("bergamotModelMissing", args)
    }

    const prepared = prepareTexts(texts, source)
    if (prepared.inputs.length === 0) return texts.slice()
    try {
      const out = await this.engine.translate(required, prepared.inputs)
      return prepared.rebuild(out)
    } catch (e) {
      if (e instanceof LocalizedError) throw e
      throw new LocalizedError("bergamotEngineFailed", [], errorText(e))
    }
  }
}
