/**
 * The settings the e2e build stores for each run (src/e2e/scenario-settings.ts). The runs of a variant share one
 * Thunderbird profile, so each run starts from the settings the run before it stored: a run that turns the cache off
 * must not leave it off for the next one. The "summary" run, which follows runs without the cache, needs it to answer
 * its second request.
 */
import { describe, expect, it, vi } from "vitest"
import { PersistentCache } from "../src/background/cache"
import type { LlmCallOptions } from "../src/background/translators/llm"
import { MACHINE, scenarioSettings } from "../src/e2e/scenario-settings"
import { createDefaultSettings } from "../src/shared/settings"
import { createService, memoryStorage } from "./helpers"

const SERVER = "http://127.0.0.1:8080"
/** The runs on the shared plain profile, in the order of e2e/run.mjs. */
const RUNS = ["message", "message", "auto", "auto-skip", "missing", "consent", ...MACHINE.map((m) => `machine-${m.id}`), "summary"]

/** The settings of each run, each read from what the run before it stored. */
function storedRuns() {
  let stored: unknown = createDefaultSettings("en")
  return RUNS.map((scenario) => {
    const settings = scenarioSettings(stored, scenario, SERVER)
    stored = structuredClone(settings)
    return [scenario, settings] as const
  })
}

describe("settings of the e2e runs", () => {
  it("switch the cache back on after the runs that turn it off", () => {
    expect(storedRuns().map(([scenario, s]) => [scenario, s.cache.enabled])).toEqual(
      RUNS.map((scenario) => [scenario, !["auto", "auto-skip", "missing", "consent"].includes(scenario) && !scenario.startsWith("machine-")]),
    )
  })

  it("let the summary run answer its second request from the cache, as the background script configures it", async () => {
    const settings = storedRuns().at(-1)![1]
    expect([settings.tiers.ai, settings.onlineConsent]).toEqual(["custom", ["google-free"]])
    // The probe allows the AI service in the consent panel.
    settings.onlineConsent.push("custom")
    const cache = new PersistentCache(memoryStorage(), 100, 10)
    cache.configure(settings.cache.enabled, settings.cache.maxEntries)
    const summarize = vi.fn(async (_prompt: string, _opts: LlmCallOptions) => '```json\n{"summary": ["S"], "actions": [], "questions": [], "dates": []}\n```')
    const { service } = createService(settings, { cache, llm: { summarize } }, { consent: false })
    const header = { author: "Alice", date: "2026-10-05T08:00:00.000Z", subject: "Quarterly report" }
    for (const fresh of [false, false, true]) expect(await service.summarize("Body", header, fresh)).toMatchObject({ ok: true, summary: { summary: ["S"] } })
    // First request, the cache, then Regenerate.
    expect(summarize).toHaveBeenCalledTimes(2)
  })

  it("point the machine translators at the mock server with the keys it checks", () => {
    const s = scenarioSettings(undefined, "machine-baidu", SERVER)
    expect(s.tiers).toEqual({ dictionary: null, machine: "baidu", ai: null })
    expect(s.providers.baidu).toMatchObject({ enabled: true, baseURL: `${SERVER}/baidu`, appId: "e2e-baidu-app", apiKey: "e2e-baidu-key" })
    expect(s.onlineConsent).toEqual(["google-free", "custom", "baidu"])
  })
})
