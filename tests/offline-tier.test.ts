/** The Bergamot service as machine tier, and the background side of its model management, with the engine module mocked. */
import { beforeEach, describe, expect, it, vi } from "vitest"

const engine = vi.hoisted(() => ({
  bergamotTranslate: vi.fn(async (texts: string[], _src: string, _tgt: string, _options?: { fallbackSource?: string }) => texts.map((t) => `B(${t})`)),
  listBergamotPairs: vi.fn(async (_refresh?: boolean) => [{ src: "en", tgt: "zh-Hans", version: "3.0", architecture: "base", bytes: 1, rawBytes: 2, installed: false }]),
  installBergamotPair: vi.fn(async (_src: string, _tgt: string, _onProgress?: (done: number, total: number) => void, _signal?: AbortSignal) => {}),
  removeBergamotPair: vi.fn(async (_src: string, _tgt: string) => {}),
  missingBergamotPairs: vi.fn(async (_src: string, _tgt: string): Promise<[string, string][]> => [["ja", "en"]]),
}))
vi.mock("../src/offline/bergamot", async (importOriginal) => ({ ...(await importOriginal<object>()), ...engine }))

import { handleBergamot } from "../src/background/bergamot-admin"
import { bergamotTranslateBatch } from "../src/background/translators/bergamot"
import type { TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings } from "../src/shared/settings"
import { createService } from "./helpers"

beforeEach(() => vi.clearAllMocks())

describe("Bergamot translator", () => {
  it("passes a chosen source language as it is", async () => {
    expect(await bergamotTranslateBatch(["Hallo"], "de", "zh-CN")).toEqual(["B(Hallo)"])
    expect(engine.bergamotTranslate).toHaveBeenCalledWith(["Hallo"], "de", "zh-CN")
  })

  it("passes auto with a fallback for texts the browser cannot place", async () => {
    await bergamotTranslateBatch(["こんにちは、元気ですか"], "auto", "en")
    await bergamotTranslateBatch(["Thank you for the report, see you on Friday"], "auto", "de")
    await bergamotTranslateBatch(["Danke"], "auto", "en")
    expect(engine.bergamotTranslate.mock.calls.map((c) => [c[1], c[3]?.fallbackSource])).toEqual([
      ["auto", "ja"],
      ["auto", "en"],
      // Nothing points anywhere: English.
      ["auto", "en"],
    ])
  })

  it("serves the machine tier", async () => {
    const settings = createDefaultSettings()
    settings.tiers.machine = "bergamot"
    const { service } = createService(settings)
    const reports: [Tier, TranslateResponse][] = []
    await service.translateForPage({ text: "Hello", sourceLang: "en", targetLang: "zh-CN", tiers: ["machine"] }, (tier, result) => reports.push([tier, result]))
    expect(reports).toEqual([["machine", { ok: true, text: "B(Hello)" }]])
    expect(engine.bergamotTranslate).toHaveBeenCalledWith(["Hello"], "en", "zh-CN")
  })
})

describe("model management in the background script", () => {
  it("lists the pairs", async () => {
    expect(await handleBergamot({ type: "bergamotList", refresh: true })).toMatchObject({ ok: true, pairs: [{ src: "en", tgt: "zh-Hans" }] })
    expect(engine.listBergamotPairs).toHaveBeenCalledWith(true)
  })

  it("reports the progress of an installation, and its end", async () => {
    let finish!: () => void
    engine.installBergamotPair.mockImplementationOnce(async (_s, _t, onProgress) => {
      onProgress?.(5, 10)
      await new Promise<void>((r) => (finish = r))
    })
    const result = handleBergamot({ type: "bergamotInstall", src: "en", tgt: "zh-Hans" })
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(await handleBergamot({ type: "bergamotProgress" })).toEqual({ "en>zh-Hans": { done: 5, total: 10 } })
    finish()
    expect(await result).toEqual({ ok: true })
    expect(await handleBergamot({ type: "bergamotProgress" })).toEqual({})
  })

  it("cancels an installation", async () => {
    engine.installBergamotPair.mockImplementationOnce(
      (_s, _t, _p, signal) => new Promise((_, reject) => signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    )
    const result = handleBergamot({ type: "bergamotInstall", src: "ja", tgt: "en" })
    await vi.waitFor(() => expect(engine.installBergamotPair).toHaveBeenCalled())
    await handleBergamot({ type: "bergamotCancel", src: "ja", tgt: "en" })
    expect(await result).toEqual({ ok: false, cancelled: true })
  })

  it("describes a failed installation", async () => {
    engine.installBergamotPair.mockRejectedValueOnce(new Error("disk full"))
    expect(await handleBergamot({ type: "bergamotInstall", src: "ja", tgt: "en" })).toEqual({ ok: false, error: "disk full" })
  })

  it("names the directions a language pair needs", async () => {
    expect(await handleBergamot({ type: "bergamotRequired", src: "ja", tgt: "zh-CN" })).toEqual({
      required: [
        ["ja", "en"],
        ["en", "zh-Hans"],
      ],
      missing: [["ja", "en"]],
    })
  })

  it("removes a pair", async () => {
    expect(await handleBergamot({ type: "bergamotRemove", src: "ja", tgt: "en" })).toEqual({ ok: true })
    expect(engine.removeBergamotPair).toHaveBeenCalledWith("ja", "en")
  })
})

describe("model management failures", () => {
  it("describes a list or removal that fails", async () => {
    engine.listBergamotPairs.mockRejectedValueOnce(new Error("offline"))
    expect(await handleBergamot({ type: "bergamotList" })).toEqual({ ok: false, error: "offline" })
    expect(engine.listBergamotPairs).toHaveBeenCalledWith(false)
    engine.removeBergamotPair.mockRejectedValueOnce(new Error("locked"))
    expect(await handleBergamot({ type: "bergamotRemove", src: "ja", tgt: "en" })).toEqual({ ok: false, error: "locked" })
  })

  it.each([
    ["auto", "en"],
    ["", "de"],
  ])("needs nothing for the languages %j → %j", async (src, tgt) => {
    expect(await handleBergamot({ type: "bergamotRequired", src, tgt })).toEqual({ required: [], missing: [] })
  })

  it("ignores cancelling a pair that is not being installed", async () => {
    expect(await handleBergamot({ type: "bergamotCancel", src: "xx", tgt: "en" })).toBeUndefined()
  })
})
