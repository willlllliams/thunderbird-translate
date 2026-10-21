/**
 * The content scripts connected to the background script, by tab: their
 * Ports, the translation state each tab reports, the badge of the header
 * button that shows whether a tab is translated, and the messages to one
 * tab or to every content script. Each content script is a session of its
 * own for the translation of images: its rounds, the limits of its message
 * and the consent given for its message alone; an image request waits for a
 * consent the same content script sent before it. The page of translated subjects
 * (subjects.html) connects the same way under its own Port name; it has no
 * tab state and no badge, and its subjects come from real messages, so the
 * consent rules apply to them.
 */

import { ext } from "../shared/ext"
import { t } from "../shared/i18n"
import type { MailContext } from "../shared/mail-context"
import { CONTENT_PORT_NAME, IDLE_TAB_STATE, type ImageRequest, type ImageResponse, isPortReport, type PortPush, type PortReport, SUBJECTS_PORT_NAME, type TabState, type TranslateRequest, type TranslateResponse } from "../shared/messages"
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
  /** Translates one paragraph and reports each tier; `sample`: the request comes from a page of the extension (the trial of the setup guide), not from a message. */
  translate: (request: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void, options: { sample: boolean }) => Promise<void>
  /** The subject of the message displayed in a tab; null when there is none or it cannot be read. */
  subject: (tabId: number) => Promise<string | null>
  /** The summary of the message displayed in a tab, of its text; `fresh`: past the cache. */
  summarize: (text: string, tabId: number, fresh: boolean) => Promise<SummaryResponse>
  /** An image of the message displayed in a tab, for the content script `session`; without it every image request fails. */
  image?: (session: string, tabId: number, request: ImageRequest) => Promise<ImageResponse>
  /** The user allowed services to receive images in the panel of the content script `session`; `message`: for its message only. */
  imageConsent?: (session: string, ids: string[], message: boolean) => Promise<void>
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
  /** A message to every content script and to the pages of translated subjects. */
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

/** A content script as the translation of images knows it: its session, and the consent it sent last, which its image requests wait for. */
interface ImageSession {
  id: string
  consent: Promise<void>
}

export function createTabRegistry({ ready, publicSettings, setContext, translate, subject, summarize, image, imageConsent, forgetSession }: TabRegistryDeps): TabRegistry {
  const ports = new Map<number, Set<browser.runtime.Port>>()
  let sessions = 0
  const tabStates = new Map<number, TabState>()
  /** The Ports of the pages of translated subjects. */
  const subjectPages = new Set<browser.runtime.Port>()

  async function updateBadge(tabId: number): Promise<void> {
    const active = tabStates.get(tabId)?.active
    try {
      await ext.messageDisplayAction.setBadgeText({ tabId, text: active ? t("badgeOn") : "" })
      if (active) await ext.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#4c8bf5" })
    } catch {
      // Tab already closed.
    }
  }

  /** The requests every Port may send: translations, the message as context, the subject, the summary and the images of its tab; images only with a session. */
  function serve(port: browser.runtime.Port, msg: PortReport, sample: boolean, tabId: number | undefined, images?: ImageSession): void {
    switch (msg.type) {
      case "context":
        setContext(msg.context, msg.bypassCache === true)
        break
      case "translate":
        // A failure of the translation itself, not of a tier (each tier reports its own): the request still ends.
        void ready()
          .then(() => translate(msg.request, (tier, result) => safePost(port, { type: "tier", id: msg.id, tier, result }), { sample }))
          .catch(() => {})
          .finally(() => safePost(port, { type: "done", id: msg.id }))
        break
      case "subject":
        // Only a content script has a message on screen; a page of the extension has no subject to ask for.
        void (sample || tabId === undefined ? Promise.resolve(null) : subject(tabId).catch(() => null)).then((text) => safePost(port, { type: "subject", id: msg.id, subject: text }))
        break
      case "summary": {
        // Only the message on screen has a summary.
        const result = sample || tabId === undefined ? Promise.reject(new Error("no message")) : ready().then(() => summarize(msg.text, tabId, msg.bypassCache === true))
        void result.catch((): SummaryResponse => ({ ok: false, error: t("errUnknown") })).then((answer) => safePost(port, { type: "summary", id: msg.id, result: answer }))
        break
      }
      case "image": {
        // Only the message on screen has images; a consent sent before the request is recorded first.
        const result = images && tabId !== undefined && image ? ready().then(() => images.consent).then(() => image(images.id, tabId, msg.image)) : Promise.reject(new Error("no message"))
        void result.catch((): ImageResponse => ({ status: "error", error: t("errUnknown") })).then((answer) => safePost(port, { type: "imageResult", id: msg.id, result: answer }))
        break
      }
      case "imageConsent":
        if (images && imageConsent) images.consent = images.consent.then(() => imageConsent(images.id, msg.ids, msg.message === true)).catch(() => {})
        break
    }
  }

  /** The settings to a Port that just connected, once they are read. */
  const sendSettings = (port: browser.runtime.Port) =>
    void ready()
      .then(() => safePost(port, { type: "settings", settings: publicSettings() }))
      .catch(() => {})

  /** The page of translated subjects: no tab state and no badge; the subjects are those of real messages. */
  function connectSubjectsPage(port: browser.runtime.Port): void {
    subjectPages.add(port)
    port.onMessage.addListener((msg) => {
      if (isPortReport(msg) && msg.type !== "state") serve(port, msg, false, undefined)
    })
    port.onDisconnect.addListener(() => subjectPages.delete(port))
    sendSettings(port)
  }

  function connect(port: browser.runtime.Port): void {
    const fromPage = typeof port.sender?.url === "string" && port.sender.url.startsWith(ext.runtime.getURL(""))
    if (port.name === SUBJECTS_PORT_NAME && fromPage) return connectSubjectsPage(port)
    if (port.name !== CONTENT_PORT_NAME) return
    const tabId = port.sender?.tab?.id
    if (tabId === undefined) return
    // A page of the extension translates its own sample message; a content script, the message on screen.
    const sample = fromPage
    const images: ImageSession | undefined = sample ? undefined : { id: `${tabId}:${++sessions}`, consent: Promise.resolve() }
    if (!ports.has(tabId)) ports.set(tabId, new Set())
    ports.get(tabId)!.add(port)
    tabStates.set(tabId, { ...IDLE_TAB_STATE, connected: true })
    void updateBadge(tabId)

    port.onMessage.addListener((msg) => {
      if (!isPortReport(msg)) return
      if (msg.type !== "state") return serve(port, msg, sample, tabId, images)
      const wasActive = tabStates.get(tabId)?.active
      tabStates.set(tabId, { connected: true, ...msg.state })
      // Progress reports come many times a second; the badge only shows whether the tab is translated.
      if (msg.state.active !== wasActive) void updateBadge(tabId)
    })
    port.onDisconnect.addListener(() => {
      if (images) forgetSession?.(images.id)
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
      for (const port of subjectPages) safePost(port, msg)
    },
    redrawBadges() {
      for (const tabId of tabStates.keys()) void updateBadge(tabId)
    },
  }
}
