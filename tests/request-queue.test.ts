/** fetchOk(), Retry-After, retry classification and the concurrency limit of the RequestQueue. */
import { describe, expect, it, vi } from "vitest"
import { fetchOk, HttpError, isRetryableError, parseRetryAfter, RequestQueue } from "../src/background/queue/request-queue"
import { llmTranslateSingle } from "../src/background/translators/llm"
import { NetworkError, TimeoutError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { resolveProviderConfig } from "../src/shared/settings"
import { asFetch, chatCompletion } from "./helpers"

const spec = { url: "https://api.example.com/translate", init: { method: "POST", headers: {} } }

/** Queue that records its waits instead of sleeping. */
function recordingQueue(maxRetries = 2, concurrency = 1) {
  const delays: number[] = []
  const queue = new RequestQueue({ concurrency: () => concurrency, maxRetries: () => maxRetries, sleep: async (ms) => void delays.push(ms) })
  return { queue, delays }
}

/** Task failing `failures` times with `error`, then answering "ok". */
function flaky(error: unknown, failures = 1) {
  return vi.fn(async () => {
    if (failures-- > 0) throw error
    return "ok"
  })
}

describe("fetchOk", () => {
  it("returns a successful response as it is", async () => {
    const resp = new Response("fine")
    expect(await fetchOk({ fetchFn: asFetch(async () => resp) }, spec, "X")).toBe(resp)
  })

  it("turns a failed connection into a NetworkError with the URL and the browser's message", async () => {
    const error = await fetchOk({ fetchFn: asFetch(async () => Promise.reject(new TypeError("NetworkError when attempting to fetch resource."))) }, spec, "X").catch((e) => e)
    expect(error).toBeInstanceOf(NetworkError)
    expect(error).toMatchObject({ url: spec.url, isRetryable: true })
    expect(error.message).toBe("Could not connect to api.example.com: NetworkError when attempting to fetch resource.")
  })

  it("turns an HTTP error into an HttpError with status, body, URL and an empty HTTP/2 statusText", async () => {
    const fetchFn = async () => new Response('{"error":"quota"}', { status: 429, headers: { "Retry-After": "3" } })
    const error = (await fetchOk({ fetchFn: asFetch(fetchFn) }, spec, "Google").catch((e) => e)) as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 429, retryAfterMs: 3000, url: spec.url, responseBody: '{"error":"quota"}', statusText: "" })
    expect(error.message).toBe(`${ENGLISH.t("errHttp", ["Google", "429"])} - {"error":"quota"}`)
    expect(error.i18nText).toEqual({ key: "errHttp", args: ["Google", "429"], detail: '{"error":"quota"}' })
  })

  it("leaves the detail out when the body is empty or cannot be read", async () => {
    const broken = { ok: false, status: 502, url: "", statusText: "Bad Gateway", text: () => Promise.reject(new Error("aborted")) } as unknown as Response
    const error = (await fetchOk({ fetchFn: asFetch(async () => broken) }, spec, "X").catch((e) => e)) as HttpError
    expect(error).toMatchObject({ status: 502, responseBody: "", url: spec.url, statusText: "Bad Gateway", retryAfterMs: undefined })
    expect(error.message).toBe(ENGLISH.t("errHttp", ["X", "502"]))
  })

  it("reads the body of a successful answer within the timeout, also an empty one", async () => {
    const full = await fetchOk({ fetchFn: asFetch(async () => Response.json({ a: 1 }, { headers: { "X-Test": "1" } })), timeoutMs: 1000 }, spec, "X")
    expect([await full.json(), full.headers.get("x-test")]).toEqual([{ a: 1 }, "1"])
    const empty = await fetchOk({ fetchFn: asFetch(async () => new Response(null, { status: 204 })), timeoutMs: 1000 }, spec, "X")
    expect([empty.status, await empty.text()]).toEqual([204, ""])
  })

  it("L8: reports a body that does not arrive within the timeout as TimeoutError", async () => {
    const fetchFn = async (_url: string, init: RequestInit) =>
      new Response(new ReadableStream({ start: (c) => init.signal!.addEventListener("abort", () => c.error(init.signal!.reason)) }))
    const error = await fetchOk({ fetchFn: asFetch(fetchFn), timeoutMs: 600 }, spec, "Google")
      .then((resp) => resp.json())
      .catch((e) => e)
    expect(error).toBeInstanceOf(TimeoutError)
    expect(error.message).toBe(ENGLISH.t("errTimeout", ["Google", "1"]))
  })

  it("reads Retry-After as an HTTP date", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-11T12:00:00Z") })
    try {
      const fetchFn = async () => new Response("", { status: 503, headers: { "Retry-After": "Sun, 11 Oct 2026 12:00:07 GMT" } })
      expect(await fetchOk({ fetchFn: asFetch(fetchFn) }, spec, "X").catch((e) => e.retryAfterMs)).toBe(7000)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-11T12:00:00Z")
  it.each([
    ["2", 2000],
    ["0", 0],
    ["Sun, 11 Oct 2026 12:00:30 GMT", 30000],
    // A date in the past: retry at once.
    ["Sun, 11 Oct 2026 11:00:00 GMT", 0],
    ["soon", undefined],
    ["", undefined],
    [null, undefined],
  ])("%s → %s ms", (value, expected) => {
    expect(parseRetryAfter(value, now)).toBe(expected)
  })
})

describe("RequestQueue retries", () => {
  it.each([
    ["seconds", new HttpError("busy", 429, 4000), 4000],
    ["more than 30 s, capped", new HttpError("busy", 503, 120_000), 30_000],
    ["AI SDK retry-after header", Object.assign(new Error("busy"), { statusCode: 429, isRetryable: true, responseHeaders: { "retry-after": "5" } }), 5000],
    ["AI SDK retry-after-ms header", Object.assign(new Error("busy"), { statusCode: 429, isRetryable: true, responseHeaders: { "retry-after-ms": "1500", "retry-after": "9" } }), 1500],
  ])("waits as the server asks: %s", async (_name, error, expected) => {
    const { queue, delays } = recordingQueue()
    expect(await queue.run(flaky(error))).toBe("ok")
    expect(delays).toEqual([expected])
  })

  it("backs off exponentially without Retry-After, also for headers without a usable value", async () => {
    const { queue, delays } = recordingQueue(3)
    const error = Object.assign(new Error("busy"), { statusCode: 500, isRetryable: true, responseHeaders: { "retry-after": "later" } })
    expect(await queue.run(flaky(error, 3))).toBe("ok")
    expect(delays).toHaveLength(3)
    delays.forEach((d, attempt) => expect(d).toBeGreaterThanOrEqual(250 * 2 ** attempt))
    delays.forEach((d, attempt) => expect(d).toBeLessThanOrEqual(500 * 2 ** attempt))
  })

  it("H1: retries a timeout once and reports the time of both attempts", async () => {
    const { queue, delays } = recordingQueue(3)
    const task = flaky(new TimeoutError("Google", 60_000), 5)
    const error = await queue.run(task).catch((e) => e)
    expect(task).toHaveBeenCalledTimes(2)
    expect(delays).toHaveLength(1)
    expect(error).toBeInstanceOf(TimeoutError)
    expect(error.message).toBe(ENGLISH.t("errTimeout", ["Google", "120"]))
  })

  it("H1: does not retry a timeout of a queue without timeout retries (AI services)", async () => {
    const queue = new RequestQueue({ concurrency: () => 1, maxRetries: () => 3, timeoutRetries: 0, sleep: async () => {} })
    const task = flaky(new TimeoutError("OpenAI", 60_000), 5)
    await expect(queue.run(task)).rejects.toThrow(ENGLISH.t("errTimeout", ["OpenAI", "60"]))
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("keeps retrying other failures after a timeout, up to maxRetries", async () => {
    const { queue } = recordingQueue(3)
    const errors = [new TimeoutError("Google", 1000), new NetworkError("https://x.example/"), new NetworkError("https://x.example/")]
    const task = vi.fn(async () => {
      const error = errors.shift()
      if (error) throw error
      return "ok"
    })
    expect(await queue.run(task)).toBe("ok")
    expect(task).toHaveBeenCalledTimes(4)
  })

  it("retries network errors and gives up after maxRetries", async () => {
    const { queue, delays } = recordingQueue(2)
    const task = flaky(new NetworkError("https://x.example/"), 5)
    await expect(queue.run(task)).rejects.toBeInstanceOf(NetworkError)
    expect(task).toHaveBeenCalledTimes(3)
    expect(delays).toHaveLength(2)
  })

  it.each([
    ["408", { status: 408 }, true],
    ["429", { status: 429 }, true],
    ["500 as statusCode", { statusCode: 500 }, true],
    ["404", { status: 404 }, false],
    ["fetch TypeError", new TypeError("Failed to fetch"), true],
    ["isRetryable wins over status", { status: 503, isRetryable: false }, false],
    ["plain Error", new Error("parse"), false],
    ["string", "boom", false],
    ["null", null, false],
  ])("classifies %s", (_name, error, retryable) => {
    expect(isRetryableError(error)).toBe(retryable)
  })

  it("waits for the Retry-After of a rate-limited AI request (end to end through the AI SDK)", async () => {
    const { queue, delays } = recordingQueue()
    let calls = 0
    const fetchFn = vi.fn(async () =>
      ++calls === 1
        ? new Response('{"error":{"message":"Rate limit reached","type":"rate_limit"}}', { status: 429, headers: { "Retry-After": "6", "Content-Type": "application/json" } })
        : chatCompletion("你好"),
    )
    const provider = resolveProviderConfig("openai", { apiKey: "sk-test", baseURL: "", model: "" })
    const out = await queue.run(() => llmTranslateSingle({ text: "Hello" }, { provider, systemPrompt: "", targetLanguageName: "Chinese", fetchFn: asFetch(fetchFn) }))
    expect(out).toBe("你好")
    expect(delays).toEqual([6000])
  })
})

describe("RequestQueue concurrency", () => {
  it("follows a changed limit, counts at least one slot and hands slots over in order", async () => {
    let limit = 0
    const queue = new RequestQueue({ concurrency: () => limit, maxRetries: () => 0 })
    const gates: (() => void)[] = []
    const order: number[] = []
    const task = (n: number) => () =>
      new Promise<number>((resolve) => {
        order.push(n)
        gates.push(() => resolve(n))
      })
    const runs = [queue.run(task(1)), queue.run(task(2))]
    await Promise.resolve()
    // A limit of 0 still lets one request through.
    expect(queue.activeCount).toBe(1)
    limit = 3
    runs.push(queue.run(task(3)))
    await vi.waitFor(() => expect(order).toEqual([1, 3]))
    gates[0]()
    await vi.waitFor(() => expect(order).toEqual([1, 3, 2]))
    expect(queue.activeCount).toBe(2)
    gates[1]()
    gates[2]()
    expect(await Promise.all(runs)).toEqual([1, 2, 3])
    expect(queue.activeCount).toBe(0)
  })

  it("frees the slot of a failed task", async () => {
    const { queue } = recordingQueue(0)
    await expect(queue.run(async () => Promise.reject(new Error("x")))).rejects.toThrow("x")
    expect(queue.activeCount).toBe(0)
    expect(await queue.run(async () => 1)).toBe(1)
  })
})

it("waits with a real timer when no sleep function is given", async () => {
  vi.useFakeTimers()
  try {
    const queue = new RequestQueue({ concurrency: () => 1, maxRetries: () => 1 })
    const result = queue.run(flaky(new HttpError("busy", 429, 1000)))
    await vi.advanceTimersByTimeAsync(999)
    let settled = false
    void result.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBe("ok")
  } finally {
    vi.useRealTimers()
  }
})
