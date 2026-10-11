/**
 * The engine side of the worker protocol, independent of the Worker global
 * scope so that it also runs in Node (verification scripts, tests).
 */

import { BergamotInternalError } from "./internal-error"
import type { WorkerModelFile, WorkerRequest, WorkerResponse } from "./protocol"
import { fileAlignment, modelConfig } from "./records"
import { zstdDecompress } from "./verify"

/* ---------- the parts of the Bergamot (Emscripten/embind) API in use ---------- */

interface Deletable {
  delete(): void
}
export interface AlignedMemory extends Deletable {
  getByteArrayView(): Uint8Array
}
interface Vector<T> extends Deletable {
  size(): number
  get(i: number): T
  push_back(v: T): void
}
export interface TranslationModel extends Deletable {}
interface Response {
  getTranslatedText(): string
}
export interface ResponseOptions {
  qualityScores: boolean
  alignment: boolean
  html: boolean
}
export interface BlockingService extends Deletable {
  translate(model: TranslationModel, texts: Vector<string>, options: Vector<ResponseOptions>): Vector<Response>
  translateViaPivoting(first: TranslationModel, second: TranslationModel, texts: Vector<string>, options: Vector<ResponseOptions>): Vector<Response>
}
export interface BergamotModule {
  AlignedMemory: new (size: number, alignment: number) => AlignedMemory
  AlignedMemoryList: new () => Vector<AlignedMemory>
  TranslationModel: new (
    src: string,
    tgt: string,
    config: string,
    model: AlignedMemory,
    lex: AlignedMemory | null,
    vocabs: Vector<AlignedMemory>,
    qualityModel: AlignedMemory | null,
  ) => TranslationModel
  BlockingService: new (options: { cacheSize: number }) => BlockingService
  VectorString: new () => Vector<string>
  VectorResponseOptions: new () => Vector<ResponseOptions>
  HEAPU8?: Uint8Array
}

/** Options passed to loadBergamot() from bergamot-translator.js. */
export interface BergamotLoadOptions {
  INITIAL_MEMORY: number
  wasmBinary: Uint8Array | ArrayBuffer
  print(...args: unknown[]): void
  printErr(...args: unknown[]): void
  onAbort(what: unknown): void
  onRuntimeInitialized(): void
}
export type LoadBergamot = (options: BergamotLoadOptions) => BergamotModule

/** Start with 40 MiB; the heap grows as models are loaded. */
const INITIAL_MEMORY = 41_943_040

/** Instantiate the engine from the decompressed wasm. */
export function instantiateBergamot(loadBergamot: LoadBergamot, wasmBinary: Uint8Array): Promise<BergamotModule> {
  return new Promise((resolve, reject) => {
    let module: BergamotModule | undefined
    module = loadBergamot({
      INITIAL_MEMORY,
      wasmBinary,
      print() {},
      printErr() {},
      onAbort(what) {
        reject(new Error(`Bergamot wasm aborted: ${String(what)}`))
      },
      onRuntimeInitialized() {
        // loadBergamot() may call this before returning; wait until `module` is assigned.
        void Promise.resolve().then(() => resolve(module!))
      },
    })
  })
}

function buildModel(bergamot: BergamotModule, src: string, tgt: string, files: WorkerModelFile[]): TranslationModel {
  const memory = new Map<string, AlignedMemory>()
  let modelName = ""
  for (const f of files) {
    const raw = zstdDecompress(new Uint8Array(f.bytes))
    const aligned = new bergamot.AlignedMemory(raw.byteLength, fileAlignment(f.fileType))
    aligned.getByteArrayView().set(raw)
    memory.set(f.fileType, aligned)
    if (f.fileType === "model") modelName = f.name
  }
  const model = memory.get("model")
  if (!model) throw new BergamotInternalError(`no model file for ${src} → ${tgt}`)
  const vocabs = new bergamot.AlignedMemoryList()
  const vocab = memory.get("vocab")
  const srcvocab = memory.get("srcvocab")
  const trgvocab = memory.get("trgvocab")
  if (vocab) vocabs.push_back(vocab)
  else if (srcvocab && trgvocab) {
    vocabs.push_back(srcvocab)
    vocabs.push_back(trgvocab)
  } else throw new BergamotInternalError(`no vocabulary for ${src} → ${tgt}`)
  return new bergamot.TranslationModel(src, tgt, modelConfig(modelName), model, memory.get("lex") ?? null, vocabs, null)
}

/**
 * Request handler holding the engine state. `getBergamot` is called on the
 * first "load" and must return the instantiated module.
 */
export function createEngineHandler(getBergamot: () => Promise<BergamotModule>): (req: WorkerRequest) => Promise<WorkerResponse> {
  let bergamot: Promise<BergamotModule> | null = null
  let service: BlockingService | null = null
  const models = new Map<string, TranslationModel>()

  const engine = () => {
    bergamot ??= getBergamot().catch((e) => {
      bergamot = null
      throw e
    })
    return bergamot
  }

  const handle = async (req: WorkerRequest): Promise<WorkerResponse> => {
    switch (req.type) {
      case "load": {
        const b = await engine()
        service ??= new b.BlockingService({ cacheSize: 0 })
        models.get(req.key)?.delete()
        models.delete(req.key)
        models.set(req.key, buildModel(b, req.src, req.tgt, req.files))
        return { id: req.id, ok: true, wasmHeapBytes: b.HEAPU8?.byteLength }
      }
      case "unload": {
        models.get(req.key)?.delete()
        models.delete(req.key)
        return { id: req.id, ok: true }
      }
      case "translate": {
        const b = await engine()
        const loaded = req.keys.map((k) => models.get(k))
        if (loaded.length < 1 || loaded.length > 2 || loaded.some((m) => !m)) throw new BergamotInternalError(`models not loaded: ${req.keys.join(", ")}`)
        service ??= new b.BlockingService({ cacheSize: 0 })
        const texts = new b.VectorString()
        const options = new b.VectorResponseOptions()
        let responses: Vector<Response> | undefined
        try {
          for (const t of req.texts) {
            texts.push_back(t)
            options.push_back({ qualityScores: false, alignment: true, html: false })
          }
          responses =
            loaded.length === 1 ? service.translate(loaded[0]!, texts, options) : service.translateViaPivoting(loaded[0]!, loaded[1]!, texts, options)
          const result: string[] = []
          for (let i = 0; i < responses.size(); i++) result.push(responses.get(i).getTranslatedText())
          return { id: req.id, ok: true, result, wasmHeapBytes: b.HEAPU8?.byteLength }
        } finally {
          texts.delete()
          options.delete()
          responses?.delete()
        }
      }
    }
  }

  return async (req) => {
    try {
      return await handle(req)
    } catch (e) {
      return { id: req.id, ok: false, error: e instanceof Error ? e.message || e.name : String(e) }
    }
  }
}
