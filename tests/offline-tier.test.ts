/** The Bergamot service as machine tier, with the engine module mocked. */
import { beforeEach, describe, expect, it, vi } from "vitest"

const engine = vi.hoisted(() => ({
  translate: vi.fn(async (texts: string[], _src: string, _tgt: string) => texts.map((t) => `B(${t})`)),
  signature: vi.fn(async () => "en>zh-Hans@3.0"),
}))
vi.mock("../src/offline/bergamot", async (importOriginal) => ({ ...(await importOriginal<object>()), getBergamot: () => engine }))

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
