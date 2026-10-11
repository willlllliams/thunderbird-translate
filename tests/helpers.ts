/** Test doubles shared by the test files. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { vi } from "vitest"
import { readLocaleSources, toMessagesJson } from "../scripts/locales.mjs"
import { type KeyValueStorage, PersistentCache } from "../src/background/cache"
import { type ServiceDeps, TranslationService } from "../src/background/service"
import type { BackgroundRequest, TranslateRequest, TranslateResponse } from "../src/shared/messages"
import { getPreset, tierOf } from "../src/shared/providers"
import type { Settings } from "../src/shared/settings"

/** Hex SHA-256, as in dict-index.json and the Bergamot model records. */
export const sha256Hex = (data: Uint8Array) => createHash("sha256").update(data).digest("hex")

/** A vi.fn() or any other stand-in used as fetch. */
export const asFetch = (f: unknown) => f as typeof fetch

/** JSON response; a string body is sent as it is. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** Chat Completions answer (OpenAI and compatible APIs). */
export const chatCompletion = (content: string) =>
  jsonResponse({
    id: "c1",
    object: "chat.completion",
    created: 1,
    model: "m",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })

/** Anthropic Messages answer. */
export const anthropicMessage = (text: string) =>
  jsonResponse({ id: "msg_1", type: "message", role: "assistant", model: "m", content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })

/** storage.local stand-in; `data` shows what was written. */
export function memoryStorage(): KeyValueStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async (k) => data.get(k),
    set: async (k, v) => void data.set(k, structuredClone(v)),
    remove: async (k) => void data.delete(k),
  }
}

/** Dictionary stand-in that answers D(<text>), once `gate` resolves. */
export function fakeDictionary(gate?: Promise<void>) {
  return {
    translate: vi.fn(async (texts: string[], _source: string, _target: string) => {
      await gate
      return texts.map((t): PromiseSettledResult<string> => ({ status: "fulfilled", value: `D(${t})` }))
    }),
    signature: vi.fn(async () => "packs"),
  }
}

const serviceSettings = new WeakMap<TranslationService, Settings>()

/** Translation service over `settings`: 5 ms batch window, in-memory cache, retries without waiting. */
export function createService(settings: Settings, deps: Partial<ServiceDeps> = {}) {
  settings.batch.batchDelayMs = 5
  const cache = deps.cache ?? new PersistentCache(memoryStorage(), 100, 10)
  const service = new TranslationService({ getSettings: () => settings, sleep: async () => {}, ...deps, cache })
  serviceSettings.set(service, settings)
  return { settings, service, cache }
}

/** One paragraph for one service: `providerId` becomes the service of its tier. */
export interface OneRequest extends Partial<Omit<TranslateRequest, "tiers">> {
  text: string
  providerId: string
}

/**
 * Translate one paragraph the way the page does (translateForPage), asking
 * only the tier of `providerId`. Resolves with the translation, rejects with
 * the error text the page would show.
 */
export async function translateOne(service: TranslationService, { providerId, ...req }: OneRequest): Promise<string> {
  const settings = serviceSettings.get(service)!
  const tier = tierOf(getPreset(providerId)!)
  settings.tiers[tier] = providerId
  let result: TranslateResponse | undefined
  await service.translateForPage({ sourceLang: "auto", targetLang: "zh-CN", ...req, tiers: [tier] }, (_tier, r) => (result = r))
  if (!result?.ok) throw new Error(result?.error)
  return result.text
}

const localeSources = readLocaleSources()

/**
 * Load the popup, the settings page or the welcome page and run its script
 * with a fake extension API holding `settings` (and `stored`, other
 * storage.local keys). `respond` answers background requests; cacheStats
 * reports an empty cache.
 */
export async function openPage(
  page: "popup" | "options" | "welcome",
  settings: Settings,
  {
    uiLanguage = "en-US",
    respond,
    fetchUrl,
    connect,
    stored: other = {},
    activeTab,
    currentTab = { id: 7 },
  }: {
    uiLanguage?: string
    respond?: (req: BackgroundRequest) => unknown
    /** runtime.connect(), for the content script's Port. */
    connect?: (info: { name: string }) => unknown
    stored?: Record<string, unknown>
    /** Answers fetch() for URLs other than the packaged messages, e.g. the dictionary index; a failed request otherwise. */
    fetchUrl?: (url: string) => Promise<Response>
    /** The tab that tabs.query() reports as active (the popup's message tab); none by default. */
    activeTab?: { id?: number }
    /** What tabs.getCurrent() reports, e.g. {} for a page without a tab id. */
    currentTab?: { id?: number }
  } = {},
) {
  const html = readFileSync(join(__dirname, "..", "static", `${page}.html`), "utf8")
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML
  let stored = structuredClone(settings)
  const local: Record<string, unknown> = structuredClone(other)
  const created: string[] = []
  const removed: number[] = []
  const listeners: ((changes: object, area: string) => void)[] = []
  const notify = () => listeners.forEach((l) => l({ settings: { newValue: structuredClone(stored) } }, "local"))
  const sendMessage = vi.fn(async (req: BackgroundRequest) => respond?.(req) ?? (req.type === "cacheStats" ? { size: 0 } : undefined))
  const openOptionsPage = vi.fn()
  const close = vi.fn()
  vi.stubGlobal("browser", {
    runtime: { sendMessage, getURL: (path: string) => `moz-extension://test/${path}`, openOptionsPage, connect },
    tabs: {
      query: async () => (activeTab ? [activeTab] : []),
      create: vi.fn(async ({ url }: { url: string }) => void created.push(url)),
      getCurrent: async () => currentTab,
      remove: async (id: number) => void removed.push(id),
    },
    storage: {
      local: {
        get: async (key: string) => (key === "settings" ? { settings: structuredClone(stored) } : { [key]: structuredClone(local[key]) }),
        set: async (v: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(v)) {
            if (key !== "settings") local[key] = structuredClone(value)
          }
          if (!("settings" in v)) return
          stored = structuredClone(v.settings as Settings)
          notify()
        },
      },
      onChanged: { addListener: (l: (changes: object, area: string) => void) => void listeners.push(l) },
    },
    i18n: { getUILanguage: () => uiLanguage },
  })
  vi.stubGlobal("close", close)
  // _locales/<locale>/messages.json packaged with the extension.
  vi.stubGlobal("fetch", async (url: string) => {
    const locale = localeSources[url.split("/").at(-2)!]
    if (locale) return new Response(JSON.stringify(toMessagesJson(locale)))
    if (fetchUrl) return fetchUrl(url)
    throw new TypeError("NetworkError when attempting to fetch resource.")
  })
  const modules = { popup: () => import("../src/popup/index"), options: () => import("../src/options/index"), welcome: () => import("../src/welcome/index") }
  // Modules that the test file imported before the stub (shared/ext.ts reads the global once) are loaded again over it.
  vi.resetModules()
  await modules[page]()
  return {
    created,
    removed,
    sendMessage,
    /** runtime.openOptionsPage() and window.close(). */
    openOptionsPage,
    close,
    stored: () => stored,
    /** Other storage.local keys, e.g. the welcome page's state. */
    local: (key: string) => local[key],
    /** Another page writes settings. `announce` = false: the storage change event has not reached this page yet. */
    external(change: (s: Settings) => void, announce = true) {
      change(stored)
      if (announce) notify()
    },
    /** A raw storage change event, e.g. of another storage area. */
    emitChange(changes: object, area: string) {
      listeners.forEach((l) => l(changes, area))
    },
  }
}
