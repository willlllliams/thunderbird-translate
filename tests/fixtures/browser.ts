/** The WebExtension API (`browser`) of Thunderbird as the background script, the extension pages and the content script see it. */
import { vi } from "vitest"
import { type BackgroundRequest, CONTENT_PORT_NAME, type PortPush, type PortReport } from "../../src/shared/messages"
import { fakeEvent } from "./events"
import { fakeStorageArea, type StorageAreaOptions, type StorageChanges } from "./storage"

/** A content script's Port as the background script sees it: `send` delivers a report of the content script, `posted` lists what the background pushed. */
export function backgroundPort(tabId: number | undefined, name = CONTENT_PORT_NAME) {
  const onMessage = fakeEvent<[unknown]>()
  const onDisconnect = fakeEvent<[]>()
  const posted: PortPush[] = []
  return {
    name,
    sender: tabId === undefined ? {} : { tab: { id: tabId } },
    posted,
    // A Port copies what it carries.
    postMessage: (msg: PortPush) => void posted.push(structuredClone(msg)),
    onMessage,
    onDisconnect,
    send: (msg: PortReport) => onMessage.fire(msg),
    disconnect: () => onDisconnect.fire(),
  }
}

export type BackgroundPort = ReturnType<typeof backgroundPort>

/** The Port of a content script or page as it sees it: `push` delivers a message of the background script, `posted` lists what the page reported. */
export function pagePort() {
  const onMessage = fakeEvent<[unknown]>()
  const onDisconnect = fakeEvent<[]>()
  const postMessage = vi.fn((_msg: PortReport) => {})
  return {
    postMessage,
    onMessage,
    onDisconnect,
    push: (msg: PortPush) => onMessage.fire(msg),
    disconnect: () => onDisconnect.fire(),
    posted: <T extends PortReport["type"]>(type: T) =>
      postMessage.mock.calls.map(([msg]) => msg).filter((msg): msg is Extract<PortReport, { type: T }> => msg.type === type),
  }
}

export interface FakeBrowserOptions {
  /** storage.local at the start. */
  stored?: Record<string, unknown>
  storage?: Omit<StorageAreaOptions, "onChanged" | "areaName">
  /** i18n.getUILanguage(). */
  uiLanguage?: string
  /** i18n.getPreferredSystemLanguages(); absent with null, as in older Thunderbird versions. */
  systemLanguages?: string[] | null
  /** Answer of runtime.sendMessage(). */
  respond?: (req: BackgroundRequest) => unknown
  /** runtime.connect(); absent without it. */
  connect?: (info: { name: string }) => unknown
  /** What tabs.query() reports; with { active: true }, `activeTabs`. */
  tabs?: { id?: number; type?: string }[]
  activeTabs?: { id?: number }[]
  /** What tabs.getCurrent() reports. */
  currentTab?: { id?: number }
}

export function fakeBrowser({
  stored = {},
  storage = {},
  uiLanguage = "en-US",
  systemLanguages = null,
  respond,
  connect,
  tabs = [],
  activeTabs = [],
  currentTab = { id: 7 },
}: FakeBrowserOptions = {}) {
  const storageChanged = fakeEvent<[StorageChanges, string]>()
  const local = fakeStorageArea(stored, { ...storage, onChanged: storageChanged })
  const events = {
    connect: fakeEvent<[unknown]>(),
    /** runtime.onMessage: the message and its sender. */
    message: fakeEvent<[unknown, unknown?]>(),
    installed: fakeEvent<[{ reason: string }]>(),
    command: fakeEvent<[string, { id?: number }?]>(),
  }
  /** URLs of the tabs opened with tabs.create() and ids of those closed with tabs.remove(). */
  const created: string[] = []
  const removed: number[] = []
  const api = {
    runtime: {
      getURL: (path: string) => `moz-extension://test/${path}`,
      sendMessage: vi.fn(async (req: BackgroundRequest) => respond?.(req)),
      openOptionsPage: vi.fn(),
      ...(connect ? { connect } : {}),
      onConnect: events.connect,
      onMessage: events.message,
      onInstalled: events.installed,
    },
    storage: { local: { get: local.get, set: local.set, remove: local.remove }, onChanged: storageChanged },
    tabs: {
      query: vi.fn(async (info: { active?: boolean } = {}) => (info.active ? activeTabs : tabs)),
      create: vi.fn(async ({ url }: { url: string }) => {
        created.push(url)
        return {}
      }),
      getCurrent: async () => currentTab,
      remove: vi.fn(async (id: number) => void removed.push(id)),
      insertCSS: vi.fn(async (_tabId: number, _details: object) => {}),
      executeScript: vi.fn(async (_tabId: number, _details: object) => []),
    },
    commands: { onCommand: events.command },
    i18n: { getUILanguage: () => uiLanguage, ...(systemLanguages ? { getPreferredSystemLanguages: async () => systemLanguages } : {}) },
    messageDisplayAction: {
      setTitle: vi.fn(async (_details: { title: string }) => {}),
      setBadgeText: vi.fn(async (_details: { tabId: number; text: string }) => {}),
      setBadgeBackgroundColor: vi.fn(async (_details: { tabId: number; color: string }) => {}),
    },
    messageDisplayScripts: { register: vi.fn(async (_options: object) => ({ unregister: async () => {} })) },
  }
  return { api, local, events, created, removed }
}

export type FakeBrowser = ReturnType<typeof fakeBrowser>

/** fakeBrowser() as the global `browser`, which shared/ext.ts reads at every call. */
export function stubBrowser(options: FakeBrowserOptions = {}): FakeBrowser {
  const browser = fakeBrowser(options)
  vi.stubGlobal("browser", browser.api)
  return browser
}

/** Turns of the event loop that work left by a test gets to end in; an IndexedDB request takes one turn. */
export const SETTLE_TURNS = 50

/** Let work that waits for no timer end: promise chains and IndexedDB requests. */
export async function settle(turns = SETTLE_TURNS): Promise<void> {
  for (let turn = 0; turn < turns; turn++) await new Promise<void>((resolve) => setImmediate(resolve))
}
