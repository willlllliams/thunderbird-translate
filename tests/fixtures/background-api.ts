/** Fake WebExtension API for loading the background script (src/background/index.ts). */
import { vi } from "vitest"
import { readLocaleSources, toMessagesJson } from "../../scripts/locales.mjs"
import { CONTENT_PORT_NAME, type BackgroundRequest, type PortPush, type PortReport } from "../../src/shared/messages"

const localeSources = readLocaleSources()

/** An extension event: listeners are kept so the test can fire it. */
function event<A extends unknown[]>() {
  const listeners: ((...args: A) => unknown)[] = []
  return { addListener: (l: (...args: A) => unknown) => void listeners.push(l), fire: (...args: A) => listeners.map((l) => l(...args)), listeners }
}

/** A content script's Port as the background script sees it. */
function fakePort(tabId: number | undefined, name = CONTENT_PORT_NAME) {
  const onMessage = event<[unknown]>()
  const onDisconnect = event<[]>()
  const posted: PortPush[] = []
  return {
    name,
    sender: tabId === undefined ? {} : { tab: { id: tabId } },
    posted,
    postMessage: (msg: PortPush) => void posted.push(structuredClone(msg)),
    onMessage,
    onDisconnect,
    /** The content script reports something. */
    send: (msg: PortReport) => onMessage.fire(msg),
    disconnect: () => onDisconnect.fire(),
  }
}

export type FakePort = ReturnType<typeof fakePort>

/**
 * Stub `browser` with storage.local holding `stored` (storage changes are
 * announced like in Thunderbird), message display tabs `tabs` and a fetch
 * that serves the packaged locale files; other URLs go to `fetchUrl`.
 */
export function stubBackgroundApi({
  stored = {},
  tabs = [],
  activeTabs = [],
  uiLanguage = "en-US",
  fetchUrl,
}: {
  stored?: Record<string, unknown>
  tabs?: { id?: number; type?: string }[]
  activeTabs?: { id?: number }[]
  uiLanguage?: string
  fetchUrl?: (url: string, init?: RequestInit) => Promise<Response>
} = {}) {
  const local: Record<string, unknown> = structuredClone(stored)
  const storageChanged = event<[Record<string, { oldValue?: unknown; newValue?: unknown }>, string]>()
  const connect = event<[FakePort]>()
  const message = event<[unknown]>()
  const command = event<[string, { id?: number }?]>()
  const installed = event<[{ reason: string }]>()
  const api = {
    runtime: {
      getURL: (p: string) => `moz-extension://test/${p}`,
      onConnect: connect,
      onMessage: message,
      onInstalled: installed,
      /** Messages of the background script to the extension pages. */
      sendMessage: vi.fn(async (_message: unknown) => {}),
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(local[key]) })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {}
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: local[key], newValue: structuredClone(value) }
            local[key] = structuredClone(value)
          }
          storageChanged.fire(changes, "local")
        }),
        remove: vi.fn(async (key: string) => void delete local[key]),
      },
      onChanged: storageChanged,
    },
    tabs: {
      query: vi.fn(async (info: { active?: boolean }) => (info.active ? activeTabs : tabs)),
      create: vi.fn(async () => ({})),
      insertCSS: vi.fn(async (_tabId: number, _details: object) => {}),
      executeScript: vi.fn(async (_tabId: number, _details: object) => []),
    },
    commands: { onCommand: command },
    i18n: { getUILanguage: () => uiLanguage },
    messageDisplayAction: {
      setTitle: vi.fn(async (_details: { title: string }) => {}),
      setBadgeText: vi.fn(async (_details: { tabId: number; text: string }) => {}),
      setBadgeBackgroundColor: vi.fn(async (_details: { tabId: number; color: string }) => {}),
    },
    messageDisplayScripts: { register: vi.fn(async (_options: object) => ({ unregister: async () => {} })) },
  }
  vi.stubGlobal("browser", api)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const locale = url.startsWith("moz-extension://") ? localeSources[url.split("/").at(-2)!] : undefined
      if (locale) return new Response(JSON.stringify(toMessagesJson(locale)))
      if (fetchUrl) return fetchUrl(url, init)
      throw new TypeError("NetworkError when attempting to fetch resource.")
    }),
  )
  return {
    api,
    local,
    /** Connect a content script of `tabId`. */
    connect(tabId: number | undefined, name?: string) {
      const port = fakePort(tabId, name)
      connect.fire(port)
      return port
    },
    /** runtime.sendMessage from a page; the background's answer. */
    send: (req: BackgroundRequest | unknown) => message.listeners[0](req) as Promise<unknown> | undefined,
    command: (name: string, tab?: { id?: number }) => command.listeners[0](name, tab) as Promise<void>,
    install: (reason: string) => installed.fire({ reason }),
    /** Another page or the content script changes storage. */
    storageChanged: storageChanged.fire,
  }
}

/** The text of `key` in `locale`'s locales/<locale>.json. */
export const localeText = (locale: string, key: string): string => localeSources[locale][key]
