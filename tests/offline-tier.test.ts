/** The Bergamot service as machine tier, and the background side of its model management, with the engine module mocked. */
import { beforeEach, describe, expect, it, vi } from "vitest"

const engine = vi.hoisted(() => ({
  translate: vi.fn(async (texts: string[], _src: string, _tgt: string) => texts.map((t) => `B(${t})`)),
  listPairs: vi.fn(async (_refresh?: boolean) => [{ src: "en", tgt: "zh-Hans", version: "3.0", architecture: "base", bytes: 1, rawBytes: 2, installed: false }]),
  install: vi.fn(async (_src: string, _tgt: string, _onProgress?: (done: number, total: number) => void, _signal?: AbortSignal) => {}),
  remove: vi.fn(async (_src: string, _tgt: string) => {}),
  missingPairs: vi.fn(async (_pairs: [string, string][]): Promise<[string, string][]> => [["ja", "en"]]),
  signature: vi.fn(async () => "en>zh-Hans@3.0"),
}))
vi.mock("../src/offline/bergamot", async (importOriginal) => ({ ...(await importOriginal<object>()), getBergamot: () => engine }))

import { handleBergamot } from "../src/background/bergamot-admin"
import { bergamotTranslateBatch } from "../src/background/translators/bergamot"
import type { TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { createDefaultSettings } from "../src/shared/settings"
import { createService } from "./helpers"

beforeEach(() => vi.clearAllMocks())

describe("Bergamot translator", () => {
  it("passes a chosen source language as it is", async () => {
    expect(await bergamotTranslateBatch(["Hallo"], "de", "zh-CN")).toEqual([{ status: "fulfilled", value: "B(Hallo)" }])
    expect(engine.translate).toHaveBeenCalledWith(["Hallo"], "de", "zh-CN")
  })

  it("names the language of each text for auto, without the browser's detector by script and English stop words", async () => {
    await bergamotTranslateBatch(["こんにちは、元気ですか"], "auto", "en")
    // "Danke" points nowhere and goes with the language of the batch.
    await bergamotTranslateBatch(["Thank you for the report, see you on Friday", "Danke"], "auto", "de")
    // Nothing points anywhere: English.
    await bergamotTranslateBatch(["Danke"], "auto", "en")
    expect(engine.translate.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      [["こんにちは、元気ですか"], "ja"],
      [["Thank you for the report, see you on Friday", "Danke"], "en"],
      [["Danke"], "en"],
    ])
  })

  it("serves the machine tier", async () => {
    const settings = createDefaultSettings()
    settings.tiers.machine = "bergamot"
    const { service } = createService(settings)
    const reports: [Tier, TranslateResponse][] = []
    await service.translateForPage({ text: "Hello", sourceLang: "en", targetLang: "zh-CN", tiers: ["machine"] }, (tier, result) => reports.push([tier, result]))
    expect(reports).toEqual([["machine", { ok: true, text: "B(Hello)" }]])
    expect(engine.translate).toHaveBeenCalledWith(["Hello"], "en", "zh-CN")
  })
})

describe("model management in the background script", () => {
  it("lists the pairs", async () => {
    expect(await handleBergamot({ type: "bergamotList", refresh: true })).toMatchObject({ ok: true, pairs: [{ src: "en", tgt: "zh-Hans" }] })
    expect(engine.listPairs).toHaveBeenCalledWith(true)
  })

  it("reports the progress of an installation, and its end", async () => {
    let finish!: () => void
    engine.install.mockImplementationOnce(async (_s, _t, onProgress) => {
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
    engine.install.mockImplementationOnce(
      (_s, _t, _p, signal) => new Promise((_, reject) => signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    )
    const result = handleBergamot({ type: "bergamotInstall", src: "ja", tgt: "en" })
    await vi.waitFor(() => expect(engine.install).toHaveBeenCalled())
    await handleBergamot({ type: "bergamotCancel", src: "ja", tgt: "en" })
    expect(await result).toEqual({ ok: false, cancelled: true })
  })

  it("lets a second request for the same pair wait for the running installation", async () => {
    let finish!: () => void
    let progress!: (done: number, total: number) => void
    engine.install.mockImplementationOnce(async (_s, _t, onProgress) => {
      progress = onProgress!
      await new Promise<void>((r) => (finish = r))
    })
    const first = handleBergamot({ type: "bergamotInstall", src: "en", tgt: "zh-Hans" })
    await vi.waitFor(() => expect(finish).toBeDefined())
    // A second page asks for the same pair: one download, one progress, one cancel button for both.
    const second = handleBergamot({ type: "bergamotInstall", src: "EN", tgt: "zh-CN" })
    progress(7, 10)
    expect(await handleBergamot({ type: "bergamotProgress" })).toEqual({ "en>zh-Hans": { done: 7, total: 10 } })
    finish()
    expect(await Promise.all([first, second])).toEqual([{ ok: true }, { ok: true }])
    expect(engine.install).toHaveBeenCalledTimes(1)
    expect(await handleBergamot({ type: "bergamotProgress" })).toEqual({})
  })

  it("cancels an installation that two pages asked for", async () => {
    engine.install.mockImplementationOnce(
      (_s, _t, _p, signal) => new Promise((_, reject) => signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    )
    const first = handleBergamot({ type: "bergamotInstall", src: "ja", tgt: "en" })
    const second = handleBergamot({ type: "bergamotInstall", src: "ja", tgt: "en" })
    await vi.waitFor(() => expect(engine.install).toHaveBeenCalled())
    await handleBergamot({ type: "bergamotCancel", src: "ja", tgt: "en" })
    expect(await Promise.all([first, second])).toEqual([
      { ok: false, cancelled: true },
      { ok: false, cancelled: true },
    ])
  })

  it("describes a failed installation", async () => {
    engine.install.mockRejectedValueOnce(new Error("disk full"))
    expect(await handleBergamot({ type: "bergamotInstall", src: "ja", tgt: "en" })).toEqual({ ok: false, error: "disk full" })
  })

  it("removes a pair", async () => {
    expect(await handleBergamot({ type: "bergamotRemove", src: "ja", tgt: "en" })).toEqual({ ok: true })
    expect(engine.remove).toHaveBeenCalledWith("ja", "en")
  })
})

describe("model management failures", () => {
  it("describes a list or removal that fails", async () => {
    engine.listPairs.mockRejectedValueOnce(new Error("offline"))
    expect(await handleBergamot({ type: "bergamotList" })).toEqual({ ok: false, error: "offline" })
    expect(engine.listPairs).toHaveBeenCalledWith(false)
    engine.remove.mockRejectedValueOnce(new Error("locked"))
    expect(await handleBergamot({ type: "bergamotRemove", src: "ja", tgt: "en" })).toEqual({ ok: false, error: "locked" })
  })

  it("ignores cancelling a pair that is not being installed", async () => {
    expect(await handleBergamot({ type: "bergamotCancel", src: "xx", tgt: "en" })).toBeUndefined()
  })
})
