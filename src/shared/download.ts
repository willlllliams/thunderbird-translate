/** Downloads of dictionary packs and offline models: the body with progress and an idle timeout, and its SHA-256. */

/** A list (dictionary index, model records) that has not arrived after this long fails. */
export const LIST_TIMEOUT_MS = 30_000
/** A download that receives nothing for this long fails; a slow one that keeps receiving data has no time limit. */
export const IDLE_TIMEOUT_MS = 30_000

/**
 * An AbortSignal for a download that aborts when kick() was not called for
 * `ms`, or when `outer` (cancelled by the user) aborts. Call kick() for
 * every piece of data and stop() at the end.
 */
export function idleSignal(ms: number, outer?: AbortSignal) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const kick = () => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(new DOMException("No data received", "TimeoutError")), ms)
  }
  const cancel = () => controller.abort(outer!.reason)
  if (outer?.aborted) cancel()
  outer?.addEventListener("abort", cancel)
  kick()
  return {
    signal: controller.signal,
    kick,
    /** Aborted because no data came, not by the user. */
    stalled: () => controller.signal.aborted && !outer?.aborted,
    stop: () => {
      clearTimeout(timer)
      outer?.removeEventListener("abort", cancel)
    },
  }
}

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
export async function readBody(response: Response, onProgress?: (received: number) => void, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const aborted = signal ? whenAborted(signal) : undefined
  const wait = <T>(promise: Promise<T>) => (aborted ? Promise.race([promise, aborted]) : promise)
  if (!response.body) {
    const bytes = new Uint8Array(await wait(response.arrayBuffer()))
    onProgress?.(bytes.byteLength)
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
      onProgress?.(received)
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

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>))
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")
}
