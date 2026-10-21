/**
 * The settings the e2e build stores for each run (src/e2e/scenario-settings.ts). The runs of a variant share one
 * Thunderbird profile, so each run starts from the settings the run before it stored: a run that turns the cache off
 * must not leave it off for the next one. The "summary" run, which follows runs without the cache, needs it to answer
 * its second request.
 */
import { describe, expect, it, vi } from "vitest"
import { PersistentCache } from "../src/background/cache"
import type { LlmCallOptions } from "../src/background/translators/llm"
import { IMAGE_MODES, MACHINE, scenarioSettings } from "../src/e2e/scenario-settings"
import { isAnimated } from "../src/background/images"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { consentEntry, createDefaultSettings, defaultImageSettings } from "../src/shared/settings"
import { createService, memoryStorage } from "./helpers"

const SERVER = "http://127.0.0.1:8080"
/** The runs on the shared plain profile, in the order of e2e/run.mjs. */
const RUNS = ["message", "message", "auto", "auto-skip", "missing", "consent", ...MACHINE.map((m) => `machine-${m.id}`), "summary", "image-ask", "image-auto", "image-off", "image-switch"]

/** The settings of each run, each read from what the run before it stored. */
function storedRuns() {
  return RUNS.map((scenario) => [scenario, scenarioSettings(scenario, SERVER)] as const)
}

describe("settings of the e2e runs", () => {
  it("I3: start from the defaults, whatever an earlier run of the profile left", () => {
    for (const scenario of RUNS) {
      const s = scenarioSettings(scenario, SERVER)
      const d = createDefaultSettings()
      expect([scenario, s.offlineMutedPairs, s.summary, s.style, s.batch, s.translateSubject, s.renderMarkdown, s.prompts]).toEqual([scenario, d.offlineMutedPairs, d.summary, d.style, d.batch, d.translateSubject, d.renderMarkdown, d.prompts])
    }
  })

  it("switch the cache back on after the runs that turn it off", () => {
    expect(storedRuns().map(([scenario, s]) => [scenario, s.cache.enabled])).toEqual(
      RUNS.map((scenario) => [scenario, !["auto", "auto-skip", "missing", "consent", "image-auto", "image-switch"].includes(scenario) && !scenario.startsWith("machine-")]),
    )
  })

  it("let the summary run answer its second request from the cache, as the background script configures it", async () => {
    const settings = storedRuns().find(([scenario]) => scenario === "summary")![1]
    expect([settings.tiers.ai, settings.onlineConsent]).toEqual(["custom", ["google-free@127.0.0.1"]])
    // The probe allows the AI service in the consent panel.
    settings.onlineConsent.push(consentEntry(settings, "custom"))
    const cache = new PersistentCache(memoryStorage(), 100, 10)
    cache.configure(settings.cache.enabled, settings.cache.maxEntries)
    const summarize = vi.fn(async (_prompt: string, _opts: LlmCallOptions) => '```json\n{"summary": ["S"], "actions": [], "questions": [], "dates": []}\n```')
    const { service } = createService(settings, { cache, llm: { summarize } }, { consent: false })
    const header = { author: "Alice", date: "2026-10-05T08:00:00.000Z", subject: "Quarterly report" }
    for (const fresh of [false, false, true]) expect(await service.summarize("Body", header, fresh)).toMatchObject({ ok: true, summary: { summary: ["S"] } })
    // First request, the cache, then Regenerate.
    expect(summarize).toHaveBeenCalledTimes(2)
  })

  it("translate images with precise translation only in the image runs, each in its mode, the first one without consent", () => {
    expect(storedRuns().map(([scenario, s]) => [scenario, s.precise.enabled, s.image.mode, s.image.maxPerMessage, s.imageConsent])).toEqual(
      RUNS.map((scenario) => {
        const mode = IMAGE_MODES[scenario]
        return [scenario, mode !== undefined, mode ?? "ask", scenario === "image-auto" ? 1 : 5, mode && scenario !== "image-ask" ? ["custom@127.0.0.1"] : []]
      }),
    )
  })

  it("have a message whose images the filters tell apart: two to translate, a pixel, an animated GIF and a logo in the signature", () => {
    const eml = readFileSync(join(__dirname, "..", "e2e", "fixtures", "image.eml"), "utf8")
    const parts = new Map<string, Uint8Array>()
    for (const section of eml.split(/^--tt-(?:related|mixed)(?:--)?$/m)) {
      const name = /name="([^"]+)"/.exec(section)?.[1]
      if (name && section.includes("base64")) parts.set(name, new Uint8Array(Buffer.from(section.slice(section.indexOf("\n\n")).replace(/\s+/g, ""), "base64")))
    }
    const size = (png: Uint8Array) => [new DataView(png.buffer, png.byteOffset).getUint32(16), new DataView(png.buffer, png.byteOffset).getUint32(20)]
    const minBytes = defaultImageSettings().minKB * 1024
    expect([...parts.keys()].sort()).toEqual(["chart.png", "logo.png", "notice.png", "pixel.png", "receipt.png", "spinner.gif"])
    expect(size(parts.get("chart.png")!)).toEqual([400, 200])
    expect(size(parts.get("receipt.png")!)).toEqual([300, 300])
    expect(size(parts.get("pixel.png")!)).toEqual([1, 1])
    for (const name of ["chart.png", "receipt.png", "notice.png"]) expect([name, parts.get(name)!.length >= minBytes, isAnimated(parts.get(name)!)]).toEqual([name, true, false])
    // S7: the notice has no Content-Disposition, passes the filters of the content script and comes after the GIF.
    expect(size(parts.get("notice.png")!)).toEqual([320, 160])
    const start = eml.indexOf('name="notice.png"')
    expect(eml.slice(start, eml.indexOf("\n\n", start))).not.toContain("Content-Disposition")
    expect(eml.indexOf("cid:notice@") > eml.indexOf("cid:spinner@")).toBe(true)
    // The GIF passes the filters of the content script (a 200 × 200 screen) and is left out for its two frames.
    const gif = parts.get("spinner.gif")!
    expect([gif[6] | (gif[7] << 8), gif[8] | (gif[9] << 8), gif.length >= minBytes, isAnimated(gif)]).toEqual([200, 200, true, true])
    expect(eml).toContain('<div class="moz-signature">')
  })

  it("point the machine translators at the mock server with the keys it checks", () => {
    const s = scenarioSettings("machine-baidu", SERVER)
    expect(s.tiers).toEqual({ dictionary: null, machine: "baidu", ai: null })
    expect(s.providers.baidu).toMatchObject({ enabled: true, baseURL: `${SERVER}/baidu`, appId: "e2e-baidu-app", apiKey: "e2e-baidu-key" })
    expect(s.onlineConsent).toEqual(["google-free@127.0.0.1", "custom@127.0.0.1", "baidu@127.0.0.1"])
  })
})
