/** Fake WebExtension API for loading the background script (src/background/index.ts). */
import { vi } from "vitest"
import type { BackgroundRequest } from "../../src/shared/messages"
import { backgroundPort, type BackgroundPort, stubBrowser } from "./browser"
import { packagedFetch } from "./locales"

export { localeText } from "./locales"
export type FakePort = BackgroundPort

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
  const browser = stubBrowser({ stored, tabs, activeTabs, uiLanguage })
  vi.stubGlobal("fetch", packagedFetch(fetchUrl))
  const { api, local, events } = browser
  return {
    api,
    local: local.data,
    /** Connect a content script of `tabId`. */
    connect(tabId: number | undefined, name?: string) {
      const port = backgroundPort(tabId, name)
      events.connect.fire(port)
      return port
    },
    /** runtime.sendMessage from a page; the background's answer. */
    send: (req: BackgroundRequest | unknown) => events.message.listeners[0](req) as Promise<unknown> | undefined,
    command: (name: string, tab?: { id?: number }) => events.command.listeners[0](name, tab) as Promise<void>,
    install: (reason: string) => events.installed.fire({ reason }),
    /** Another page or the content script changes storage. */
    storageChanged: local.onChanged.fire,
  }
}
