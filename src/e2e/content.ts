/**
 * End-to-end test probe of the content script, compiled only into the e2e
 * build (src/e2e/hooks/content.ts). It follows the content client as a
 * subscriber (see src/hooks/content.ts): the client applies the settings and
 * decides on auto-translation as in every other build.
 *
 * On the displayed message it translates every paragraph, switches the
 * display mode with the keyboard command, restores the original, translates
 * again from what the page remembers, retranslates with the keyboard command
 * past every cache and sends what it saw to the background script, which
 * forwards it to the mock server.
 * In the "missing" scenario (no pack or model installed) it reads the notice
 * about missing offline data instead, mutes it, translates again, then
 * switches to Google without the dictionary and translates once more.
 * In the "auto" scenario (automatic translation on) it starts nothing and
 * waits until automatic translation has translated every paragraph; in
 * "auto-skip" (a message in the target language) it waits a fixed time and
 * reports that nothing was translated.
 * The test runner (e2e/run.mjs) makes the assertions.
 */

import { ext } from "../shared/ext"
import type { TabState } from "../shared/messages"
import type { Tier } from "../shared/providers"
import { muteKey } from "../content/notice"
import type { ContentProbe, ContentProbeParts } from "../hooks/content"
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

type Phase = "translate" | "mode" | "restore" | "cached" | "retranslate"

const TIMEOUT_MS = 30_000
/** How long the "auto-skip" scenario waits for a translation that must not start. */
const SKIP_WAIT_MS = 2500

function snapshot(root: HTMLElement): Shown[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".tt-translation"), (el) => ({
    // The first child is the text; a mark adds a label element after it.
    text: el.firstChild?.nodeType === Node.TEXT_NODE ? (el.firstChild.textContent ?? "") : "",
    mode: el.classList.contains("tt-only") ? ("only" as const) : ("bilingual" as const),
    mark: el.classList.contains("tt-provisional") ? ("provisional" as const) : el.classList.contains("tt-fallback") ? ("fallback" as const) : null,
  }))
}

const send = (msg: E2eMessage) => ext.runtime.sendMessage(msg)

export function createContentProbe(): ContentProbe {
  const events: TierEvent[] = []
  let phase: Phase = "translate"
  let last: Omit<TabState, "connected"> | null = null
  let settings: PublicSettings | null = null
  let started = 0
  /** The parts of the content script's client; the probe follows no other client. */
  let parts: Omit<ContentProbeParts, "contentScript"> | null = null
  const root = () => parts!.root()

  async function until(what: string, test: () => boolean): Promise<void> {
    const deadline = performance.now() + TIMEOUT_MS
    while (!test()) {
      if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}; state ${JSON.stringify(last)}`)
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  /** Translate the message once more from the start, until every paragraph has its answers. */
  async function translateAgain(): Promise<void> {
    const { controller } = parts!
    controller.stop()
    last = null
    await controller.start()
    await until("the final progress report", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
  }

  const noticeShown = () => {
    const el = document.querySelector(".tt-notice")
    return el ? { lines: Array.from(el.querySelectorAll("li"), (li) => li.textContent), first: el === root()?.firstElementChild } : null
  }
  const entries = () => (parts!.notice?.lastRound ?? []).map(muteKey).sort()

  /** The "missing" scenario: the notice, muting, translating again, and Google without the dictionary. */
  async function missing(report: Record<string, unknown>): Promise<void> {
    const { controller } = parts!
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

  /** The "auto" scenario: automatic translation translates every paragraph; the probe only waits. */
  async function auto(report: Record<string, unknown>, body: HTMLElement): Promise<void> {
    await until("the final progress report of the automatic translation", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
    report.translated = { state: last, active: parts!.controller.active, shown: snapshot(body) }
  }

  /** The "auto-skip" scenario: a message in the target language, which automatic translation leaves alone. */
  async function autoSkip(report: Record<string, unknown>): Promise<void> {
    const waited = performance.now()
    await new Promise((r) => setTimeout(r, SKIP_WAIT_MS))
    report.skipped = { state: last, active: parts!.controller.active, shown: snapshot(root()!).length, waitedMs: Math.round(performance.now() - waited) }
  }

  async function run(): Promise<void> {
    const { controller } = parts!
    const body = root()
    const report: Record<string, unknown> = { hook: E2E_MARKER, url: location.href, events }
    try {
      if (!body) throw new Error("no message body")
      const scenario = await send({ e2e: "scenario" })
      if (scenario === "missing" || scenario === "auto" || scenario === "auto-skip") {
        report.scenario = scenario
        await (scenario === "missing" ? missing(report) : scenario === "auto" ? auto(report, body) : autoSkip(report))
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

      // Translated again: the page and the cache know every paragraph.
      phase = "cached"
      await send({ e2e: "command", command: "toggle-translation" })
      await until("the remembered translation", () => last !== null && last.active && last.total > 0 && last.done === last.total)
      report.cached = { state: last, shown: snapshot(body) }

      // Retranslated: every tier is asked again although everything is cached.
      phase = "retranslate"
      await send({ e2e: "command", command: "retranslate" })
      const total = last!.total
      await until("the AI results of the retranslation", () => events.filter((e) => e.phase === "retranslate" && e.tier === "ai").length >= total && last?.done === total)
      report.retranslated = { state: last, shown: snapshot(body) }
    } catch (error) {
      report.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
    }
    await send({ e2e: "report", report })
  }

  return {
    attach(next) {
      if (!next.contentScript) return
      parts = next
      started = performance.now()
      void send({ e2e: "log", message: `content script on ${location.href}` })
      void next.ready.then(run)
    },
    state(state) {
      last = state
    },
    push(msg) {
      if (!parts) return
      if (msg.type === "settings") settings = msg.settings
      if (msg.type !== "tier") return
      const body = root()
      events.push({
        phase,
        id: msg.id,
        tier: msg.tier as Tier,
        ok: msg.result.ok,
        text: msg.result.ok ? msg.result.text : msg.result.error,
        at: Math.round(performance.now() - started),
        shown: body ? snapshot(body) : [],
      })
    },
  }
}
