/** CatalogCache: the catalogs of the offline services, on simulated time. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CATALOG_RETRY_MS, CATALOG_TTL_MS, CatalogCache } from "../src/offline/catalog-cache"
import { useFakeTimers } from "./helpers"

beforeEach(() => useFakeTimers(new Date("2026-10-01T00:00:00Z")))
afterEach(() => vi.useRealTimers())

/** A catalog whose reads answer `version` n (counting from 1) or fail while `offline`. */
function source() {
  let offline = false
  const load = vi.fn(async () => {
    if (offline) throw new Error("NetworkError")
    return `version ${load.mock.calls.length}`
  })
  return { load, setOffline: (value: boolean) => void (offline = value) }
}

describe("CatalogCache", () => {
  it("keeps the catalog for six hours and shares one read between callers", async () => {
    const { load } = source()
    const cache = new CatalogCache({ load })
    expect(cache.peek()).toBeNull()
    expect(await Promise.all([cache.get(), cache.get()])).toEqual(["version 1", "version 1"])
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.peek()).toBe("version 1")
    await vi.advanceTimersByTimeAsync(CATALOG_TTL_MS - 1)
    expect(await cache.get()).toBe("version 1")
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await cache.get()).toBe("version 2")
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("asks nothing for ten minutes after a failed read and answers null meanwhile", async () => {
    const { load, setOffline } = source()
    const cache = new CatalogCache({ load })
    setOffline(true)
    expect(await cache.get()).toBeNull()
    expect(cache.error).toEqual(new Error("NetworkError"))
    await vi.advanceTimersByTimeAsync(CATALOG_RETRY_MS - 1)
    setOffline(false)
    for (let i = 0; i < 3; i++) expect(await cache.get()).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await cache.get()).toBe("version 2")
    expect(cache.error).toBeUndefined()
  })

  it("answers with the outdated copy after a failed read and for the ten minutes after it", async () => {
    const { load, setOffline } = source()
    const cache = new CatalogCache({ load })
    await cache.get()
    await vi.advanceTimersByTimeAsync(CATALOG_TTL_MS)
    setOffline(true)
    expect(await cache.get()).toBe("version 1")
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(CATALOG_RETRY_MS - 1)
    expect(await cache.get()).toBe("version 1")
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(await cache.get()).toBe("version 1")
    expect(load).toHaveBeenCalledTimes(3)
  })

  it("reads at once on refresh, also within the six hours and the ten minutes", async () => {
    const { load, setOffline } = source()
    const cache = new CatalogCache({ load })
    await cache.get()
    expect(await cache.get(true)).toBe("version 2")
    setOffline(true)
    expect(await cache.get(true)).toBe("version 2")
    expect(cache.error).toBeInstanceOf(Error)
    setOffline(false)
    expect(await cache.get(true)).toBe("version 4")
    expect(cache.error).toBeUndefined()
    expect(load).toHaveBeenCalledTimes(4)
  })

  it("takes the saved copy when the first read fails, and reads again once the ten minutes have passed", async () => {
    const { load, setOffline } = source()
    const fallback = vi.fn(async () => "saved")
    const cache = new CatalogCache({ load, fallback })
    setOffline(true)
    expect(await cache.get()).toBe("saved")
    expect(cache.peek()).toBe("saved")
    // The saved copy counts as outdated: no read within the ten minutes, a read after them.
    expect(await cache.get()).toBe("saved")
    expect(load).toHaveBeenCalledTimes(1)
    setOffline(false)
    await vi.advanceTimersByTimeAsync(CATALOG_RETRY_MS)
    expect(await cache.get()).toBe("version 2")
    // The copy is asked for only while nothing was read.
    setOffline(true)
    expect(await cache.get(true)).toBe("version 2")
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it("answers null when there is no saved copy or it cannot be read", async () => {
    for (const fallback of [async () => undefined, () => Promise.reject(new Error("db gone"))]) {
      const cache = new CatalogCache({ load: () => Promise.reject(new Error("offline")), fallback })
      expect(await cache.get()).toBeNull()
      expect(cache.peek()).toBeNull()
    }
  })

  it("uses its own times and clock when given", async () => {
    let now = 0
    const { load } = source()
    const cache = new CatalogCache({ load, ttlMs: 100, retryMs: 10, now: () => now })
    await cache.get()
    now = 99
    await cache.get()
    now = 100
    await cache.get()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
