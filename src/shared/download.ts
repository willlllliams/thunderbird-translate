/** Downloads of dictionary packs and offline models: the body with progress and an idle timeout. */

import { LocalizedError } from "./errors"

/** A list (dictionary index, model records) that has not arrived after this long fails. */
export const LIST_TIMEOUT_MS = 30_000
/** A download that receives nothing for this long fails; a slow one that keeps receiving data has no time limit. */
export const IDLE_TIMEOUT_MS = 30_000

/** A promise that rejects with the reason of `signal` once it aborts. */
function whenAborted(signal: AbortSignal): Promise<never> {
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason)
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true })
  })
  aborted.catch(() => {})
  return aborted
}

/** The whole body of a response; `onProgress` gets the number of bytes received so far after every chunk. Reading stops when `signal` aborts. */
async function readBody(response: Response, onProgress: (received: number) => void, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const aborted = whenAborted(signal)
  const wait = <T>(promise: Promise<T>) => Promise.race([promise, aborted])
  if (!response.body) {
    const bytes = new Uint8Array(await wait(response.arrayBuffer()))
    onProgress(bytes.byteLength)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await wait(reader.read())
      if (done) break
      chunks.push(value)
      received += value.byteLength
      onProgress(received)
    }
  } catch (error) {
    reader.cancel().catch(() => {})
    throw error
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * The body of the response that `request` fetches with the signal it is
 * given; `onProgress` gets the bytes received so far after every chunk.
 * Fails with errDownloadStalled, naming `name`, when nothing arrives for
 * `idleMs`, however long the whole download takes, and stops when `signal`
 * (cancelled by the user) aborts.
 */
export async function downloadBody(
  request: (signal: AbortSignal) => Promise<Response>,
  onProgress: (received: number, response: Response) => void,
  { name, idleMs, signal }: { name: string; idleMs: number; signal?: AbortSignal },
): Promise<Uint8Array<ArrayBuffer>> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const kick = () => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(new DOMException("No data received", "TimeoutError")), idleMs)
  }
  const cancel = () => controller.abort(signal!.reason)
  if (signal?.aborted) cancel()
  signal?.addEventListener("abort", cancel)
  kick()
  try {
    const response = await request(controller.signal)
    const progress = (received: number) => {
      kick()
      onProgress(received, response)
    }
    return await readBody(response, progress, controller.signal)
  } catch (error) {
    // Aborted because no data came, not by the user.
    throw controller.signal.aborted && !signal?.aborted ? new LocalizedError("errDownloadStalled", [name, String(Math.round(idleMs / 1000))]) : error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", cancel)
  }
}
