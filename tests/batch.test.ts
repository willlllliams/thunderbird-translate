import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BatchQueue, groupIntoBatches, joinParts, splitText } from "../src/background/queue/batch-queue"
import { backoffDelay, isRetryableError, RequestQueue } from "../src/background/queue/request-queue"
import { NetworkError } from "../src/shared/errors"
import { HttpError } from "../src/shared/http"
import { useFakeTimers } from "./helpers"

describe("groupIntoBatches", () => {
  const size = (s: string) => s.length

  it("respects maxItems", () => {
    const items = ["a", "b", "c", "d", "e"]
    expect(groupIntoBatches(items, size, { maxItems: 2, maxChars: 100 })).toEqual([["a", "b"], ["c", "d"], ["e"]])
  })

  it("respects maxChars and keeps order", () => {
    const items = ["aaaa", "bbbb", "cc", "dddddd", "e"]
    expect(groupIntoBatches(items, size, { maxItems: 10, maxChars: 8 })).toEqual([["aaaa", "bbbb"], ["cc", "dddddd"], ["e"]])
  })

  it("sends an oversized item alone", () => {
    const items = ["aa", "x".repeat(50), "bb"]
    expect(groupIntoBatches(items, size, { maxItems: 10, maxChars: 10 })).toEqual([["aa"], ["x".repeat(50)], ["bb"]])
  })

  it("returns nothing for no input", () => {
    expect(groupIntoBatches([], size, { maxItems: 3, maxChars: 3 })).toEqual([])
  })
})

describe("BatchQueue", () => {
  beforeEach(() => useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function makeQueue(limits = { maxItems: 3, maxChars: 100 }) {
    const calls: { key: string; items: string[] }[] = []
    const q = new BatchQueue<{ key: string; text: string }, string>({
      delayMs: () => 50,
      limits: () => limits,
      getKey: (i) => i.key,
      getSize: (i) => i.text.length,
      execute: async (key, items) => {
        calls.push({ key, items: items.map((i) => i.text) })
        return items.map((i) => i.text.toUpperCase())
      },
    })
    return { q, calls }
  }

  it("collects items arriving within the window into one call", async () => {
    const { q, calls } = makeQueue({ maxItems: 10, maxChars: 1000 })
    const p1 = q.enqueue({ key: "k", text: "a" })
    await vi.advanceTimersByTimeAsync(20)
    const p2 = q.enqueue({ key: "k", text: "b" })
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(40)
    expect(await Promise.all([p1, p2])).toEqual(["A", "B"])
    expect(calls).toEqual([{ key: "k", items: ["a", "b"] }])
  })

  it("keeps different keys (provider/language) apart", async () => {
    const { q, calls } = makeQueue({ maxItems: 10, maxChars: 1000 })
    const ps = [q.enqueue({ key: "en", text: "a" }), q.enqueue({ key: "ja", text: "b" }), q.enqueue({ key: "en", text: "c" })]
    await vi.advanceTimersByTimeAsync(60)
    await Promise.all(ps)
    expect(calls).toEqual([
      { key: "en", items: ["a", "c"] },
      { key: "ja", items: ["b"] },
    ])
  })

  it("flushes immediately when maxItems is reached", async () => {
    const { q, calls } = makeQueue({ maxItems: 2, maxChars: 1000 })
    const ps = ["a", "b", "c"].map((text) => q.enqueue({ key: "k", text }))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual([{ key: "k", items: ["a", "b"] }])
    await vi.advanceTimersByTimeAsync(60)
    expect(await Promise.all(ps)).toEqual(["A", "B", "C"])
    expect(calls[1]).toEqual({ key: "k", items: ["c"] })
  })

  it("starts a new batch when adding would exceed maxChars", async () => {
    const { q, calls } = makeQueue({ maxItems: 10, maxChars: 5 })
    const ps = ["aaa", "bbb", "c"].map((text) => q.enqueue({ key: "k", text }))
    await vi.advanceTimersByTimeAsync(60)
    await Promise.all(ps)
    expect(calls.map((c) => c.items)).toEqual([["aaa"], ["bbb", "c"]])
  })

  it("rejects every waiter when the executor fails or miscounts", async () => {
    const q = new BatchQueue<string, string>({
      delayMs: () => 10,
      limits: () => ({ maxItems: 10, maxChars: 100 }),
      getKey: () => "k",
      getSize: (s) => s.length,
      execute: async () => ["only one"],
    })
    const ps = [q.enqueue("a"), q.enqueue("b")].map((p) => p.catch((e: Error) => e.message))
    await vi.advanceTimersByTimeAsync(20)
    const msgs = await Promise.all(ps)
    expect(msgs[0]).toMatch(/1 results for 2 items/)
    expect(msgs[1]).toMatch(/1 results for 2 items/)
  })
})

describe("RequestQueue", () => {
  it("never runs more tasks than the concurrency limit", async () => {
    const q = new RequestQueue({ concurrency: () => 2, maxRetries: () => 0 })
    let running = 0
    let peak = 0
    const task = async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      return 1
    }
    await Promise.all(Array.from({ length: 8 }, () => q.run(task)))
    expect(peak).toBe(2)
    expect(q.activeCount).toBe(0)
  })

  it("retries retryable errors with backoff, then succeeds", async () => {
    const delays: number[] = []
    const q = new RequestQueue({
      concurrency: () => 1,
      maxRetries: () => 3,
      sleep: async (ms) => {
        delays.push(ms)
      },
    })
    let attempts = 0
    const result = await q.run(async () => {
      attempts++
      if (attempts < 3) throw new HttpError("rate limited", 429)
      return "ok"
    })
    expect(result).toBe("ok")
    expect(attempts).toBe(3)
    expect(delays).toHaveLength(2)
    expect(delays[1]).toBeGreaterThanOrEqual(delays[0] / 2)
  })

  it("does not retry client errors and honours Retry-After", async () => {
    const delays: number[] = []
    const q = new RequestQueue({ concurrency: () => 1, maxRetries: () => 2, sleep: async (ms) => void delays.push(ms) })
    let attempts = 0
    await expect(
      q.run(async () => {
        attempts++
        throw new HttpError("bad key", 401)
      }),
    ).rejects.toThrow("bad key")
    expect(attempts).toBe(1)

    attempts = 0
    await expect(
      q.run(async () => {
        attempts++
        throw new HttpError("slow down", 429, 2000)
      }),
    ).rejects.toThrow("slow down")
    expect(attempts).toBe(3)
    expect(delays).toEqual([2000, 2000])
  })

  it("classifies errors and computes exponential delays", () => {
    expect(isRetryableError(new HttpError("x", 503))).toBe(true)
    expect(isRetryableError(new HttpError("x", 400))).toBe(false)
    expect(isRetryableError(new NetworkError("https://x.example", new TypeError("NetworkError when attempting to fetch resource.")))).toBe(true)
    // B7: an address that is no URL, or a bug, fails the same way again.
    expect(isRetryableError(new TypeError("x is not a function"))).toBe(false)
    expect(isRetryableError({ name: "AI_APICallError", isRetryable: false, statusCode: 500 })).toBe(false)
    const fixed = () => 1
    expect([0, 1, 2, 3, 10].map((a) => backoffDelay(a, 500, 8000, fixed))).toEqual([500, 1000, 2000, 4000, 8000])
  })
})

describe("splitText and joinParts", () => {
  it("leave a paragraph that fits as it is", () => {
    expect(splitText("Short.", 10)).toEqual([{ text: "Short.", gap: "" }])
    expect(joinParts([{ text: "Short.", gap: "" }], ["短。"], "zh-CN")).toBe("短。")
  })

  it("cut at sentence boundaries, as many sentences per piece as fit", () => {
    const parts = splitText("One two three. Four five six. Seven eight nine.", 30)
    expect(parts).toEqual([
      { text: "One two three. Four five six.", gap: " " },
      { text: "Seven eight nine.", gap: "" },
    ])
    expect(joinParts(parts, ["A.", "B."], "de")).toBe("A. B.")
    expect(joinParts(parts, ["甲。", "乙。"], "ja")).toBe("甲。乙。")
  })

  it("cut a sentence longer than the limit by length, at a space when there is one", () => {
    const parts = splitText("aaaa bbbb cccc dddd eeee", 10)
    expect(parts.every((p) => p.text.length <= 10)).toBe(true)
    expect(parts.map((p) => p.text).join(" ")).toBe("aaaa bbbb cccc dddd eeee")
    expect(splitText("x".repeat(25), 10).map((p) => p.text)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)])
    // A surrogate pair is never cut in half.
    const emoji = splitText("😀".repeat(6), 5).map((p) => p.text)
    expect(emoji.join("")).toBe("😀".repeat(6))
    expect(emoji).toEqual(["😀😀", "😀😀", "😀😀"])
  })

  it("end a piece at a line break and keep it when joining", () => {
    const parts = splitText("First line here.\nSecond line here.", 25)
    expect(parts).toEqual([
      { text: "First line here.", gap: "\n" },
      { text: "Second line here.", gap: "" },
    ])
    expect(joinParts(parts, ["第一行。", "第二行。"], "zh-CN")).toBe("第一行。\n第二行。")
  })

  /** The parts written back one after the other: the paragraph as it was. */
  const rejoin = (parts: { text: string; gap: string }[]) => parts.map((p) => p.text + p.gap).join("")

  it("M1: keep the lines of a long quoted block together and cut only where the limit requires it", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `> Line ${String(i).padStart(2, "0")} of the quoted reply, kept exactly as it was written${".".repeat(i % 7)}`)
    const text = lines.join("\n").slice(0, 3889)
    const parts = splitText(text, 3000)
    expect(parts).toHaveLength(2)
    expect(parts.every((p) => p.text.length <= 3000)).toBe(true)
    // Cut at a line boundary; the line breaks inside a piece stay in it.
    expect(parts[0].gap).toBe("\n")
    expect(parts[0].text.split("\n").length).toBeGreaterThan(40)
    expect(rejoin(parts)).toBe(text)
    expect(joinParts(parts, parts.map((p) => p.text), "de")).toBe(text)
  })

  it("M1: cut at the last line break of a full piece, else between sentences, and keep the whitespace rules", () => {
    const text = "Short line.\nOne two three. Four five six. Seven eight nine.\nLast line."
    const parts = splitText(text, 30)
    expect(parts).toEqual([
      { text: "Short line.", gap: "\n" },
      { text: "One two three. Four five six.", gap: " " },
      { text: "Seven eight nine.\nLast line.", gap: "" },
    ])
    expect(rejoin(parts)).toBe(text)
    expect(joinParts(parts, ["A", "B", "C"], "de")).toBe("A\nB C")
    expect(joinParts(parts, ["甲", "乙", "丙"], "zh-CN")).toBe("甲\n乙丙")
    // What follows the line break goes on alone when the next sentence does not fit beside it either.
    expect(splitText("L1.\nAb cd. Ef gh ij kl mn op.", 20)).toEqual([
      { text: "L1.", gap: "\n" },
      { text: "Ab cd.", gap: " " },
      { text: "Ef gh ij kl mn op.", gap: "" },
    ])
  })

  it("keep the line breaks at the start of a long paragraph in a part without text, and put them back when joining", () => {
    const text = `\n\n${"Sentence of a long paragraph. ".repeat(4).trim()}`
    const parts = splitText(text, 40)
    expect(parts.filter((p) => p.text === "")).toEqual([{ text: "", gap: "\n\n" }])
    expect(parts.every((p) => p.text.length <= 40 && p.text === p.text.trim())).toBe(true)
    expect(rejoin(parts)).toBe(text)
    const translations = parts.map((p) => (p.text ? "X." : ""))
    expect(joinParts(parts, translations, "de")).toBe("\n\nX. X. X. X.")
  })
})
