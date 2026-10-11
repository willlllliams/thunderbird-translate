/**
 * End-to-end test hooks of the background script, compiled only into the
 * e2e build (scripts/build.mjs --e2e <server>; __E2E__ is false in every
 * other build, so esbuild drops this module).
 *
 * Before the background script reads its settings, the hook stores settings
 * whose three tiers point at the local mock server of e2e/ (dictionary,
 * Google, an OpenAI-compatible AI service) and installs the dictionary pack
 * the server publishes. Afterwards it runs the keyboard commands the content
 * script asks for and forwards the content script's report to the server.
 */

import { ext } from "../shared/ext"
import { SETTINGS_KEY } from "../shared/settings"
import { readSettings } from "../shared/settings-store"
import type { KeyValueStorage } from "../background/cache"
import { fetchDictionaryIndex, installPack, releaseUrl } from "../background/dictionary/download"
import { DictionaryStore } from "../background/dictionary/store"
import { pairKey } from "../shared/languages"
import { E2E_MARKER } from "./marker"
import { WORKER_FILE, type WorkerResponse } from "../offline/bergamot/protocol"

declare const __E2E_SERVER__: string

/** Messages of the e2e content script; they carry no "type", so the regular handler ignores them. */
export type E2eMessage =
  | { e2e: "command"; command: "toggle-translation" | "toggle-display-mode" }
  | { e2e: "report"; report: unknown }
  | { e2e: "log"; message: string }

const DICT_TAG = "e2e"

async function post(path: string, body: unknown): Promise<void> {
  try {
    await fetch(`${__E2E_SERVER__}${path}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) })
  } catch (error) {
    console.error(`[${E2E_MARKER}] cannot reach the mock server`, error)
  }
}

/** GitHub release URLs of the dictionary packs, answered by the mock server. */
const releaseFetch: typeof fetch = (input, init) => {
  const url = String(input).replace(releaseUrl(DICT_TAG, ""), `${__E2E_SERVER__}/releases/`)
  return fetch(url, init)
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

export interface E2eDeps {
  storage: KeyValueStorage
  dictionary: { invalidate(): void }
  runCommand: (command: string, tab?: browser.tabs.Tab) => Promise<void>
}

/** Store the test settings and install the dictionary; never rejects, failures go to the server. */
export async function setUpE2e({ storage, dictionary, runCommand }: E2eDeps): Promise<void> {
  ext.runtime.onMessage.addListener((raw: unknown, sender: browser.runtime.MessageSender) => {
    const msg = raw as E2eMessage
    if (!msg || typeof msg !== "object" || !("e2e" in msg)) return undefined
    // The mark separates the requests before and after the command in the server's log.
    if (msg.e2e === "command") return post("/mark", { command: msg.command }).then(() => runCommand(msg.command, sender.tab))
    if (msg.e2e === "report") return post("/report", { ...(msg.report as object), userAgent: navigator.userAgent })
    return post("/log", { message: msg.message })
  })
  try {
    const settings = readSettings(await storage.get(SETTINGS_KEY))
    settings.sourceLang = "auto"
    settings.targetLang = "zh-CN"
    settings.mode = "bilingual"
    settings.autoTranslate = false
    settings.precise.enabled = false
    settings.tiers = { dictionary: "dictionary", machine: "google-free", ai: "custom" }
    settings.providers["google-free"] = { ...settings.providers["google-free"], enabled: true, baseURL: `${__E2E_SERVER__}/google` }
    settings.providers.custom = { enabled: true, apiKey: "e2e-test-key", baseURL: `${__E2E_SERVER__}/v1`, model: "e2e-model" }
    settings.providers.dictionary = { ...settings.providers.dictionary, enabled: true }
    await storage.set(SETTINGS_KEY, settings)
    const packs = await installDictionary(dictionary)
    const bergamotWorker = await probeBergamotWorker()
    await post("/ready", { packs, bergamotWorker, version: ext.runtime.getManifest().version })
    // Diagnostics for the run log: the tabs a content script could run in.
    setTimeout(async () => {
      const tabs = await ext.tabs.query({})
      await post("/log", { message: `tabs: ${JSON.stringify(tabs.map((t) => ({ id: t.id, type: (t as { type?: string }).type, url: t.url, status: t.status })))}` })
    }, 5000)
  } catch (error) {
    await post("/ready", { error: error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error) })
  }
}
