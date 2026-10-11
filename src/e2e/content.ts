/**
 * End-to-end test probe of the content script, compiled only into the e2e
 * build (see src/e2e/background.ts).
 *
 * On the displayed message it translates every paragraph, switches the
 * display mode with the keyboard command, restores the original and sends
 * what it saw to the background script, which forwards it to the mock server.
 * In the "missing" scenario (no pack or model installed) it reads the notice
 * about missing offline data instead, mutes it, translates again, then
 * switches to Google without the dictionary and translates once more.
 * The test runner (e2e/run.mjs) makes the assertions.
 */

import { ext } from "../shared/ext"
import type { TabState, TranslateResponse } from "../shared/messages"
import type { Tier } from "../shared/providers"
import type { TranslationController } from "../content/controller"
import { type MissingNotice, muteKey } from "../content/notice"
import type { PublicSettings } from "../shared/settings"
import type { E2eMessage } from "./background"
import { E2E_MARKER } from "./marker"

/** One translation element on screen. */
interface Shown {
  text: string
  mode: "bilingual" | "only"
  mark: "provisional" | "fallback" | null
}

/** One tier result received from the background, with what the page showed right after it. */
interface TierEvent {
  phase: Phase
  id: number
  tier: Tier
  ok: boolean
  text: string
  at: number
  shown: Shown[]
}

type Phase = "translate" | "mode" | "restore"

const TIMEOUT_MS = 30_000

function snapshot(root: HTMLElement): Shown[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".tt-translation"), (el) => ({
    // The first child is the text; a mark adds a label element after it.
    text: el.firstChild?.nodeType === Node.TEXT_NODE ? (el.firstChild.textContent ?? "") : "",
    mode: el.classList.contains("tt-only") ? ("only" as const) : ("bilingual" as const),
    mark: el.classList.contains("tt-provisional") ? ("provisional" as const) : el.classList.contains("tt-fallback") ? ("fallback" as const) : null,
  }))
}

const send = (msg: E2eMessage) => ext.runtime.sendMessage(msg)

export interface E2eProbe {
  state(state: Omit<TabState, "connected">): void
  tier(id: number, tier: Tier, result: TranslateResponse): void
  settings(settings: PublicSettings): void
  run(): Promise<void>
}

export function createE2eProbe(root: () => HTMLElement | null, controller: TranslationController, notice?: MissingNotice): E2eProbe {
  const events: TierEvent[] = []
  let phase: Phase = "translate"
  let last: Omit<TabState, "connected"> | null = null
  let settings: PublicSettings | null = null
  const started = performance.now()
  void send({ e2e: "log", message: `content script on ${location.href}` })

  async function until(what: string, test: () => boolean): Promise<void> {
    const deadline = performance.now() + TIMEOUT_MS
    while (!test()) {
      if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}; state ${JSON.stringify(last)}`)
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  /** Translate the message once more from the start, until every paragraph has its answers. */
  async function translateAgain(): Promise<void> {
    controller.stop()
    last = null
    await controller.start()
    await until("the final progress report", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
  }

  const noticeShown = () => {
    const el = document.querySelector(".tt-notice")
    return el ? { lines: Array.from(el.querySelectorAll("li"), (li) => li.textContent), first: el === root()?.firstElementChild } : null
  }
  const entries = () => (notice?.lastRound ?? []).map(muteKey).sort()

  /** The "missing" scenario: the notice, muting, translating again, and Google without the dictionary. */
  async function missing(report: Record<string, unknown>): Promise<void> {
    await controller.start()
    await until("the final progress report", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
    await until("the notice", () => noticeShown() !== null)
    report.first = { state: last, notice: noticeShown(), entries: entries() }

    document.querySelector<HTMLInputElement>(".tt-notice input[type=checkbox]")!.click()
    const deadline = performance.now() + TIMEOUT_MS
    let muted: string[] = []
    while (muted.length < entries().length && performance.now() < deadline) {
      muted = ((await send({ e2e: "settings" })) as string[]) ?? []
      await new Promise((r) => setTimeout(r, 100))
    }
    report.muted = muted.sort()
    await until("the muted entries in the settings of the page", () => entries().every((key) => settings?.offlineMutedPairs.includes(key)))
    const buttons = document.querySelectorAll<HTMLButtonElement>(".tt-notice button")
    buttons[buttons.length - 1].click()
    report.closed = noticeShown() === null

    await translateAgain()
    report.again = { state: last, notice: noticeShown(), entries: entries() }

    controller.stop()
    await send({ e2e: "settings", useGoogle: true })
    await until("Google without the dictionary", () => settings?.tiers.join() === "machine" && settings.offlineMutedPairs.length === 0)
    await translateAgain()
    report.google = { state: last, notice: noticeShown(), entries: entries(), shown: snapshot(root()!) }
  }

  return {
    settings(next) {
      settings = next
    },
    state(state) {
      last = state
    },
    tier(id, tier, result) {
      const body = root()
      events.push({
        phase,
        id,
        tier,
        ok: result.ok,
        text: result.ok ? result.text : result.error,
        at: Math.round(performance.now() - started),
        shown: body ? snapshot(body) : [],
      })
    },
    async run() {
      const body = root()
      const report: Record<string, unknown> = { hook: E2E_MARKER, url: location.href, events }
      try {
        if (!body) throw new Error("no message body")
        if ((await send({ e2e: "scenario" })) === "missing") {
          report.scenario = "missing"
          await missing(report)
          await send({ e2e: "report", report })
          return
        }
        const original = body.innerHTML
        report.originalText = body.innerText
        report.originalHtml = original.slice(0, 8000)

        await controller.start()
        // Progress reports are throttled: wait for the one of the finished translation.
        await until("the final progress report", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
        report.translated = { state: last, shown: snapshot(body) }

        phase = "mode"
        await send({ e2e: "command", command: "toggle-display-mode" })
        await until("translation-only mode with AI results", () => {
          const shown = snapshot(body)
          return shown.length > 0 && shown.every((s) => s.mode === "only" && !s.mark) && last !== null && last.total > 0 && last.done === last.total
        })
        report.translationOnly = { state: last, shown: snapshot(body) }

        phase = "restore"
        await send({ e2e: "command", command: "toggle-translation" })
        await until("the original", () => !controller.active && last?.active === false)
        report.restored = {
          state: last,
          identical: body.innerHTML === original,
          leftovers: body.querySelectorAll(".tt-translation, .tt-status, .tt-seg").length,
          styleLeft: document.getElementById("tt-style-vars") !== null,
          ...(body.innerHTML === original ? {} : { original: original.slice(0, 4000), after: body.innerHTML.slice(0, 4000) }),
        }
      } catch (error) {
        report.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
      }
      await send({ e2e: "report", report })
    },
  }
}
