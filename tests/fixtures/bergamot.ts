/** Test doubles for the offline engine: model files, a Remote Settings server, a worker. */
import { zstdCompressSync } from "node:zlib"
import { IDBFactory } from "fake-indexeddb"
import { vi } from "vitest"
import type { LanguageDetector } from "../../src/offline/bergamot/detect"
import type { WorkerLike } from "../../src/offline/bergamot/engine"
import { BergamotManager, type ManagerDeps } from "../../src/offline/bergamot/manager"
import type { WorkerRequest, WorkerResponse } from "../../src/offline/bergamot/protocol"
import type { ModelRecord } from "../../src/offline/bergamot/records"
import { BergamotStore } from "../../src/offline/bergamot/store"
import { sha256Hex } from "../helpers"


/** Fake worker: "translates" by tagging each text with the pair keys. */
export class FakeWorker implements WorkerLike {
  onmessage: WorkerLike["onmessage"] = null
  onerror: WorkerLike["onerror"] = null
  terminated = false
  readonly log: string[] = []
  readonly transfers: number[] = []
  failNext: string | null = null

  postMessage(message: WorkerRequest, transfer: Transferable[] = []): void {
    this.transfers.push(transfer.length)
    this.log.push(message.type === "translate" ? `translate:${message.keys.join("+")}` : `${message.type}:${message.key}`)
    let response: WorkerResponse
    if (this.failNext) {
      response = { id: message.id, ok: false, error: this.failNext }
      this.failNext = null
    } else if (message.type === "translate") {
      response = { id: message.id, ok: true, result: message.texts.map((t) => `[${message.keys.join("+")}]${t}`), wasmHeapBytes: 1234 }
    } else {
      response = { id: message.id, ok: true }
    }
    queueMicrotask(() => this.onmessage?.({ data: response }))
  }

  terminate(): void {
    this.terminated = true
  }
}

export interface FakeFile {
  record: ModelRecord
  /** null: the CDN answers 404. */
  body: Uint8Array | null
}

/** A real zstd file with matching hashes in its record. */
export function modelFile(src: string, tgt: string, fileType: string, version = "3.0"): FakeFile {
  const raw = new TextEncoder().encode(`${src}${tgt}-${fileType}-${version} `.repeat(50))
  const body = new Uint8Array(zstdCompressSync(raw))
  const name = `${fileType}.${src}${tgt}.bin`
  return {
    body,
    record: {
      name,
      sourceLanguage: src,
      targetLanguage: tgt,
      fileType,
      version,
      architecture: "base-memory",
      filter_expression: "",
      attachment: { location: `ws/${src}${tgt}/${name}.zst`, hash: sha256Hex(body), size: body.byteLength },
      decompressedHash: sha256Hex(raw),
      decompressedSize: raw.byteLength,
    },
  }
}

/** model, lex and vocab of one direction. */
export const triple = (src: string, tgt: string, version = "3.0") => ["model", "lex", "vocab"].map((t) => modelFile(src, tgt, t, version))

export const SERVER = "https://rs.example/v1/"
export const CDN = "https://cdn.example/"
export const RECORDS_URL = `${SERVER}buckets/main/collections/translations-models-v2/records`

/** Remote Settings server and attachment CDN serving `files`; `files` may be changed between calls. */
export function fakeServer(files: FakeFile[]) {
  const calls: string[] = []
  let offline = false
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    if (offline) throw new TypeError("NetworkError when attempting to fetch resource.")
    if (url === SERVER) return Response.json({ capabilities: { attachments: { base_url: CDN } } })
    if (url === RECORDS_URL) return Response.json({ data: files.map((f) => f.record) })
    const f = files.find((x) => `${CDN}${x.record.attachment.location}` === url)
    if (!f?.body) return new Response("not found", { status: 404 })
    return new Response(f.body.slice())
  })
  return {
    fetch: fetchMock as unknown as typeof fetch,
    mock: fetchMock,
    calls,
    setOffline: (v: boolean) => {
      offline = v
    },
    SERVER,
  }
}

/** A manager over `files` with an in-memory store and fake workers; `deps` replaces any dependency. */
export function makeManager(files: FakeFile[], detector?: LanguageDetector, deps: Partial<ManagerDeps> = {}) {
  const server = fakeServer(files)
  const workers: FakeWorker[] = []
  const store = deps.store ?? new BergamotStore(new IDBFactory())
  const manager = new BergamotManager({
    store,
    fetch: server.fetch,
    serverUrl: server.SERVER,
    detector,
    createWorker: () => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    },
    ...deps,
  })
  return { manager, server, store, workers }
}
