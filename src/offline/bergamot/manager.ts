/**
 * Model list, installation, removal and translation, with every external
 * dependency (fetch, IndexedDB, Worker, language detector) injected.
 */

import { type LanguageDetector, detectSourceLanguage } from "./detect"
import { BergamotEngine, type EngineOptions, EngineError, type WorkerLike } from "./engine"
import { BergamotError, errorText } from "./errors"
import { BergamotInternalError } from "./internal-error"
import { normalizeBergamotLang, pairKey, requiredPairs } from "./languages"
import { type ModelFileType, type ModelRecord, type PairFiles, selectPairs } from "./records"
import type { BergamotStore, StoredFile, StoredPair } from "./store"
import { prepareTexts } from "./text"
import { verifyModelFile } from "./verify"

export const DEFAULT_SERVER_URL = "https://firefox.settings.services.mozilla.com/v1/"
export const DEFAULT_ATTACHMENTS_BASE = "https://firefox-settings-attachments.cdn.mozilla.net/"
const MODELS_PATH = "buckets/main/collections/translations-models-v2/records"
/** The model list is fetched again after this long. */
const RECORDS_TTL_MS = 6 * 60 * 60 * 1000
const RECORDS_META_KEY = "records"

export interface BergamotPairInfo {
  src: string
  tgt: string
  /** Version offered by Mozilla, or the installed version for pairs no longer offered. */
  version: string
  architecture: string
  /** Download size (compressed). */
  bytes: number
  /** Size after decompression. */
  rawBytes: number
  installed: boolean
  /** Installed version when it differs from `version` (an update is available). */
  installedVersion?: string
}

export interface TranslateOptions {
  /** Source language used when `src` is "auto" and detection is not confident. */
  fallbackSource?: string
}

export interface ManagerDeps {
  store: BergamotStore
  fetch: typeof fetch
  createWorker: () => WorkerLike
  detector?: LanguageDetector
  serverUrl?: string
  /** Fixed attachments base; when absent it is read from the server root. */
  attachmentsBase?: string
  now?: () => number
  engine?: Partial<Pick<EngineOptions, "maxModels" | "idleMs" | "setTimer" | "clearTimer">>
}

interface CachedRecords {
  fetchedAt: number
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

export class BergamotManager {
  readonly engine: BergamotEngine
  private records: CachedRecords | null = null
  private recordsLoading: Promise<CachedRecords> | null = null
  private readonly installs = new Map<string, Promise<void>>()
  private readonly serverUrl: string
  private readonly now: () => number

  constructor(private readonly deps: ManagerDeps) {
    this.serverUrl = (deps.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/?$/, "/")
    this.now = deps.now ?? Date.now
    this.engine = new BergamotEngine({
      ...deps.engine,
      createWorker: deps.createWorker,
      loadPair: (key) => this.loadPair(key),
    })
  }

  /* ---------- model list ---------- */

  private async fetchJson(url: string): Promise<unknown> {
    const res = await this.deps.fetch(url, { cache: "no-cache" })
    if (!res.ok) throw new BergamotInternalError(`${url}: HTTP ${res.status}`)
    return res.json()
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
    if (!Array.isArray(data)) throw new BergamotInternalError("the model list has no data array")
    const cached: CachedRecords = { fetchedAt: this.now(), attachmentsBase, records: (data as ModelRecord[]).map(slim) }
    try {
      await this.deps.store.setMeta(RECORDS_META_KEY, cached)
    } catch {
      // The list still works for this session.
    }
    return cached
  }

  /**
   * Remote Settings records, from memory, from Mozilla, or from the copy
   * saved by an earlier session when Mozilla cannot be reached.
   */
  async getRecords(forceRefresh = false): Promise<CachedRecords> {
    if (!forceRefresh && this.records && this.now() - this.records.fetchedAt < RECORDS_TTL_MS) return this.records
    this.recordsLoading ??= (async () => {
      try {
        this.records = await this.downloadRecords()
        return this.records
      } catch (e) {
        const saved = this.records ?? (await this.deps.store.getMeta<CachedRecords>(RECORDS_META_KEY).catch(() => undefined))
        if (saved && !forceRefresh) {
          this.records = saved
          return saved
        }
        throw new BergamotError("bergamotRecordsFailed", [], errorText(e))
      } finally {
        this.recordsLoading = null
      }
    })()
    return this.recordsLoading
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

  private async listInstalled(): Promise<StoredPair[]> {
    try {
      return await this.deps.store.listPairs()
    } catch (e) {
      throw new BergamotError("bergamotStorageFailed", [], errorText(e))
    }
  }

  /* ---------- install / remove ---------- */

  install(src: string, tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    const s = normalizeBergamotLang(src)
    const t = normalizeBergamotLang(tgt)
    const key = pairKey(s, t)
    const running = this.installs.get(key)
    if (running) return running
    const task = this.doInstall(s, t, onProgress, signal).finally(() => this.installs.delete(key))
    this.installs.set(key, task)
    return task
  }

  private async download(url: string, name: string, onChunk: (n: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
    let res: Response
    try {
      res = await this.deps.fetch(url, { signal })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new BergamotError("bergamotDownloadFailed", [name], errorText(e))
    }
    if (!res.ok) throw new BergamotError("bergamotDownloadFailed", [name], `HTTP ${res.status}`)
    if (!res.body) {
      const bytes = new Uint8Array(await res.arrayBuffer())
      onChunk(bytes.byteLength)
      return bytes
    }
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      onChunk(value.byteLength)
    }
    const bytes = new Uint8Array(received)
    let offset = 0
    for (const c of chunks) {
      bytes.set(c, offset)
      offset += c.byteLength
    }
    return bytes
  }

  private async doInstall(src: string, tgt: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    const key = pairKey(src, tgt)
    const { attachmentsBase } = await this.getRecords()
    const pair = (await this.availablePairs()).get(key)
    if (!pair) throw new BergamotError("bergamotUnsupportedPair", [src, tgt])
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
      const bytes = await this.download(
        attachmentsBase + record.attachment.location,
        record.name,
        (n) => {
          done += n
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
      if (!check.ok) throw new BergamotError("bergamotChecksumMismatch", [record.name], check.detail)
      files.push({ hash: record.attachment.hash.toLowerCase(), bytes: bytes.buffer as ArrayBuffer })
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
      throw new BergamotError("bergamotStorageFailed", [], errorText(e))
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
      throw new BergamotError("bergamotStorageFailed", [], errorText(e))
    }
  }

  private async loadPair(key: string) {
    let pair: StoredPair | undefined
    let files: Awaited<ReturnType<BergamotStore["readFiles"]>>
    try {
      pair = await this.deps.store.getPair(key)
      if (!pair) throw new BergamotInternalError(`${key} is not installed`)
      files = await this.deps.store.readFiles(pair)
    } catch (e) {
      throw new BergamotError("bergamotStorageFailed", [], errorText(e))
    }
    return { src: pair.src, tgt: pair.tgt, files: files.map((f) => ({ fileType: f.fileType, name: f.name, bytes: f.bytes })) }
  }

  /* ---------- translation ---------- */

  /** Language pairs among `pairs` that are not installed. */
  async missingPairs(pairs: Array<[string, string]>): Promise<Array<[string, string]>> {
    const installed = new Set((await this.listInstalled()).map((p) => p.key))
    return pairs.filter(([s, t]) => !installed.has(pairKey(s, t)))
  }

  async translate(texts: string[], src: string, tgt: string, options: TranslateOptions = {}): Promise<string[]> {
    const target = normalizeBergamotLang(tgt)
    if (!target || target === "auto") throw new BergamotError("bergamotUnsupportedPair", [src, tgt])
    let source = normalizeBergamotLang(src)
    if (!source || source === "auto") {
      const detected = await detectSourceLanguage(texts, this.deps.detector, options.fallbackSource)
      if (!detected) throw new BergamotError("bergamotDetectFailed")
      source = detected
    }
    if (source === target || texts.length === 0) return texts.slice()

    const pairs = requiredPairs(source, target)
    const missing = await this.missingPairs(pairs)
    if (missing.length) throw new BergamotError("bergamotModelMissing", [source, target, missing.map(([s, t]) => `${s} → ${t}`).join(", ")])

    const prepared = prepareTexts(texts, source)
    if (prepared.inputs.length === 0) return texts.slice()
    try {
      const out = await this.engine.translate(
        pairs.map(([s, t]) => pairKey(s, t)),
        prepared.inputs,
      )
      return prepared.rebuild(out)
    } catch (e) {
      if (e instanceof BergamotError) throw e
      throw new BergamotError("bergamotEngineFailed", [], e instanceof EngineError ? e.message : errorText(e))
    }
  }
}
