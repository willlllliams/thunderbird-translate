/**
 * The settings of an e2e run (src/e2e/background.ts): the defaults with what
 * the scenario of the run needs. The runs of one variant share a profile, so
 * a run never starts from the settings an earlier run left (a muted notice, a
 * length limit, the cache switch): each one fails or passes on its own, the
 * same in the whole sequence as alone with E2E_ONLY.
 */

import { readSettings } from "../shared/settings-store"
import { consentEntry, defaultImageSettings, type ImageMode, type Settings } from "../shared/settings"
import { DICT_TAG } from "./release"

/** The machine translators with a key of their own: the path of each on the mock server and the keys it checks (MACHINE_KEYS of e2e/mock-server.mjs). */
export const MACHINE = [
  { id: "deepl", path: "/deepl", config: { apiKey: "e2e-deepl:fx" } },
  { id: "baidu", path: "/baidu", config: { appId: "e2e-baidu-app", apiKey: "e2e-baidu-key", edition: "standard" as const } },
  { id: "youdao", path: "/youdao", config: { appId: "e2e-youdao-app", apiKey: "e2e-youdao-secret" } },
  { id: "caiyun", path: "/caiyun", config: { apiKey: "e2e-caiyun-token" } },
]

/**
 * The mode of image translation of each image run: "image-ask" clicks a button, allows the service in the panel and
 * reads the result again from the cache; "image-auto" sends the first image by itself and leaves the button under the
 * second; "image-off" shows nothing; "image-switch" changes the mode while the message is translated; "image-remote" sends
 * the remote image Thunderbird shows by itself and counts the one that did not load.
 */
export const IMAGE_MODES: Partial<Record<string, ImageMode>> = { "image-ask": "ask", "image-auto": "auto", "image-off": "off", "image-switch": "ask", "image-remote": "auto" }

/** The settings of `scenario`; `server` is the address of the mock server. */
export function scenarioSettings(scenario: string, server: string): Settings {
  const settings = readSettings(undefined)
  const offline = scenario.startsWith("welcome") || scenario === "missing"
  settings.sourceLang = scenario === "welcome" ? "en" : "auto"
  settings.targetLang = "zh-CN"
  settings.mode = "bilingual"
  settings.autoTranslate = scenario.startsWith("auto")
  // The image runs: precise translation with the AI service of the mock server, in the mode of the run.
  const image = IMAGE_MODES[scenario]
  settings.precise.enabled = image !== undefined
  settings.image = { ...defaultImageSettings(), mode: image ?? "ask", maxPerMessage: scenario === "image-auto" ? 1 : 5 }
  // The "image-ask" run asks before the first image; the others have the AI service allowed for images already.
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
  // The user allowed Google and the AI service in the consent panel of an earlier message; the "consent" run starts without.
  const allowed = scenario === "consent" ? [] : scenario === "summary" ? ["google-free"] : ["google-free", "custom", ...(machine ? [machine.id] : [])]
  settings.onlineConsent = allowed.map((id) => consentEntry(settings, id))
  // The "image-ask" run asks before the first image; the others have the AI service allowed for images already.
  settings.imageConsent = image && scenario !== "image-ask" ? [consentEntry(settings, "custom")] : []
  // The earlier runs share the profile and its cache: in these runs Google, the AI service and the machine translators
  // have to answer themselves, not the cache. Every other run has the cache on, the "summary" run to answer its second
  // request from it.
  settings.cache.enabled = !(scenario === "missing" || scenario.startsWith("auto") || scenario === "consent" || machine || scenario === "image-auto" || scenario === "image-switch" || scenario === "image-remote")
  return settings
}
