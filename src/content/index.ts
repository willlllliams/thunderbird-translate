/**
 * Content script injected into the message display (messageDisplayScripts):
 * a translation controller on the message body, connected to the background
 * script (see client.ts).
 */

import { contentProbe } from "../hooks/content"
import { connectContent } from "./client"

declare global {
  interface Window {
    __thunderbirdTranslateLoaded?: boolean
  }
}

// Guard against double injection (registered script + executeScript).
if (!window.__thunderbirdTranslateLoaded) {
  window.__thunderbirdTranslateLoaded = true
  // Test build (npm run e2e): a probe follows the client and runs the scenario of the run.
  connectContent({ root: () => document.body, contentScript: true, probe: contentProbe })
}
