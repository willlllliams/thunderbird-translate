/**
 * The content scripts connected to the background script, by tab: their
 * Ports, the translation state each tab reports, the badge of the header
 * button that shows whether a tab is translated, and the messages to one
 * tab or to every content script.
 */

import { ext } from "../shared/ext"
import { t } from "../shared/i18n"
import type { MailContext } from "../shared/mail-context"
import { CONTENT_PORT_NAME, IDLE_TAB_STATE, isPortReport, type PortPush, type TabState, type TranslateRequest, type TranslateResponse } from "../shared/messages"
import type { Tier } from "../shared/providers"
import type { PublicSettings } from "../shared/settings"

export interface TabRegistryDeps {
  /** Settles once the settings are read: translations and the first settings of a content script wait for it. */
  ready: () => Promise<void>
  /** The settings a content script gets. */
  publicSettings: () => PublicSettings
  /** Registers the message of a tab for precise translation. */
  setContext: (context: MailContext, bypassCache: boolean) => void
  /** Translates one paragraph and reports each tier. */
  translate: (request: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void) => Promise<void>
}

export interface TabRegistry {
  /** For runtime.onConnect: a content script connected. */
  connect(port: browser.runtime.Port): void
  /** What a tab reported last; IDLE_TAB_STATE for a tab without content script. */
  stateOf(tabId: number): TabState
  /** A message to the content scripts of one tab: toggle or retranslate. */
  postToTab(tabId: number, msg: PortPush): void
  /** A message to every content script. */
  broadcast(msg: PortPush): void
  /** Draws the badge of every connected tab again, e.g. in a new interface language. */
  redrawBadges(): void
}

function safePost(port: browser.runtime.Port, msg: PortPush): void {
  try {
    port.postMessage(msg)
  } catch {
    // The content script went away.
  }
}

export function createTabRegistry({ ready, publicSettings, setContext, translate }: TabRegistryDeps): TabRegistry {
  const ports = new Map<number, Set<browser.runtime.Port>>()
  const tabStates = new Map<number, TabState>()

  async function updateBadge(tabId: number): Promise<void> {
    const active = tabStates.get(tabId)?.active
    try {
      await ext.messageDisplayAction.setBadgeText({ tabId, text: active ? t("badgeOn") : "" })
      if (active) await ext.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#4c8bf5" })
    } catch {
      // Tab already closed.
    }
  }

  function connect(port: browser.runtime.Port): void {
    if (port.name !== CONTENT_PORT_NAME) return
    const tabId = port.sender?.tab?.id
    if (tabId === undefined) return
    if (!ports.has(tabId)) ports.set(tabId, new Set())
    ports.get(tabId)!.add(port)
    tabStates.set(tabId, { ...IDLE_TAB_STATE, connected: true })
    void updateBadge(tabId)

    port.onMessage.addListener((msg) => {
      if (!isPortReport(msg)) return
      switch (msg.type) {
        case "state": {
          const wasActive = tabStates.get(tabId)?.active
          tabStates.set(tabId, { connected: true, ...msg.state })
          // Progress reports come many times a second; the badge only shows whether the tab is translated.
          if (msg.state.active !== wasActive) void updateBadge(tabId)
          break
        }
        case "context":
          setContext(msg.context, msg.bypassCache === true)
          break
        case "translate":
          // A failure of the translation itself, not of a tier (each tier reports its own): the request still ends.
          void ready()
            .then(() => translate(msg.request, (tier, result) => safePost(port, { type: "tier", id: msg.id, tier, result })))
            .catch(() => {})
            .finally(() => safePost(port, { type: "done", id: msg.id }))
          break
      }
    })
    port.onDisconnect.addListener(() => {
      const set = ports.get(tabId)
      set?.delete(port)
      if (!set || set.size === 0) {
        ports.delete(tabId)
        tabStates.delete(tabId)
        void updateBadge(tabId)
      }
    })
    void ready()
      .then(() => safePost(port, { type: "settings", settings: publicSettings() }))
      .catch(() => {})
  }

  return {
    connect,
    stateOf: (tabId) => tabStates.get(tabId) ?? IDLE_TAB_STATE,
    postToTab(tabId, msg) {
      for (const port of ports.get(tabId) ?? []) safePost(port, msg)
    },
    broadcast(msg) {
      for (const set of ports.values()) for (const port of set) safePost(port, msg)
    },
    redrawBadges() {
      for (const tabId of tabStates.keys()) void updateBadge(tabId)
    },
  }
}
