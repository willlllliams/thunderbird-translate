/**
 * End-to-end test hook of the background script, compiled only into the e2e
 * build (scripts/build.mjs --e2e <server> puts src/e2e/hooks/ in place of
 * src/hooks/; src/e2e/hooks/background.ts hands setUpE2e() over).
 *
 * Before the background script reads its settings, the hook stores settings
 * whose three tiers point at the local mock server of e2e/ (dictionary,
 * Google, an OpenAI-compatible AI service) and installs the dictionary pack
 * the server publishes. Afterwards it runs the keyboard commands the content
 * script asks for and forwards the content script's report to the server.
 *
 * The scenario comes from GET /scenario:
 * - "message": the settings above; the content script's probe translates.
 * - "auto", "auto-skip": the same with automatic translation on and the
 *   cache off; the probe only watches automatic translation, which
 *   translates every paragraph of the English message ("auto") and nothing
 *   of a message in the target language ("auto-skip").
 * - "welcome", "welcome-auto": the two offline services (source language
 *   English, or detected automatically), every dictionary pack uninstalled,
 *   and the setup guide opened; its probe (src/e2e/welcome.ts) downloads.
 * - "missing": the two offline services without any pack or model, so the
 *   content script's probe sees the notice about missing data; it can switch
 *   to Google without the dictionary ({ e2e: "settings", useGoogle }).
 * Every ready report says whether i18n.getPreferredSystemLanguages() exists.
 */

import { ext } from "../shared/ext"
import { SETTINGS_KEY } from "../shared/settings"
import { readSettings, updateSettings } from "../shared/settings-store"
import type { KeyValueStorage } from "../background/cache"
import { fetchDictionaryIndex, installPack } from "../offline/dictionary/download"
import { DictionaryStore } from "../offline/dictionary/store"
import { pairKey } from "../shared/languages"
import { E2E_MARKER, WELCOME_PROBE_PARAM } from "./marker"
import { DICT_TAG, releaseFetch } from "./release"
import { WORKER_FILE, type WorkerResponse } from "../offline/bergamot/protocol"

declare const __E2E_SERVER__: string

/** Messages of the e2e content script; they carry no "type", so the regular handler ignores them. */
export type E2eMessage =
  | { e2e: "command"; command: "toggle-translation" | "toggle-display-mode" | "retranslate" }
  | { e2e: "report"; report: unknown }
  | { e2e: "log"; message: string }
  /** Answer: the scenario of the run. */
  | { e2e: "scenario" }
  /** Answer: the muted notices of the settings, after switching to Google without the dictionary when asked. */
  | { e2e: "settings"; useGoogle?: boolean }

async function post(path: string, body: unknown): Promise<void> {
  try {
    await fetch(`${__E2E_SERVER__}${path}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) })
  } catch (error) {
    console.error(`[${E2E_MARKER}] cannot reach the mock server`, error)
  }
}

async function installDictionary(dictionary: { invalidate(): void }): Promise<string[]> {
  const store = new DictionaryStore()
  const installed = new Set((await store.list()).map((p) => p.id))
  const packs = await fetchDictionaryIndex(DICT_TAG, releaseFetch)
  for (const pack of packs) {
    if (!installed.has(pairKey(pack.src, pack.tgt))) await installPack(pack, DICT_TAG, store, { fetchFn: releaseFetch })
  }
  dictionary.invalidate()
  return packs.map((p) => pairKey(p.src, p.tgt))
}

/**
 * Start the real Bergamot worker and ask it to load a direction without model
 * files. The worker has to load the glue script and the wasm (CSP, zstd,
 * instantiation) before it can reject the empty model, so the expected answer
 * is "no model file"; any other answer is a failure of the engine itself.
 */
function probeBergamotWorker(): Promise<string> {
  return new Promise((resolve) => {
    const worker = new Worker(ext.runtime.getURL(WORKER_FILE))
    const timer = setTimeout(() => finish("no answer from the worker within 60 s"), 60_000)
    const finish = (answer: string) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(answer)
    }
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => finish(data.ok ? "loaded" : data.error)
    worker.onerror = (event) => finish(`worker error: ${event.message}`)
    worker.postMessage({ id: 1, type: "load", key: "e2e", src: "en", tgt: "zh-Hans", files: [] })
  })
}

/** Empty the dictionary store, so that the setup guide has packs to download. */
async function uninstallDictionary(dictionary: { invalidate(): void }): Promise<void> {
  const store = new DictionaryStore()
  for (const pack of await store.list()) await store.remove(pack.id)
  dictionary.invalidate()
}

export interface E2eDeps {
  storage: KeyValueStorage
  dictionary: { invalidate(): void }
  runCommand: (command: string, tab?: browser.tabs.Tab) => Promise<void>
}

/** Store the test settings and install the dictionary; never rejects, failures go to the server. */
export async function setUpE2e({ storage, dictionary, runCommand }: E2eDeps): Promise<void> {
  let scenario = ""
  ext.runtime.onMessage.addListener((raw: unknown, sender: browser.runtime.MessageSender) => {
    const msg = raw as E2eMessage
    if (!msg || typeof msg !== "object" || !("e2e" in msg)) return undefined
    // The mark separates the requests before and after the command in the server's log.
    if (msg.e2e === "command") return post("/mark", { command: msg.command }).then(() => runCommand(msg.command, sender.tab))
    if (msg.e2e === "report") return post("/report", { ...(msg.report as object), userAgent: navigator.userAgent })
    if (msg.e2e === "scenario") return Promise.resolve(scenario)
    if (msg.e2e === "settings") {
      return updateSettings((s) => {
        if (!msg.useGoogle) return
        s.tiers = { dictionary: null, machine: "google-free", ai: null }
        s.offlineMutedPairs = []
      }).then((s) => s.offlineMutedPairs)
    }
    return post("/log", { message: msg.message })
  })
  const i18n = ext.i18n as typeof ext.i18n & { getPreferredSystemLanguages?: () => Promise<string[]> }
  const systemLanguagesApi = typeof i18n.getPreferredSystemLanguages === "function"
  try {
    const settings = readSettings(await storage.get(SETTINGS_KEY))
    scenario = await (await fetch(`${__E2E_SERVER__}/scenario`)).text()
    const welcome = scenario.startsWith("welcome")
    const offline = welcome || scenario === "missing"
    settings.sourceLang = scenario === "welcome" ? "en" : "auto"
    settings.targetLang = "zh-CN"
    settings.mode = "bilingual"
    settings.autoTranslate = scenario.startsWith("auto")
    settings.precise.enabled = false
    settings.dictionary.releaseTag = DICT_TAG
    settings.tiers = { dictionary: "dictionary", machine: offline ? "bergamot" : "google-free", ai: offline ? null : "custom" }
    settings.providers["google-free"] = { ...settings.providers["google-free"], enabled: true, baseURL: `${__E2E_SERVER__}/google` }
    settings.providers.custom = { enabled: true, apiKey: "e2e-test-key", baseURL: `${__E2E_SERVER__}/v1`, model: "e2e-model" }
    settings.providers.dictionary = { ...settings.providers.dictionary, enabled: true }
    if (offline) settings.providers.bergamot = { ...settings.providers.bergamot, enabled: true }
    // The earlier runs share the profile: Google and the AI service have to answer this run themselves, not the cache.
    if (scenario === "missing" || scenario.startsWith("auto")) settings.cache.enabled = false
    await storage.set(SETTINGS_KEY, settings)
    if (offline) await uninstallDictionary(dictionary)
    if (welcome) {
      await post("/ready", { scenario, systemLanguagesApi, version: ext.runtime.getManifest().version })
      // Not awaited: the page needs this script to finish its set-up.
      const url = ext.runtime.getURL(`welcome.html?${WELCOME_PROBE_PARAM}=${scenario}`)
      ext.tabs.create({ url }).catch((error) => post("/log", { message: `cannot open the setup guide: ${error}` }))
      return
    }
    if (offline) {
      await post("/ready", { scenario, systemLanguagesApi, version: ext.runtime.getManifest().version })
      return
    }
    const packs = await installDictionary(dictionary)
    const bergamotWorker = await probeBergamotWorker()
    await post("/ready", { scenario, packs, bergamotWorker, systemLanguagesApi, version: ext.runtime.getManifest().version })
    // Diagnostics for the run log: the tabs a content script could run in.
    setTimeout(async () => {
      const tabs = await ext.tabs.query({})
      await post("/log", { message: `tabs: ${JSON.stringify(tabs.map((t) => ({ id: t.id, type: (t as { type?: string }).type, url: t.url, status: t.status })))}` })
    }, 5000)
  } catch (error) {
    await post("/ready", { error: error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error) })
  }
}
