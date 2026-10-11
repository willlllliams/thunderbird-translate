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
import {
  type BackgroundRequest,
  CONTENT_PORT_NAME,
  type LocaleMessages,
  type PortPush,
  type PortReport,
  type TranslateResponse,
} from "../shared/messages"
import type { Tier } from "../shared/providers"
import { TranslationController } from "./controller"
import { createE2eProbe } from "../e2e/content"

declare const __DEBUG__: boolean
declare const __E2E__: boolean

export interface ClientOptions {
  root: () => HTMLElement | null
  /** Content script: load the labels of the interface language through the background and decide on auto-translation. Extension pages load their labels themselves. */
  contentScript?: boolean
}

export interface ContentClient {
  controller: TranslationController
  /** Settles once the first settings are applied. */
  ready: Promise<void>
}

/** Messages for the interface language; the background reads the packaged files for us. */
async function loadLabels(uiLanguage: UiLanguageSetting): Promise<void> {
  try {
    const r = (await ext.runtime.sendMessage({ type: "getLocaleMessages", uiLanguage } satisfies BackgroundRequest)) as LocaleMessages | undefined
    setI18n(r?.messages ? new I18n(r.locale, r.messages) : ENGLISH)
  } catch {
    setI18n(ENGLISH)
  }
}

export function connectContent({ root, contentScript = false }: ClientOptions): ContentClient {
  const port = ext.runtime.connect({ name: CONTENT_PORT_NAME })
  const post = (msg: PortReport) => port.postMessage(msg)

  /** Translation requests that are not complete yet, with the tiers that have not answered. */
  const pending = new Map<number, { resolve: () => void; onTier: (tier: Tier, result: TranslateResponse) => void; tiers: Set<Tier> }>()
  let nextId = 0

  const controller = new TranslationController({
    root,
    translate: (request, onTier) =>
      new Promise((resolve) => {
        const id = ++nextId
        pending.set(id, { resolve, onTier, tiers: new Set(request.tiers) })
        post({ type: "translate", id, request })
      }),
    setContext: (context) => post({ type: "context", context }),
    detect: browserDetector(ext.i18n),
    report: (state) => {
      if (__DEBUG__) {
        const first = root()?.querySelector(".tt-translation")?.textContent ?? ""
        console.info("[thunderbird-translate] state", JSON.stringify(state), first.slice(0, 80))
      }
      if (__E2E__) probe?.state(state)
      try {
        post({ type: "state", state })
      } catch {
        // Background restarted; nothing to report to.
      }
    },
  })

  // Test build (npm run e2e): runs the end-to-end scenario on the displayed message instead of auto-translation.
  const probe = __E2E__ && contentScript ? createE2eProbe(root, controller) : null

  let markReady!: () => void
  const ready = new Promise<void>((resolve) => (markReady = resolve))
  let firstSettings = true
  let uiLanguage: UiLanguageSetting | null = null
  // Settings are applied in the order they arrive, each once its labels are loaded.
  let settingsApplied = Promise.resolve()
  port.onMessage.addListener((raw) => {
    const msg = raw as PortPush
    if (msg.type === "settings") {
      const next = msg.settings
      settingsApplied = settingsApplied.then(async () => {
        if (contentScript && next.uiLanguage !== uiLanguage) {
          uiLanguage = next.uiLanguage
          await loadLabels(uiLanguage)
        }
        void controller.updateSettings(next)
        if (!firstSettings) return
        firstSettings = false
        markReady()
        if (__E2E__ && probe) void probe.run()
        else if (contentScript) void (__DEBUG__ ? controller.start() : controller.maybeAutoStart())
      })
    } else if (msg.type === "toggle") {
      void controller.toggle()
    } else if (msg.type === "tier") {
      const request = pending.get(msg.id)
      request?.tiers.delete(msg.tier)
      request?.onTier(msg.tier, msg.result)
      if (__E2E__) probe?.tier(msg.id, msg.tier, msg.result)
    } else if (msg.type === "done") {
      pending.get(msg.id)?.resolve()
      pending.delete(msg.id)
    }
  })
  // The background went away (extension reloaded): settle what is still waiting.
  port.onDisconnect.addListener(() => {
    for (const { resolve, onTier, tiers } of pending.values()) {
      for (const tier of tiers) onTier(tier, { ok: false, error: getI18n().t("errUnknown") })
      resolve()
    }
    pending.clear()
  })
  return { controller, ready }
}
