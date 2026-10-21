/**
 * The content scripts connected to the background script, by tab: their
 * Ports, the translation state each tab reports, the badge of the header
 * button that shows whether a tab is translated, and the messages to one
 * tab or to every content script. Each content script is a session of its
 * own for the translation of images (background/images.ts), opened when it
 * connects and forgotten when it goes away.
 */

import { ext } from "../shared/ext"
import { t } from "../shared/i18n"
import type { MailContext } from "../shared/mail-context"
import { CONTENT_PORT_NAME, IDLE_TAB_STATE, type ImageRequest, type ImageResponse, isPortReport, type PortPush, type PortReport, type TabState, type TranslateRequest, type TranslateResponse } from "../shared/messages"
import type { Tier } from "../shared/providers"
import type { PublicSettings } from "../shared/settings"
import type { SummaryResponse } from "../shared/summary"

export interface TabRegistryDeps {
  /** Settles once the settings are read: translations and the first settings of a content script wait for it. */
  ready: () => Promise<void>
  /** The settings a content script gets. */
  publicSettings: () => PublicSettings
  /** Registers the message of a tab for precise translation. */
  setContext: (context: MailContext, bypassCache: boolean) => void
  /**
   * Translates one paragraph and reports each tier; `sample`: the request comes from a page of the extension (the trial
   * of the setup guide), not from a message; `signal` aborts once its Port went away, so nothing more is sent for it.
   */
  translate: (request: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void, options: { sample: boolean; signal: AbortSignal }) => Promise<void>
  /** The summary of the message displayed in a tab, of its text; `fresh`: past the cache. */
  summarize: (text: string, tabId: number, fresh: boolean) => Promise<SummaryResponse>
  /** A content script connected in a tab: the session of its images. */
  openSession?: (session: string, tabId: number) => void
  /** An image of the message displayed in a tab, for the content script `session`; without it every image request fails. */
  image?: (session: string, tabId: number, request: ImageRequest) => Promise<ImageResponse>
  /** The user allowed services to receive images in the panel of the content script `session`; `message`: for its message only. The image requests sent after it wait for it. */
  imageConsent?: (session: string, ids: string[], message: boolean, hosts?: string[]) => Promise<void>
  /** The content script `session` went away. */
  forgetSession?: (session: string) => void
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

export function createTabRegistry({ ready, publicSettings, setContext, translate, summarize, openSession, image, imageConsent, forgetSession }: TabRegistryDeps): TabRegistry {
  const ports = new Map<number, Set<browser.runtime.Port>>()
  let sessions = 0
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

  /** The requests a Port may send: translations, the message as context, the summary and the images of its tab; images only with a session. */
  function serve(port: browser.runtime.Port, msg: PortReport, sample: boolean, tabId: number | undefined, signal: AbortSignal, session?: string): void {
    switch (msg.type) {
      case "context":
        setContext(msg.context, msg.bypassCache === true)
        break
      case "translate":
        // A failure of the translation itself, not of a tier (each tier reports its own): the request still ends.
        void ready()
          .then(() => translate(msg.request, (tier, result) => safePost(port, { type: "tier", id: msg.id, tier, result }), { sample, signal }))
          .catch(() => {})
          .finally(() => safePost(port, { type: "done", id: msg.id }))
        break
      case "summary": {
        // Only the message on screen has a summary.
        const result = sample || tabId === undefined ? Promise.reject(new Error("no message")) : ready().then(() => summarize(msg.text, tabId, msg.bypassCache === true))
        void result.catch((): SummaryResponse => ({ ok: false, error: t("errUnknown") })).then((answer) => safePost(port, { type: "summary", id: msg.id, result: answer }))
        break
      }
      case "image": {
        // Only the message on screen has images.
        const result = session && tabId !== undefined && image ? ready().then(() => image(session, tabId, msg.image)) : Promise.reject(new Error("no message"))
        void result.catch((): ImageResponse => ({ status: "error", error: t("errUnknown") })).then((answer) => safePost(port, { type: "imageResult", id: msg.id, result: answer }))
        break
      }
      case "imageConsent":
        if (session && imageConsent) void imageConsent(session, msg.ids, msg.message === true, Array.isArray(msg.hosts) ? msg.hosts : undefined).catch(() => {})
        break
    }
  }

  /** The settings to a Port that just connected, once they are read. */
  const sendSettings = (port: browser.runtime.Port) =>
    void ready()
      .then(() => safePost(port, { type: "settings", settings: publicSettings() }))
      .catch(() => {})

  function connect(port: browser.runtime.Port): void {
    if (port.name !== CONTENT_PORT_NAME) return
    const tabId = port.sender?.tab?.id
    if (tabId === undefined) return
    // A page of the extension translates its own sample message; a content script, the message on screen.
    const sample = typeof port.sender?.url === "string" && port.sender.url.startsWith(ext.runtime.getURL(""))
    const session = sample ? undefined : `${tabId}:${++sessions}`
    if (session) openSession?.(session, tabId)
    // Aborted when the content script goes away: what it asked for and is still waiting in a queue is not sent.
    const gone = new AbortController()
    if (!ports.has(tabId)) ports.set(tabId, new Set())
    ports.get(tabId)!.add(port)
    tabStates.set(tabId, { ...IDLE_TAB_STATE, connected: true })
    void updateBadge(tabId)

    port.onMessage.addListener((msg) => {
      if (!isPortReport(msg)) return
      if (msg.type !== "state") return serve(port, msg, sample, tabId, gone.signal, session)
      const wasActive = tabStates.get(tabId)?.active
      tabStates.set(tabId, { connected: true, ...msg.state })
      // Progress reports come many times a second; the badge only shows whether the tab is translated.
      if (msg.state.active !== wasActive) void updateBadge(tabId)
    })
    port.onDisconnect.addListener(() => {
      gone.abort()
      if (session) forgetSession?.(session)
      const set = ports.get(tabId)
      set?.delete(port)
      if (!set || set.size === 0) {
        ports.delete(tabId)
        tabStates.delete(tabId)
        void updateBadge(tabId)
      }
    })
    sendSettings(port)
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
