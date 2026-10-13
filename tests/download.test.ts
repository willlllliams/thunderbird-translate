/** Downloads of dictionary packs and offline models (shared/download.ts): the body in one buffer of the announced length. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { downloadBody } from "../src/shared/download"
import { useFakeTimers } from "./helpers"

beforeEach(() => useFakeTimers())
afterEach(() => vi.useRealTimers())

/** A response whose body arrives in `chunks`, with the given headers. */
function chunked(chunks: number[][], headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
      controller.close()
    },
  })
  return new Response(body, { headers })
}

async function read(response: Response) {
  const progress: number[] = []
  const bytes = await downloadBody(async () => response, (received) => progress.push(received), { name: "test", idleMs: 1000 })
  return { bytes: [...bytes], length: bytes.byteLength, buffer: bytes.buffer.byteLength, progress }
}

describe("download body", () => {
  it("fills one buffer of the announced length", async () => {
    const response = chunked([[1, 2], [3], [4, 5]], { "content-length": "5" })
    const set = vi.spyOn(Uint8Array.prototype, "set")
    expect(await read(response)).toEqual({ bytes: [1, 2, 3, 4, 5], length: 5, buffer: 5, progress: [2, 3, 5] })
    // Every chunk is copied once, into the buffer of the announced length.
    expect(set).toHaveBeenCalledTimes(3)
  })

  it("returns a buffer of the bytes received when fewer arrive than announced", async () => {
    expect(await read(chunked([[1, 2], [3]], { "content-length": "8" }))).toEqual({ bytes: [1, 2, 3], length: 3, buffer: 3, progress: [2, 3] })
  })

  it("keeps every byte when more arrive than announced", async () => {
    expect(await read(chunked([[1, 2], [3, 4], [5]], { "content-length": "3" }))).toEqual({ bytes: [1, 2, 3, 4, 5], length: 5, buffer: 5, progress: [2, 4, 5] })
  })

  it("collects the chunks without an announced length, or when the body was decoded", async () => {
    expect(await read(chunked([[1], [2, 3]]))).toEqual({ bytes: [1, 2, 3], length: 3, buffer: 3, progress: [1, 3] })
    expect(await read(chunked([[1], [2, 3]], { "content-length": "2", "content-encoding": "gzip" }))).toEqual({ bytes: [1, 2, 3], length: 3, buffer: 3, progress: [1, 3] })
    expect(await read(chunked([[1]], { "content-length": "many" }))).toMatchObject({ bytes: [1] })
  })
})
