/**
 * Content script injected into the message display (messageDisplayScripts):
 * a translation controller on the message body, connected to the background
 * script (see client.ts).
 */

import { connectContent } from "./client"

declare global {
  interface Window {
    __thunderbirdTranslateLoaded?: boolean
  }
}

// Guard against double injection (registered script + executeScript).
if (!window.__thunderbirdTranslateLoaded) {
  window.__thunderbirdTranslateLoaded = true
  connectContent({ root: () => document.body, contentScript: true })
}
