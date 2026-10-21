/**
 * Hooks of the e2e test build. Every hook under src/hooks/ is undefined here;
 * scripts/build.mjs --e2e replaces each module of src/hooks/ with the module
 * of the same name in src/e2e/hooks/, which defines them. No other build
 * contains code of src/e2e/.
 *
 * Arguments of a hook may only be values already computed or references to
 * objects: `hook?.(expr)` does not evaluate expr when the hook is undefined,
 * so an effect of expr would happen in the test build only.
 */

import type { ConsentPanel } from "../content/consent"
import type { TranslationController } from "../content/controller"
import type { MissingNotice } from "../content/notice"
import type { ImageTranslator } from "../content/images"
import type { SummaryPanel } from "../content/summary"
import type { PortPush, TabState } from "../shared/messages"

/** The parts of a content client. */
export interface ContentProbeParts {
  /** True for the content script on a displayed message. */
  contentScript: boolean
  root: () => HTMLElement | null
  controller: TranslationController
  notice: MissingNotice | undefined
  /** The panel that asks before message text first goes to an online service. */
  consent: ConsentPanel | undefined
  /** The panel with the summary and to-dos of the message; the content script only. */
  summary: SummaryPanel | undefined
  /** The text of the images of the message; the content script only. */
  images: ImageTranslator | undefined
  /** Settles once the first settings are applied. */
  ready: Promise<void>
}

/** Follows a content client: what it is made of, every progress report and every message of the background script. */
export interface ContentProbe {
  /** Called once, when the client is set up. */
  attach(parts: ContentProbeParts): void
  /** Called with every progress report of the controller. */
  state(state: Omit<TabState, "connected">): void
  /** Called after the client handled a message of the background script. */
  push(msg: PortPush): void
}

/** The probe of the content script, handed to its client by content/index.ts. */
export const contentProbe: ContentProbe | undefined = undefined
