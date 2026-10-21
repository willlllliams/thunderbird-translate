/** fetchOk(), Retry-After, retry classification and the concurrency limit of the RequestQueue. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { isRetryableError, RequestQueue } from "../src/background/queue/request-queue"
import { fetchOk, HttpError, parseRetryAfter, timeoutSignal } from "../src/shared/http"
import { llmTranslateSingle } from "../src/background/translators/llm"
import { NetworkError, TimeoutError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import { resolveProviderConfig } from "../src/shared/settings"
import { asFetch, chatCompletion, until, useFakeTimers } from "./helpers"

afterEach(() => vi.useRealTimers())

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
    useFakeTimers()
    const fetchFn = async (_url: string, init: RequestInit) =>
      new Response(new ReadableStream({ start: (c) => init.signal!.addEventListener("abort", () => c.error(init.signal!.reason)) }))
    const request = fetchOk({ fetchFn: asFetch(fetchFn), timeoutMs: 600 }, spec, "Google")
      .then((resp) => resp.json())
      .catch((e) => e)
    await vi.advanceTimersByTimeAsync(600)
    const error = await request
    expect(error).toBeInstanceOf(TimeoutError)
    expect(error.message).toBe(ENGLISH.t("errTimeout", ["Google", "1"]))
  })

  it("B8: reports the body of an error that does not arrive within the timeout as TimeoutError, and leaves no timer", async () => {
    useFakeTimers()
    const fetchFn = async (_url: string, init: RequestInit) =>
      new Response(new ReadableStream({ start: (c) => init.signal!.addEventListener("abort", () => c.error(init.signal!.reason)) }), { status: 502 })
    const request = fetchOk({ fetchFn: asFetch(fetchFn), timeoutMs: 600 }, spec, "DeepLX").catch((e) => e)
    await vi.advanceTimersByTimeAsync(600)
    expect(await request).toBeInstanceOf(TimeoutError)
    expect(vi.getTimerCount()).toBe(0)
    // A complete error body is read as before.
    const error = await fetchOk({ fetchFn: asFetch(async () => new Response("busy", { status: 503, headers: { "Retry-After": "2" } })), timeoutMs: 600 }, spec, "X").catch((e) => e)
    expect(error).toMatchObject({ status: 503, responseBody: "busy", retryAfterMs: 2000 })
  })

  it("reads Retry-After as an HTTP date", async () => {
    useFakeTimers(new Date("2026-10-11T12:00:00Z"))
    try {
      const fetchFn = async () => new Response("", { status: 503, headers: { "Retry-After": "Sun, 11 Oct 2026 12:00:07 GMT" } })
      expect(await fetchOk({ fetchFn: asFetch(fetchFn) }, spec, "X").catch((e) => e.retryAfterMs)).toBe(7000)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("timeoutSignal", () => {
  it("clear() stops the timer: the signal never aborts and no timer is left", async () => {
    useFakeTimers()
    try {
      const { signal, clear } = timeoutSignal(1000)
      expect(vi.getTimerCount()).toBe(1)
      clear()
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(2000)
      expect(signal.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("leaves no timer behind a request with a timeout, whether it succeeds, fails or cannot connect", async () => {
    useFakeTimers()
    try {
      const answers = [async () => Response.json({ a: 1 }), async () => new Response("down", { status: 503 }), async () => Promise.reject(new TypeError("NetworkError"))]
      for (const answer of answers) {
        await fetchOk({ fetchFn: asFetch(answer), timeoutMs: 60_000 }, spec, "X").catch(() => {})
        expect(vi.getTimerCount()).toBe(0)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it("aborts with a TimeoutError after the given time of the global timers", async () => {
    useFakeTimers()
    try {
      const { signal } = timeoutSignal(1000)
      await vi.advanceTimersByTimeAsync(999)
      expect(signal.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect([signal.aborted, (signal.reason as DOMException).name]).toEqual([true, "TimeoutError"])
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
    ["30 s", new HttpError("busy", 503, 30_000), 30_000],
    ["AI SDK retry-after header", Object.assign(new Error("busy"), { statusCode: 429, isRetryable: true, responseHeaders: { "retry-after": "5" } }), 5000],
    ["AI SDK retry-after-ms header", Object.assign(new Error("busy"), { statusCode: 429, isRetryable: true, responseHeaders: { "retry-after-ms": "1500", "retry-after": "9" } }), 1500],
  ])("waits as the server asks: %s", async (_name, error, expected) => {
    const { queue, delays } = recordingQueue()
    expect(await queue.run(flaky(error))).toBe("ok")
    expect(delays).toEqual([expected])
  })

  it("B7: runs a task that fails with a TypeError once", async () => {
    const { queue, delays } = recordingQueue(3)
    const task = flaky(new TypeError("x is not a function"), 5)
    await expect(queue.run(task)).rejects.toThrow("x is not a function")
    expect([task.mock.calls.length, delays]).toEqual([1, []])
  })

  it("B6: fails at once when the server asks to wait longer than 30 s", async () => {
    const { queue, delays } = recordingQueue()
    const error = new HttpError("quota", 429, 120_000)
    const task = flaky(error)
    expect(await queue.run(task).catch((e) => e)).toBe(error)
    expect(task).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
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
    ["fetch failure as fetchOk() reports it", new NetworkError("https://x.example", new TypeError("Failed to fetch")), true],
    ["bare TypeError", new TypeError("Failed to fetch"), false],
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
    await until(() => expect(order).toEqual([1, 3]))
    gates[0]()
    await until(() => expect(order).toEqual([1, 3, 2]))
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
  useFakeTimers()
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

describe("RequestQueue minimum interval", () => {
  it("starts the attempts at least minIntervalMs apart, in the order they asked, and not at all apart without it", async () => {
    let clock = 0
    const slept: number[] = []
    const started: number[] = []
    let interval = 1100
    const queue = new RequestQueue({
      concurrency: () => 4,
      maxRetries: () => 0,
      minIntervalMs: () => interval,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms)
        clock += ms
      },
    })
    const task = (n: number) => async () => {
      started.push(clock)
      clock += 100
      return n
    }
    expect(await Promise.all([queue.run(task(1)), queue.run(task(2)), queue.run(task(3))])).toEqual([1, 2, 3])
    expect(started).toEqual([0, 1100, 2200])
    // Each task takes 100 ms of the interval.
    expect(slept).toEqual([1000, 1000])
    // A later attempt after a pause waits only what is left of the interval.
    clock += 2000
    await queue.run(task(4))
    expect(slept).toHaveLength(2)
    interval = 0
    await Promise.all([queue.run(task(5)), queue.run(task(6))])
    expect(slept).toHaveLength(2)
  })
})
