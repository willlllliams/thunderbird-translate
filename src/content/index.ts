/**
 * Content script injected into the message display (messageDisplayScripts).
 * Talks to the background through a Port (pushes: settings, commands) and
 * runtime.sendMessage (translation requests).
 */

import { ext, t } from "../shared/ext"
import { type BackgroundRequest, CONTENT_PORT_NAME, type PortPush, type TranslateResponse } from "../shared/messages"
import { TranslationController } from "./controller"
import { browserDetector } from "./lang-detect"

declare const __DEBUG__: boolean

declare global {
  interface Window {
    __thunderbirdTranslateLoaded?: boolean
  }
}

function main(): void {
  // Guard against double injection (registered script + executeScript).
  if (window.__thunderbirdTranslateLoaded) return
  window.__thunderbirdTranslateLoaded = true

  const port = ext.runtime.connect({ name: CONTENT_PORT_NAME })

  const controller = new TranslationController({
    root: () => document.body,
    translate: (text, targetLang, providerId) =>
      ext.runtime.sendMessage({ type: "translate", text, targetLang, providerId } satisfies BackgroundRequest) as Promise<TranslateResponse>,
    detect: browserDetector(ext.i18n as never),
    report: (state) => {
      if (__DEBUG__) {
        const first = document.querySelector(".tt-translation")?.textContent ?? ""
        console.info("[thunderbird-translate] state", JSON.stringify(state), first.slice(0, 80))
      }
      try {
        port.postMessage({ type: "state", state })
      } catch {
        // Background restarted; nothing to report to.
      }
    },
    label: (key) => (key === "loading" ? t("statusTranslating") : t("statusFailed")),
  })

  let firstSettings = true
  port.onMessage.addListener((raw) => {
    const msg = raw as PortPush
    if (msg.type === "settings") {
      void controller.updateSettings(msg.settings).then(() => {
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
    }
  })
}

main()
