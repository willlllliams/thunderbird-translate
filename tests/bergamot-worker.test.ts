import { zstdCompressSync } from "node:zlib"
import { describe, expect, it, vi } from "vitest"
import type { WorkerModelFile } from "../src/offline/bergamot/protocol"
import { type BergamotLoadOptions, type BergamotModule, createEngineHandler, instantiateBergamot } from "../src/offline/bergamot/worker-core"

/** A stand-in for the embind classes that records what the handler does. */
function fakeBergamot() {
  const events: string[] = []
  class Vec<T> {
    items: T[] = []
    deleted = false
    push_back(v: T) {
      this.items.push(v)
    }
    size() {
      return this.items.length
    }
    get(i: number) {
      return this.items[i]!
    }
    delete() {
      this.deleted = true
    }
  }
  const created: { strings: Vec<string>[]; options: Vec<unknown>[] } = { strings: [], options: [] }
  class AlignedMemory {
    view: Uint8Array
    constructor(
      size: number,
      readonly alignment: number,
    ) {
      this.view = new Uint8Array(size)
    }
    getByteArrayView() {
      return this.view
    }
    delete() {}
  }
  class TranslationModel {
    constructor(
      readonly src: string,
      readonly tgt: string,
      readonly config: string,
      readonly model: AlignedMemory,
      readonly lex: AlignedMemory | null,
      readonly vocabs: Vec<AlignedMemory>,
      readonly quality: unknown,
    ) {
      events.push(`model ${src}>${tgt} align=${model.alignment}/${lex?.alignment} vocabs=${vocabs.size()}`)
    }
    delete() {
      events.push(`delete ${this.src}>${this.tgt}`)
    }
  }
  const respond = (texts: Vec<string>, tag: string) => {
    const out = new Vec<{ getTranslatedText(): string }>()
    for (const t of texts.items) out.push_back({ getTranslatedText: () => `${tag}:${t}` })
    return out
  }
  class BlockingService {
    translate(m: TranslationModel, texts: Vec<string>) {
      return respond(texts, `${m.src}>${m.tgt}`)
    }
    translateViaPivoting(a: TranslationModel, b: TranslationModel, texts: Vec<string>) {
      return respond(texts, `${a.src}>${a.tgt}>${b.tgt}`)
    }
    delete() {}
  }
  class VectorString extends Vec<string> {
    constructor() {
      super()
      created.strings.push(this)
    }
  }
  class VectorResponseOptions extends Vec<unknown> {
    constructor() {
      super()
      created.options.push(this)
    }
  }
  const module = { AlignedMemory, AlignedMemoryList: Vec, TranslationModel, BlockingService, VectorString, VectorResponseOptions, HEAPU8: new Uint8Array(64) }
  return { module: module as unknown as BergamotModule, events, created }
}

const file = (fileType: string, text: string): WorkerModelFile => {
  const z = zstdCompressSync(new TextEncoder().encode(text))
  return { fileType, name: `${fileType}.bin`, bytes: z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer }
}

describe("worker engine handler", () => {
  it("loads models with the right alignment and vocabularies, translates and frees the vectors", async () => {
    const { module, events, created } = fakeBergamot()
    const getBergamot = vi.fn(async () => module)
    const handle = createEngineHandler(getBergamot)

    expect(await handle({ id: 1, type: "load", key: "ja>en", src: "ja", tgt: "en", files: [file("model", "m"), file("lex", "l"), file("vocab", "v")] })).toMatchObject({ id: 1, ok: true, wasmHeapBytes: 64 })
    expect(
      await handle({ id: 2, type: "load", key: "en>ko", src: "en", tgt: "ko", files: [file("model", "m"), file("srcvocab", "s"), file("trgvocab", "t")] }),
    ).toMatchObject({ ok: true })
    expect(events).toEqual(["model ja>en align=256/64 vocabs=1", "model en>ko align=256/undefined vocabs=2"])

    expect(await handle({ id: 3, type: "translate", keys: ["ja>en"], texts: ["a", "b"] })).toEqual({ id: 3, ok: true, result: ["ja>en:a", "ja>en:b"], wasmHeapBytes: 64 })
    expect(await handle({ id: 4, type: "translate", keys: ["ja>en", "en>ko"], texts: ["c"] })).toMatchObject({ result: ["ja>en>ko:c"] })
    expect(created.strings.every((v) => v.deleted) && created.options.every((v) => v.deleted)).toBe(true)
    expect(created.options[0]!.items).toEqual([
      { qualityScores: false, alignment: true, html: false },
      { qualityScores: false, alignment: true, html: false },
    ])

    expect(await handle({ id: 5, type: "unload", key: "ja>en" })).toEqual({ id: 5, ok: true })
    expect(events.at(-1)).toBe("delete ja>en")
    expect(await handle({ id: 6, type: "translate", keys: ["ja>en"], texts: ["x"] })).toEqual({ id: 6, ok: false, error: "models not loaded: ja>en" })
    expect(getBergamot).toHaveBeenCalledTimes(1)
  })

  it("reports load failures and retries the wasm on the next request", async () => {
    const { module } = fakeBergamot()
    const getBergamot = vi.fn().mockRejectedValueOnce(new Error("wasm compile failed")).mockResolvedValue(module)
    const handle = createEngineHandler(getBergamot)
    const files = [file("model", "m"), file("vocab", "v")]
    expect(await handle({ id: 1, type: "load", key: "de>en", src: "de", tgt: "en", files })).toEqual({ id: 1, ok: false, error: "wasm compile failed" })
    expect(await handle({ id: 2, type: "load", key: "de>en", src: "de", tgt: "en", files: [file("model", "m"), file("vocab", "v")] })).toMatchObject({ ok: true })
    expect(await handle({ id: 3, type: "load", key: "fr>en", src: "fr", tgt: "en", files: [file("model", "m")] })).toEqual({ id: 3, ok: false, error: "no vocabulary for fr → en" })
  })
})

describe("worker engine edge cases", () => {
  const files = () => [file("model", "m"), file("vocab", "v")]

  it("replaces a loaded pair, needs a model file, and takes one or two pairs per translation", async () => {
    const { module, events } = fakeBergamot()
    const handle = createEngineHandler(async () => module)
    await handle({ id: 1, type: "load", key: "de>en", src: "de", tgt: "en", files: files() })
    await handle({ id: 2, type: "load", key: "de>en", src: "de", tgt: "en", files: files() })
    expect(events).toEqual(["model de>en align=256/undefined vocabs=1", "delete de>en", "model de>en align=256/undefined vocabs=1"])
    expect(await handle({ id: 3, type: "load", key: "fr>en", src: "fr", tgt: "en", files: [file("vocab", "v")] })).toEqual({ id: 3, ok: false, error: "no model file for fr → en" })
    for (const keys of [[], ["de>en", "de>en", "de>en"]]) {
      expect(await handle({ id: 4, type: "translate", keys, texts: ["x"] })).toMatchObject({ ok: false, error: `models not loaded: ${keys.join(", ")}` })
    }
    expect(await handle({ id: 5, type: "unload", key: "nothing" })).toEqual({ id: 5, ok: true })
  })

  it("reports errors that are not Error objects, and errors without a message", async () => {
    const handle = createEngineHandler(() => Promise.reject("out of memory"))
    expect(await handle({ id: 1, type: "translate", keys: ["a"], texts: [] })).toEqual({ id: 1, ok: false, error: "out of memory" })
    const unnamed = createEngineHandler(() => Promise.reject(new RangeError()))
    expect(await unnamed({ id: 2, type: "load", key: "a", src: "a", tgt: "b", files: [] })).toEqual({ id: 2, ok: false, error: "RangeError" })
  })
})

describe("instantiateBergamot", () => {
  const wasm = new Uint8Array([0, 97, 115, 109])

  it("passes the wasm and resolves with the module once it is initialized, even synchronously", async () => {
    const { module } = fakeBergamot()
    const load = vi.fn((options: BergamotLoadOptions) => {
      options.print("log")
      options.printErr("err")
      options.onRuntimeInitialized()
      return module
    })
    expect(await instantiateBergamot(load, wasm)).toBe(module)
    expect(load.mock.calls[0]![0]).toMatchObject({ wasmBinary: wasm, INITIAL_MEMORY: 41_943_040 })
  })

  it("rejects when the wasm aborts", async () => {
    const load = (options: BergamotLoadOptions) => {
      queueMicrotask(() => options.onAbort("OOM"))
      return {} as BergamotModule
    }
    await expect(instantiateBergamot(load, wasm)).rejects.toThrow("Bergamot wasm aborted: OOM")
  })
})
