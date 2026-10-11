/** Test doubles shared by the test files. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { vi } from "vitest"
import { readLocaleSources, toMessagesJson } from "../scripts/locales.mjs"
import { type KeyValueStorage, PersistentCache } from "../src/background/cache"
import { type ServiceDeps, TranslationService } from "../src/background/service"
import type { BackgroundRequest } from "../src/shared/messages"
import type { Settings } from "../src/shared/settings"

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

/** Translation service over `settings`: 5 ms batch window, in-memory cache, retries without waiting. */
export function createService(settings: Settings, deps: Partial<ServiceDeps> = {}) {
  settings.batch.batchDelayMs = 5
  const cache = deps.cache ?? new PersistentCache(memoryStorage(), 100, 10)
  const service = new TranslationService({ getSettings: () => settings, sleep: async () => {}, ...deps, cache })
  return { settings, service, cache }
}

const localeSources = readLocaleSources()

/**
 * Load the popup or the settings page and run its script with a fake
 * extension API holding `settings`. `respond` answers background requests;
 * cacheStats reports an empty cache.
 */
export async function openPage(
  page: "popup" | "options",
  settings: Settings,
  {
    uiLanguage = "en-US",
    respond,
    fetchUrl,
  }: {
    uiLanguage?: string
    respond?: (req: BackgroundRequest) => unknown
    /** Answers fetch() for URLs other than the packaged messages, e.g. the dictionary index; a failed request otherwise. */
    fetchUrl?: (url: string) => Promise<Response>
  } = {},
) {
  const html = readFileSync(join(__dirname, "..", "static", `${page}.html`), "utf8")
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML
  let stored = structuredClone(settings)
  const created: string[] = []
  const listeners: ((changes: object, area: string) => void)[] = []
  const notify = () => listeners.forEach((l) => l({ settings: { newValue: structuredClone(stored) } }, "local"))
  const sendMessage = vi.fn(async (req: BackgroundRequest) => respond?.(req) ?? (req.type === "cacheStats" ? { size: 0 } : undefined))
  vi.stubGlobal("browser", {
    runtime: { sendMessage, getURL: (path: string) => `moz-extension://test/${path}`, openOptionsPage: vi.fn() },
    tabs: { query: async () => [], create: vi.fn(async ({ url }: { url: string }) => void created.push(url)) },
    storage: {
      local: {
        get: async () => ({ settings: structuredClone(stored) }),
        set: async (v: { settings: Settings }) => {
          stored = structuredClone(v.settings)
          notify()
        },
      },
      onChanged: { addListener: (l: (changes: object, area: string) => void) => void listeners.push(l) },
    },
    i18n: { getUILanguage: () => uiLanguage },
  })
  vi.stubGlobal("close", () => {})
  // _locales/<locale>/messages.json packaged with the extension.
  vi.stubGlobal("fetch", async (url: string) => {
    const locale = localeSources[url.split("/").at(-2)!]
    if (locale) return new Response(JSON.stringify(toMessagesJson(locale)))
    if (fetchUrl) return fetchUrl(url)
    throw new TypeError("NetworkError when attempting to fetch resource.")
  })
  await (page === "popup" ? import("../src/popup/index") : import("../src/options/index"))
  return {
    created,
    sendMessage,
    stored: () => stored,
    /** Another page writes settings. `announce` = false: the storage change event has not reached this page yet. */
    external(change: (s: Settings) => void, announce = true) {
      change(stored)
      if (announce) notify()
    },
  }
}
