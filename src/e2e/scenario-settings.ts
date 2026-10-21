/**
 * The settings of an e2e run (src/e2e/background.ts), from the settings the
 * profile holds and the scenario of the run. The runs of one variant share a
 * profile, so every field a run depends on is set here, the cache switch
 * included: a run that turned it off must not leave it off for the next one.
 */

import { readSettings } from "../shared/settings-store"
import type { Settings } from "../shared/settings"
import { DICT_TAG } from "./release"

/** The machine translators with a key of their own: the path of each on the mock server and the keys it checks (MACHINE_KEYS of e2e/mock-server.mjs). */
export const MACHINE = [
  { id: "deepl", path: "/deepl", config: { apiKey: "e2e-deepl:fx" } },
  { id: "baidu", path: "/baidu", config: { appId: "e2e-baidu-app", apiKey: "e2e-baidu-key", edition: "standard" as const } },
  { id: "youdao", path: "/youdao", config: { appId: "e2e-youdao-app", apiKey: "e2e-youdao-secret" } },
  { id: "caiyun", path: "/caiyun", config: { apiKey: "e2e-caiyun-token" } },
]

/** The settings of `scenario` over the `stored` settings of the profile; `server` is the address of the mock server. */
export function scenarioSettings(stored: unknown, scenario: string, server: string): Settings {
  const settings = readSettings(stored)
  const offline = scenario.startsWith("welcome") || scenario === "missing"
  settings.sourceLang = scenario === "welcome" ? "en" : "auto"
  settings.targetLang = "zh-CN"
  settings.mode = "bilingual"
  settings.autoTranslate = scenario.startsWith("auto")
  settings.precise.enabled = false
  settings.dictionary.releaseTag = DICT_TAG
  settings.tiers = { dictionary: "dictionary", machine: offline ? "bergamot" : "google-free", ai: offline ? null : "custom" }
  const machine = MACHINE.find((m) => scenario === `machine-${m.id}`)
  if (machine) {
    settings.tiers = { dictionary: null, machine: machine.id, ai: null }
    settings.providers[machine.id] = { enabled: true, baseURL: `${server}${machine.path}`, model: "", ...machine.config }
  }
  settings.providers["google-free"] = { ...settings.providers["google-free"], enabled: true, baseURL: `${server}/google` }
  settings.providers.custom = { enabled: true, apiKey: "e2e-test-key", baseURL: `${server}/v1`, model: "e2e-model" }
  settings.providers.dictionary = { ...settings.providers.dictionary, enabled: true }
  if (offline) settings.providers.bergamot = { ...settings.providers.bergamot, enabled: true }
  // The user allowed Google and the AI service in the consent panel of an earlier message; the "consent" and "subjects" runs start without.
  settings.onlineConsent = scenario === "consent" || scenario === "subjects" ? [] : scenario === "summary" ? ["google-free"] : ["google-free", "custom", ...(machine ? [machine.id] : [])]
  // The earlier runs share the profile: in these runs Google, the AI service and the machine translators have to answer
  // themselves, not the cache. Every other run has the cache on, the "summary" run to answer its second request from it.
  settings.cache.enabled = !(scenario === "missing" || scenario.startsWith("auto") || scenario === "consent" || machine)
  return settings
}
