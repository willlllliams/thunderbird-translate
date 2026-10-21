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
 * - "subjects": the three tiers with no online service allowed yet, on a
 *   profile with the local folders "Foreign" and "Second"; the hook shows
 *   "Foreign" in the mail tab and opens the page of translated subjects for
 *   that tab, whose probe (src/e2e/subjects.ts) runs the test.
 * - "machine-deepl", "machine-baidu", "machine-youdao", "machine-caiyun":
 *   one tier, the machine translator with a key of its own, pointed at the
 *   mock server with the keys the server checks (MACHINE_KEYS of
 *   e2e/mock-server.mjs), allowed, the cache off; the probe translates once.
 * - "summary": the three tiers with only Google allowed, the cache on; the
 *   probe asks for the summary with the keyboard command, allows the AI
 *   service in the consent panel, asks again (the cache answers) and
 *   regenerates it.
 * - "image-ask", "image-auto", "image-off", "image-switch": the three tiers
 *   with precise translation on, image translation in the mode of the run
 *   (IMAGE_MODES of scenario-settings.ts) and the message image.eml; the
 *   probe reads the buttons and results under its images, and in
 *   "image-switch" changes the mode ({ e2e: "settings", imageMode }).
 * - "column" (experimental build): the three tiers, allowed, on the same
 *   kind of profile; the hook shows "Foreign" in the mail tab and reads the
 *   column "Translated subject" through the experiment API until the
 *   translations arrive, then reports what the column showed before and
 *   after.
 * Every ready report says whether i18n.getPreferredSystemLanguages() exists.
 */

import { ext } from "../shared/ext"
import { type ImageMode, SETTINGS_KEY } from "../shared/settings"
import { updateSettings } from "../shared/settings-store"
import type { KeyValueStorage } from "../background/cache"
import type { DictionaryManager } from "../offline/dictionary/manager"
import { pairKey } from "../shared/languages"
import { E2E_MARKER, WELCOME_PROBE_PARAM } from "./marker"
import { DICT_TAG } from "./release"
import { scenarioSettings } from "./scenario-settings"
import { WORKER_FILE, type WorkerResponse } from "../offline/bergamot/protocol"

declare const __E2E_SERVER__: string

/** Messages of the e2e content script; they carry no "type", so the regular handler ignores them. */
export type E2eMessage =
  | { e2e: "command"; command: "toggle-translation" | "toggle-display-mode" | "retranslate" | "summarize" }
  | { e2e: "report"; report: unknown }
  | { e2e: "log"; message: string }
  /** Answer: the scenario of the run. */
  | { e2e: "scenario" }
  /** Answer: the muted notices of the settings, after switching to Google without the dictionary or to another mode of image translation when asked. */
  | { e2e: "settings"; useGoogle?: boolean; imageMode?: ImageMode }
  /** A screenshot of the most recent window of a type (experiment e2eCapture), saved by the mock server as <name>.png. */
  | { e2e: "screenshot"; name: string; windowType: string }

async function post(path: string, body: unknown): Promise<void> {
  try {
    await fetch(`${__E2E_SERVER__}${path}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) })
  } catch (error) {
    console.error(`[${E2E_MARKER}] cannot reach the mock server`, error)
  }
}

/** Take a screenshot of the most recent window of `windowType` with the experiment of the test build and hand it to the mock server; a failure goes to the log. */
async function screenshot(name: string, windowType: string): Promise<void> {
  const capture = (browser as unknown as { e2eCapture?: { window(windowType: string): Promise<string> } }).e2eCapture
  try {
    if (!capture) throw new Error("the experiment e2eCapture is missing")
    await post("/screenshot", { name, dataUrl: await capture.window(windowType) })
  } catch (error) {
    await post("/log", { message: `screenshot ${name}: ${error}` })
  }
}

/** Install every pack of the mock server's release through the dictionary manager of the background script. */
async function installDictionary(dictionary: DictionaryManager): Promise<string[]> {
  const { items, error } = await dictionary.list({ tag: DICT_TAG })
  if (error !== undefined) throw error
  for (const pack of items) if (!pack.installed) await dictionary.install(pack.src, pack.tgt, undefined, undefined, { tag: DICT_TAG })
  return items.map((p) => pairKey(p.src, p.tgt))
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

/** The mail APIs the "subjects" scenario uses besides those of the extension. */
interface MailApi {
  mailTabs: {
    query(info: object): Promise<{ id: number }[]>
    update(tabId: number, properties: { displayedFolder: unknown }): Promise<unknown>
    getListedMessages(tabId: number): Promise<{ id: string | null; messages: unknown[] }>
  }
  folders: { query(info: { name: string }): Promise<unknown[]> }
  messages: { abortList(id: string): Promise<void> }
}

/**
 * Show the local folder `name` in the first mail tab and wait until its message list holds `count` messages:
 * Thunderbird reads a new mbox file into its index when the folder is first shown. Resolves with the id of the tab.
 */
async function showFolder(name: string, count: number): Promise<number> {
  const api = browser as unknown as MailApi
  const deadline = Date.now() + 60_000
  /** The result of `call`, or its error with the name of the step. */
  const step = async <T>(what: string, call: () => Promise<T>): Promise<T> => {
    try {
      return await call()
    } catch (error) {
      throw new Error(`${what}: ${error instanceof Error ? error.message : error}`)
    }
  }
  // The main window may still be loading when the background script starts: try again until it answers.
  let last = ""
  for (;;) {
    try {
      const [tab] = await step("mailTabs.query", () => api.mailTabs.query({}))
      const [folder] = await step("folders.query", () => api.folders.query({ name }))
      last = `tab ${tab?.id}, folder ${JSON.stringify(folder)}`
      if (tab && folder) {
        await step("mailTabs.update", () => api.mailTabs.update(tab.id, { displayedFolder: folder }))
        const list = await step("mailTabs.getListedMessages", () => api.mailTabs.getListedMessages(tab.id))
        if (list.id !== null) await api.messages.abortList(list.id)
        last = `${last}, ${list.messages.length} messages`
        if (list.messages.length === count) return tab.id
      }
    } catch (error) {
      last = String(error)
    }
    if (Date.now() > deadline) throw new Error(`the folder ${name} does not list ${count} messages: ${last}`)
    await new Promise((r) => setTimeout(r, 500))
  }
}

/** What the experiment API of the experimental build tells about the column in a mail tab (translated-column/schema.json). */
interface ColumnState {
  registered: boolean
  visible: boolean
  tableView: boolean
  translations: number
  rows: { subject: string; text: string; cell: string | null }[]
}

/**
 * The "column" run: the column in the mail tab `tabId` right away, then once five of the six subjects of the folder
 * show their AI translation in the column and on screen (the sixth is in the target language).
 */
async function watchColumn(tabId: number): Promise<Record<string, unknown>> {
  const api = (browser as unknown as { translatedColumn?: { inspect(tabId: number, rows: number): Promise<ColumnState> } }).translatedColumn
  if (!api) return { error: "the experiment API translatedColumn is missing" }
  const report: Record<string, unknown> = { scenario: "column" }
  try {
    // The background script adds the column once its settings are read, after this hook.
    const start = Date.now()
    do report.first = await api.inspect(tabId, 10)
    while (!(report.first as ColumnState).registered && Date.now() - start < 30_000 && (await new Promise((r) => setTimeout(r, 100))) === undefined)
    const deadline = Date.now() + 60_000
    let state: ColumnState
    for (;;) {
      state = await api.inspect(tabId, 10)
      const done = state.rows.filter((row) => row.text.includes("[AI ") && row.cell === row.text)
      if (done.length >= 5 || Date.now() > deadline) break
      await new Promise((r) => setTimeout(r, 250))
    }
    report.final = state
    report.waitedMs = Date.now() - start
    // The setup guide opened after the installation: the mail tab comes to the front for the screenshot.
    await ext.tabs.update(tabId, { active: true })
    await new Promise((r) => setTimeout(r, 500))
    await screenshot("column", "mail:3pane")
  } catch (error) {
    report.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
  }
  return report
}

/** Remove every installed pack, so that the setup guide has packs to download. */
async function uninstallDictionary(dictionary: DictionaryManager): Promise<void> {
  for (const key of await dictionary.installedKeys()) {
    const [src, tgt] = key.split(">")
    await dictionary.remove(src, tgt)
  }
}

export interface E2eDeps {
  storage: KeyValueStorage
  dictionary: DictionaryManager
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
    if (msg.e2e === "screenshot") return screenshot(msg.name, msg.windowType)
    if (msg.e2e === "settings") {
      return updateSettings((s) => {
        if (msg.imageMode) s.image.mode = msg.imageMode
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
    scenario = await (await fetch(`${__E2E_SERVER__}/scenario`)).text()
    const welcome = scenario.startsWith("welcome")
    const offline = welcome || scenario === "missing"
    const settings = scenarioSettings(scenario, __E2E_SERVER__)
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
    if (scenario === "column") {
      const packs = await installDictionary(dictionary)
      const tabId = await showFolder("Foreign", 6)
      await post("/ready", { scenario, packs, tabId, systemLanguagesApi, version: ext.runtime.getManifest().version, id: ext.runtime.id, name: ext.runtime.getManifest().name })
      // Not awaited: the settings, and with them the column, wait for this hook to end.
      void watchColumn(tabId).then((report) => post("/report", report))
      return
    }
    if (scenario === "subjects") {
      const packs = await installDictionary(dictionary)
      const tabId = await showFolder("Foreign", 6)
      await post("/ready", { scenario, packs, tabId, systemLanguagesApi, version: ext.runtime.getManifest().version })
      // In a window of its own, as "Open in a window" opens it: the mail tab stays the active tab of the main window.
      const url = ext.runtime.getURL(`subjects.html?tab=${tabId}&${WELCOME_PROBE_PARAM}=subjects`)
      ext.windows.create({ type: "popup", url, width: 960, height: 640 }).catch((error) => post("/log", { message: `cannot open the page of translated subjects: ${error}` }))
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
