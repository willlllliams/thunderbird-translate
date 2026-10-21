/**
 * A TranslationController connected to the background script through a
 * Port: settings, commands and translation results are pushed, translation
 * requests and the progress are reported. The content script runs one on
 * the displayed message, the welcome page one on its sample message.
 */

import { ext } from "../shared/ext"
import { ENGLISH, getI18n, I18n, setI18n } from "../shared/i18n"
import { browserDetector } from "../shared/lang-detect"
import type { UiLanguageSetting } from "../shared/locales"
import type { PublicSettings } from "../shared/settings"
import type { SummaryResponse } from "../shared/summary"
import { CONTENT_PORT_NAME, type ImageResponse, isPortPush, type LocaleMessages, type PortReport, send, SUBJECTS_PORT_NAME, type TabState, type TranslateResponse } from "../shared/messages"
import type { Tier } from "../shared/providers"
import type { ContentProbe } from "../hooks/content"
import { ConsentPanel } from "./consent"
import { type ControllerDeps, TranslationController } from "./controller"
import { ImageTranslator } from "./images"
import { MissingNotice } from "./notice"
import { SummaryButton, SummaryPanel } from "./summary"

declare const __DEBUG__: boolean

export interface ClientOptions {
  root: () => HTMLElement | null
  /** Content script: load the labels of the interface language through the background, decide on auto-translation and show the notice about missing offline data. Extension pages load their labels themselves. */
  contentScript?: boolean
  /** Follows the client (test build, see hooks/content.ts). */
  probe?: ContentProbe
  /**
   * The page of translated subjects: it connects under its own Port name, so that the background script applies the
   * consent rules of real messages; asks through the consent panel (with the title of the subjects) before subjects
   * first go to an online service; and translates the units of `collect` in display mode `mode`, as plain text.
   */
  subjects?: { collect: NonNullable<ControllerDeps["collect"]>; mode: NonNullable<ControllerDeps["mode"]> }
  /** Gets every progress report of the controller, as the background script does; the page of translated subjects shows it. */
  onState?: (state: Omit<TabState, "connected">) => void
}

export interface ContentClient {
  controller: TranslationController
  /** Settles once the first settings are applied. */
  ready: Promise<void>
}

/** Messages for the interface language; the background reads the packaged files for us. */
async function loadLabels(uiLanguage: UiLanguageSetting): Promise<void> {
  try {
    const r: LocaleMessages | undefined = await send({ type: "getLocaleMessages", uiLanguage })
    setI18n(r?.messages ? new I18n(r.locale, r.messages) : ENGLISH)
  } catch {
    setI18n(ENGLISH)
  }
}

export function connectContent({ root, contentScript = false, probe, subjects, onState }: ClientOptions): ContentClient {
  const port = ext.runtime.connect({ name: subjects ? SUBJECTS_PORT_NAME : CONTENT_PORT_NAME })
  /** False when the background went away (extension reloaded): the Port then throws. */
  const post = (msg: PortReport): boolean => {
    try {
      port.postMessage(msg)
      return true
    } catch {
      return false
    }
  }

  type PendingRequest = { resolve: () => void; onTier: (tier: Tier, result: TranslateResponse) => void; tiers: Set<Tier> }
  /** Translation requests that are not complete yet, with the tiers that have not answered. */
  const pending = new Map<number, PendingRequest>()
  const fail = ({ resolve, onTier, tiers }: PendingRequest) => {
    for (const tier of tiers) onTier(tier, { ok: false, error: getI18n().t("errUnknown") })
    resolve()
  }
  /** Subject requests without an answer yet. */
  const subjectRequests = new Map<number, (subject: string | null) => void>()
  /** Summary requests without an answer yet. */
  const summaryRequests = new Map<number, (result: SummaryResponse) => void>()
  /** Image requests without an answer yet. */
  const imageRequests = new Map<number, (result: ImageResponse) => void>()
  let nextId = 0
  let mutedPairs: string[] = []
  const notice = contentScript
    ? new MissingNotice({
        root,
        muted: () => mutedPairs,
        send: (req) => void send(req).catch(() => {}),
      })
    : undefined

  // For a displayed message and for the subjects of a folder; the other extension pages translate their own sample text.
  const consentPanel = contentScript || subjects ? new ConsentPanel({ root, subjects: Boolean(subjects) }) : undefined
  const consent = consentPanel && {
    ask: async (needs: Parameters<ConsentPanel["ask"]>[0], precise: boolean) => {
      if (!(await consentPanel.ask(needs, precise))) return false
      try {
        await send({ type: "grantConsent", ids: needs.map((need) => need.id) })
        return true
      } catch {
        return false
      }
    },
    clear: () => consentPanel.clear(),
  }

  /** The settings applied last. */
  let current: PublicSettings | null = null
  /** The service of the summary, allowed in the consent panel before the settings that record it arrive. */
  const summaryAllowed = new Set<string>()
  // Only the content script has a message to summarize.
  const summaryPanel = contentScript
    ? new SummaryPanel({
        root,
        collapsed: () => current?.summary.collapsed === true,
        request: (fresh) =>
          new Promise<SummaryResponse>((resolve) => {
            const id = ++nextId
            if (post({ type: "summary", id, text: controller.messageText(), ...(fresh ? { bypassCache: true } : {}) })) summaryRequests.set(id, resolve)
            else resolve({ ok: false, error: getI18n().t("errUnknown") })
          }),
      })
    : undefined
  /** The summary of the message, once the user allowed its service to receive the text. */
  const summarize = async () => {
    const need = current?.summary.available ? current.summary.consent : undefined
    if (!summaryPanel || need === undefined) return
    if (need && !summaryAllowed.has(need.id)) {
      // The summary sends the whole message, as precise translation does.
      if (!(await consent!.ask([need], true))) return
      summaryAllowed.add(need.id)
    }
    await summaryPanel.show()
  }
  const summaryButton = summaryPanel ? new SummaryButton({ root, onClick: () => void summarize() }) : undefined
  const showSummaryButton = (active: boolean) => summaryButton?.sync(active && current?.summary.available === true && current.summary.inlineButton)

  // Only a displayed message has images to translate.
  const images = contentScript
    ? new ImageTranslator({
        root,
        request: (image) =>
          new Promise<ImageResponse>((resolve) => {
            const id = ++nextId
            if (post({ type: "image", id, image })) imageRequests.set(id, resolve)
            else resolve({ status: "error", error: getI18n().t("errUnknown") })
          }),
        grant: (ids, message) => void post({ type: "imageConsent", ids, ...(message ? { message } : {}) }),
      })
    : undefined

  const controller = new TranslationController({
    notice,
    consent,
    images,
    root,
    ...(subjects ? { collect: subjects.collect, mode: subjects.mode, plainText: true } : {}),
    translate: (request, onTier) =>
      new Promise((resolve) => {
        const id = ++nextId
        const entry = { resolve, onTier, tiers: new Set(request.tiers) }
        if (post({ type: "translate", id, request })) pending.set(id, entry)
        else fail(entry)
      }),
    setContext: (context, bypassCache) => void post({ type: "context", context, ...(bypassCache ? { bypassCache } : {}) }),
    // Only a displayed message has a subject; the background script reads it from the header of the message in the tab.
    subject: contentScript
      ? () =>
          new Promise<string | null>((resolve) => {
            const id = ++nextId
            if (post({ type: "subject", id })) subjectRequests.set(id, resolve)
            else resolve(null)
          })
      : undefined,
    detect: browserDetector(ext.i18n),
    report: (state) => {
      if (__DEBUG__) {
        const first = root()?.querySelector(".tt-translation")?.textContent ?? ""
        console.info("[thunderbird-translate] state", JSON.stringify(state), first.slice(0, 80))
      }
      probe?.state(state)
      onState?.(state)
      showSummaryButton(state.active)
      post({ type: "state", state })
    },
  })

  let markReady!: () => void
  const ready = new Promise<void>((resolve) => (markReady = resolve))
  probe?.attach({ contentScript, root, controller, notice, consent: consentPanel, summary: summaryPanel, images, ready })
  let firstSettings = true
  let uiLanguage: UiLanguageSetting | null = null
  // Settings are applied in the order they arrive, each once its labels are loaded.
  let settingsApplied = Promise.resolve()
  port.onMessage.addListener((msg) => {
    if (!isPortPush(msg)) return
    if (msg.type === "settings") {
      const next = msg.settings
      mutedPairs = next.offlineMutedPairs
      current = next
      settingsApplied = settingsApplied.then(async () => {
        if (contentScript && next.uiLanguage !== uiLanguage) {
          uiLanguage = next.uiLanguage
          await loadLabels(uiLanguage)
        }
        void controller.updateSettings(next)
        showSummaryButton(controller.active)
        if (!firstSettings) return
        firstSettings = false
        markReady()
        if (contentScript) void (__DEBUG__ ? controller.start() : controller.maybeAutoStart())
      })
    } else if (msg.type === "toggle") {
      void controller.toggle()
    } else if (msg.type === "retranslate") {
      void controller.retranslate()
    } else if (msg.type === "summarize") {
      void summarize()
    } else if (msg.type === "summary") {
      summaryRequests.get(msg.id)?.(msg.result)
      summaryRequests.delete(msg.id)
    } else if (msg.type === "imageResult") {
      imageRequests.get(msg.id)?.(msg.result)
      imageRequests.delete(msg.id)
    } else if (msg.type === "offlineDataChanged") {
      controller.forgetResults()
    } else if (msg.type === "tier") {
      const request = pending.get(msg.id)
      request?.tiers.delete(msg.tier)
      request?.onTier(msg.tier, msg.result)
    } else if (msg.type === "done") {
      pending.get(msg.id)?.resolve()
      pending.delete(msg.id)
    } else if (msg.type === "subject") {
      subjectRequests.get(msg.id)?.(typeof msg.subject === "string" ? msg.subject : null)
      subjectRequests.delete(msg.id)
    }
    probe?.push(msg)
  })
  // The background went away (extension reloaded): settle what is still waiting.
  port.onDisconnect.addListener(() => {
    for (const request of pending.values()) fail(request)
    pending.clear()
    for (const resolve of subjectRequests.values()) resolve(null)
    subjectRequests.clear()
    for (const resolve of summaryRequests.values()) resolve({ ok: false, error: getI18n().t("errUnknown") })
    summaryRequests.clear()
    for (const resolve of imageRequests.values()) resolve({ status: "error", error: getI18n().t("errUnknown") })
    imageRequests.clear()
  })
  return { controller, ready }
}
