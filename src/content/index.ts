/**
 * Content script injected into the message display (messageDisplayScripts).
 * Talks to the background through a Port: settings, commands and translation
 * results are pushed, translation requests and the progress are reported.
 */

import { ext } from "../shared/ext"
import { ENGLISH, getI18n, I18n, setI18n } from "../shared/i18n"
import type { UiLanguageSetting } from "../shared/locales"
import {
  type BackgroundRequest,
  CONTENT_PORT_NAME,
  type LocaleMessages,
  type PortPush,
  type PortReport,
  type TranslateResponse,
} from "../shared/messages"
import { TranslationController } from "./controller"
import { browserDetector } from "./lang-detect"

declare const __DEBUG__: boolean

declare global {
  interface Window {
    __thunderbirdTranslateLoaded?: boolean
  }
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

function main(): void {
  // Guard against double injection (registered script + executeScript).
  if (window.__thunderbirdTranslateLoaded) return
  window.__thunderbirdTranslateLoaded = true

  const port = ext.runtime.connect({ name: CONTENT_PORT_NAME })
  const post = (msg: PortReport) => port.postMessage(msg)

  /** Translation requests waiting for their final result. */
  const pending = new Map<number, { resolve: (r: TranslateResponse) => void; onProvisional: (text: string) => void }>()
  let nextId = 0

  const controller = new TranslationController({
    root: () => document.body,
    translate: (request, onProvisional) =>
      new Promise((resolve) => {
        const id = ++nextId
        pending.set(id, { resolve, onProvisional })
        post({ type: "translate", id, request })
      }),
    setContext: (context) => post({ type: "context", context }),
    detect: browserDetector(ext.i18n as never),
    report: (state) => {
      if (__DEBUG__) {
        const first = document.querySelector(".tt-translation")?.textContent ?? ""
        console.info("[thunderbird-translate] state", JSON.stringify(state), first.slice(0, 80))
      }
      try {
        post({ type: "state", state })
      } catch {
        // Background restarted; nothing to report to.
      }
    },
  })

  let firstSettings = true
  let uiLanguage: UiLanguageSetting | null = null
  port.onMessage.addListener((raw) => {
    const msg = raw as PortPush
    if (msg.type === "settings") {
      const labelsReady = msg.settings.uiLanguage === uiLanguage ? Promise.resolve() : loadLabels(msg.settings.uiLanguage)
      uiLanguage = msg.settings.uiLanguage
      void labelsReady.then(() => controller.updateSettings(msg.settings)).then(() => {
        if (firstSettings) {
          firstSettings = false
          if (__DEBUG__) void controller.start()
          else void controller.maybeAutoStart()
        }
      })
    } else if (msg.type === "command") {
      if (msg.command === "toggle") void controller.toggle()
      else if (msg.command === "start") void controller.start()
      else if (msg.command === "stop") controller.stop()
    } else if (msg.type === "provisional") {
      pending.get(msg.id)?.onProvisional(msg.text)
    } else if (msg.type === "result") {
      pending.get(msg.id)?.resolve(msg.result)
      pending.delete(msg.id)
    }
  })
  // The background went away (extension reloaded): settle what is still waiting.
  port.onDisconnect.addListener(() => {
    for (const { resolve } of pending.values()) resolve({ ok: false, error: getI18n().t("errUnknown") })
    pending.clear()
  })
}

main()
