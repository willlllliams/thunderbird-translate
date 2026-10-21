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
 * In the "consent" scenario (no online service allowed yet) it starts the
 * translation, which shows the consent panel and requests nothing; after a
 * while it clicks "Allow and translate" and waits for the translation.
 * In the "machine-…" scenarios (one machine translator with a key of its
 * own) it translates once and reports the translations. In the "summary"
 * scenario it asks for the summary with the keyboard command, allows the AI
 * service in the consent panel, reads the panel, asks again, which the cache
 * answers, and regenerates the summary with the button of the panel.
 * In the "image-…" scenarios (image.eml, precise translation on) it
 * translates the message and reads what is under its images: in
 * "image-ask" it clicks the button of the chart, waits with the consent
 * panel open, allows the service, clicks the button of the receipt,
 * restores the message and translates it again, when the cache answers; in
 * "image-auto" it waits for the chart to be sent by itself and the receipt
 * to keep its button; in "image-off" it waits and finds nothing; in
 * "image-switch" it changes the mode from "ask" to "auto", "off" and back,
 * while the message stays translated.
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

/** One translation element on screen: its text without the mark, and the elements the Markdown of an AI translation added. */
interface Shown {
  text: string
  mode: "bilingual" | "only"
  mark: "provisional" | "fallback" | null
  tags: string[]
  links: { href: string; rel: string }[]
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

/** The text of a translation element without its mark, the label element after the text. */
function translationText(el: HTMLElement): string {
  return Array.from(el.childNodes, (node) => ((node as Element).classList?.contains("tt-status") ? "" : (node.textContent ?? ""))).join("")
}

/** The elements inside a translation, without its mark. */
const markup = (el: HTMLElement) => Array.from(el.querySelectorAll("*")).filter((child) => !child.closest(".tt-status"))

/** The translations of the paragraphs on screen; the line with the subject is reported on its own (subjectLine()). */
function snapshot(root: HTMLElement): Shown[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".tt-translation:not(.tt-subject .tt-translation)"), (el) => ({
    text: translationText(el),
    mode: el.classList.contains("tt-only") ? ("only" as const) : ("bilingual" as const),
    mark: el.classList.contains("tt-provisional") ? ("provisional" as const) : el.classList.contains("tt-fallback") ? ("fallback" as const) : null,
    tags: markup(el).map((child) => child.tagName.toLowerCase()),
    links: Array.from(el.querySelectorAll("a"), (a) => ({ href: a.getAttribute("href") ?? "", rel: a.rel })),
  }))
}

/** The computed style of the first bold text of an AI translation and of its translation element: the style of the translations reaches the rendered elements. */
function renderedStyle(root: HTMLElement) {
  const strong = root.querySelector<HTMLElement>(".tt-translation:not(.tt-subject .tt-translation) strong")
  const block = strong?.closest<HTMLElement>(".tt-translation")
  if (!strong || !block) return null
  const style = (el: Element) => {
    const cs = getComputedStyle(el)
    return { color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight }
  }
  const parent = block.parentElement ? getComputedStyle(block.parentElement).fontSize : ""
  return { block: style(block), strong: style(strong), parentFontSize: parent, scale: getComputedStyle(block).getPropertyValue("--tt-scale").trim() }
}

const send = (msg: E2eMessage) => ext.runtime.sendMessage(msg)

/** The line with the subject above the body: its whole text, the prefixes, the subject and its translation; null without the line. */
function subjectLine() {
  const line = document.querySelector<HTMLElement>(".tt-subject")
  if (!line) return null
  const translation = line.querySelector<HTMLElement>(".tt-translation")
  return {
    first: line === line.parentElement?.firstElementChild,
    text: line.textContent,
    prefix: line.querySelector(".tt-subject-prefix")?.textContent ?? "",
    translation: translation ? translationText(translation) : null,
    tags: translation ? markup(translation).map((child) => child.tagName.toLowerCase()) : [],
    mode: translation?.classList.contains("tt-only") ? "only" : translation ? "bilingual" : null,
    mark: translation?.classList.contains("tt-provisional") ? "provisional" : translation?.classList.contains("tt-fallback") ? "fallback" : null,
  }
}

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

  /** The "consent" scenario: nothing goes out before "Allow and translate", everything after it. */
  async function consent(report: Record<string, unknown>): Promise<void> {
    const { controller } = parts!
    void controller.start()
    await until("the consent panel", () => parts!.consent?.shown === true)
    // Time for a request that must not go out.
    await new Promise((r) => setTimeout(r, 1500))
    const panel = document.querySelector<HTMLElement>(".tt-consent")!
    report.panel = {
      first: panel === root()?.firstElementChild,
      services: Array.from(panel.querySelectorAll("li"), (li) => li.textContent),
      buttons: Array.from(panel.querySelectorAll("button"), (b) => b.textContent),
    }
    report.beforeAllow = { tierResults: events.length, active: controller.active, shown: snapshot(root()!).length }
    report.allowedAt = Date.now()
    panel.querySelector<HTMLButtonElement>("button")!.click()
    await until("the final progress report", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
    await until("the settings with the consent recorded", () => settings?.consent.length === 0)
    report.translated = { state: last, active: controller.active, shown: snapshot(root()!), panelLeft: document.querySelector(".tt-consent") !== null }
  }

  /** A "machine-…" scenario: one translation by the machine translator with a key of its own. */
  async function machine(report: Record<string, unknown>): Promise<void> {
    await parts!.controller.start()
    await until("the final progress report", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
    report.translated = { state: last, shown: snapshot(root()!), subject: subjectLine() }
  }

  /** What the summary panel shows: its place, title, parts with their lines and hover texts, and the copy button. */
  const summaryPanel = () => {
    const el = document.querySelector<HTMLDetailsElement>(".tt-summary")
    if (!el) return null
    return {
      afterSubject: el.previousElementSibling?.classList.contains("tt-subject") === true || el === root()?.firstElementChild,
      open: el.open,
      title: el.querySelector("summary strong")?.textContent ?? "",
      parts: Array.from(el.querySelectorAll("h4"), (h4) => ({ heading: h4.textContent, lines: Array.from(h4.nextElementSibling?.children ?? [], (li) => ({ text: li.textContent, title: (li as HTMLElement).title })) })),
      running: el.textContent?.includes("…") === true && el.querySelectorAll("h4").length === 0,
      copyDisabled: el.querySelector<HTMLButtonElement>("summary button")?.disabled ?? null,
      markup: el.querySelectorAll("img, script, a").length,
    }
  }
  const summaryRequests = () => events.length

  /** The "summary" scenario: the consent panel first, then the panel, the cache and "Regenerate". */
  async function summary(report: Record<string, unknown>): Promise<void> {
    await send({ e2e: "command", command: "summarize" })
    await until("the consent panel", () => parts!.consent?.shown === true)
    await new Promise((r) => setTimeout(r, 1000))
    report.beforeAllow = { panel: summaryPanel(), services: Array.from(document.querySelectorAll(".tt-consent li"), (li) => li.textContent) }
    report.allowedAt = Date.now()
    document.querySelector<HTMLButtonElement>(".tt-consent button")!.click()
    await until("the summary", () => (summaryPanel()?.parts.length ?? 0) > 0)
    report.first = summaryPanel()
    report.firstAt = Date.now()
    await send({ e2e: "command", command: "summarize" })
    await new Promise((r) => setTimeout(r, 500))
    await until("the summary from the cache", () => (summaryPanel()?.parts.length ?? 0) > 0)
    report.cachedAt = Date.now()
    document.querySelectorAll<HTMLButtonElement>(".tt-summary summary button")[1].click()
    await until("the regenerated summary", () => summaryPanel()?.running === true)
    await until("the regenerated summary", () => (summaryPanel()?.parts.length ?? 0) > 0)
    report.regenerated = summaryPanel()
    report.tierResults = summaryRequests()
    await send({ e2e: "screenshot", name: "summary-panel", windowType: "mail:messageWindow" })
  }

  /** What is under the images of the message: the part of the image, its button, consent panel, result and note. */
  const imageSlots = () =>
    Array.from(document.querySelectorAll<HTMLElement>(".tt-image"), (slot) => {
      const before = slot.previousElementSibling
      const img = before?.matches("img") ? before : before?.querySelector("img")
      const result = slot.querySelector<HTMLDetailsElement>(".tt-image-result")
      return {
        part: img?.getAttribute("src")?.match(/[?&]part=([\d.]+)/)?.[1] ?? null,
        button: slot.querySelector(":scope > button")?.textContent ?? null,
        consent: slot.querySelector(".tt-image-consent")?.textContent ?? null,
        result: result && {
          open: result.open,
          title: result.querySelector("summary")?.textContent ?? "",
          header: Array.from(result.querySelectorAll("th"), (th) => th.textContent),
          cells: Array.from(result.querySelectorAll("td"), (td) => td.textContent),
        },
        note: slot.querySelector(".tt-image-note")?.textContent ?? null,
      }
    })
  const imageResults = () => imageSlots().filter((slot) => slot.result).length
  const imageButtons = () => imageSlots().filter((slot) => slot.button)
  /** The images of the message with their part and natural size. */
  const messageImages = () => Array.from(root()!.querySelectorAll("img"), (img) => ({ src: img.getAttribute("src")?.slice(0, 160), width: img.naturalWidth, height: img.naturalHeight }))
  const translated = () => last !== null && last.total > 0 && last.done + last.failed === last.total

  /** The "image-…" scenarios: the buttons, the consent, the results and the modes under the images of image.eml. */
  async function images(report: Record<string, unknown>, scenario: string): Promise<void> {
    const { controller } = parts!
    const body = root()!
    const original = body.innerHTML
    await controller.start()
    await until("the final progress report", translated)
    report.images = messageImages()
    if (scenario === "image-off") {
      await new Promise((r) => setTimeout(r, 1500))
      report.off = { slots: imageSlots(), state: last }
      return
    }
    if (scenario === "image-auto") {
      await until("the result of the chart and the button of the receipt", () => imageResults() === 1 && imageButtons().length === 1)
      report.auto = imageSlots()
      await send({ e2e: "screenshot", name: "image-auto", windowType: "mail:messageWindow" })
      return
    }
    await until("the buttons under the chart and the receipt", () => imageButtons().length === 2)
    report.ask = imageSlots()
    if (scenario === "image-switch") {
      const tierResults = events.length
      report.switchAt = Date.now()
      await send({ e2e: "settings", imageMode: "auto" })
      await until("the results of mode auto", () => settings?.image.mode === "auto" && imageResults() === 2)
      report.auto = imageSlots()
      await send({ e2e: "settings", imageMode: "off" })
      await until("nothing under the images", () => settings?.image.mode === "off" && document.querySelectorAll(".tt-image").length === 0)
      report.offAt = Date.now()
      await send({ e2e: "settings", imageMode: "ask" })
      await until("the results again in mode ask", () => settings?.image.mode === "ask" && imageResults() === 2)
      report.back = imageSlots()
      report.tierResults = events.length - tierResults
      report.state = last
      return
    }
    // "image-ask": the consent first, nothing goes out before it.
    report.clickedAt = Date.now()
    document.querySelector<HTMLButtonElement>(".tt-image > button")!.click()
    await until("the consent panel under the chart", () => document.querySelector(".tt-image-consent") !== null)
    await new Promise((r) => setTimeout(r, 1500))
    const panel = document.querySelector<HTMLElement>(".tt-image-consent")!
    report.panel = { slots: imageSlots(), title: panel.querySelector("strong")?.textContent, lines: Array.from(panel.querySelectorAll("p, li"), (el) => el.textContent), buttons: Array.from(panel.querySelectorAll("button"), (b) => b.textContent) }
    report.allowedAt = Date.now()
    panel.querySelector("button")!.click()
    await until("the result under the chart", () => imageResults() === 1)
    report.first = imageSlots()
    await send({ e2e: "screenshot", name: "image-result", windowType: "mail:messageWindow" })
    document.querySelector<HTMLButtonElement>(".tt-image > button")!.click()
    await until("the result under the receipt", () => imageResults() === 2)
    report.second = imageSlots()
    // Translated again: the cache answers, without a button and without a request.
    controller.stop()
    report.restored = { identical: body.innerHTML === original, leftovers: body.querySelectorAll(".tt-image, .tt-translation").length }
    report.cachedAt = Date.now()
    last = null
    await controller.start()
    await until("the final progress report", translated)
    await until("both results from the cache", () => imageResults() === 2)
    report.cached = imageSlots()
    controller.stop()
  }

  /** The "auto" scenario: automatic translation translates every paragraph; the probe only waits. */
  async function auto(report: Record<string, unknown>, body: HTMLElement): Promise<void> {
    await until("the final progress report of the automatic translation", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
    report.translated = { state: last, active: parts!.controller.active, shown: snapshot(body), subject: subjectLine() }
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
    // Whether the document of the message names its subject: the content script reads it from the background script instead.
    const report: Record<string, unknown> = { hook: E2E_MARKER, url: location.href, events, documentTitle: document.title }
    try {
      if (!body) throw new Error("no message body")
      const scenario = await send({ e2e: "scenario" })
      if (String(scenario).startsWith("image-")) {
        report.scenario = scenario
        await images(report, scenario as string)
        await send({ e2e: "report", report })
        return
      }
      if (scenario === "summary" || String(scenario).startsWith("machine-")) {
        report.scenario = scenario
        await (scenario === "summary" ? summary(report) : machine(report))
        await send({ e2e: "report", report })
        return
      }
      if (scenario === "missing" || scenario === "auto" || scenario === "auto-skip" || scenario === "consent") {
        report.scenario = scenario
        await (scenario === "missing" ? missing(report) : scenario === "auto" ? auto(report, body) : scenario === "consent" ? consent(report) : autoSkip(report))
        await send({ e2e: "report", report })
        return
      }
      const original = body.innerHTML
      report.originalText = body.innerText
      report.originalHtml = original.slice(0, 8000)

      await controller.start()
      // Progress reports are throttled: wait for the one of the finished translation.
      await until("the final progress report", () => last !== null && last.total > 0 && last.done + last.failed === last.total)
      await until("the translated subject", () => subjectLine()?.translation?.startsWith("[AI ") === true)
      report.translated = { state: last, shown: snapshot(body), subject: subjectLine(), style: renderedStyle(body) }
      // The message window with the header and the translated body, the subject line on top.
      const fixture = location.href.includes("plain") ? "plain" : "html"
      await send({ e2e: "screenshot", name: `subject-line-${fixture}-bilingual`, windowType: "mail:messageWindow" })

      phase = "mode"
      await send({ e2e: "command", command: "toggle-display-mode" })
      await until("translation-only mode with AI results", () => {
        const shown = snapshot(body)
        return shown.length > 0 && shown.every((s) => s.mode === "only" && !s.mark) && last !== null && last.total > 0 && last.done === last.total
      })
      report.translationOnly = { state: last, shown: snapshot(body), subject: subjectLine() }
      await send({ e2e: "screenshot", name: `subject-line-${fixture}-translation-only`, windowType: "mail:messageWindow" })

      phase = "restore"
      await send({ e2e: "command", command: "toggle-translation" })
      await until("the original", () => !controller.active && last?.active === false)
      report.restored = {
        state: last,
        identical: body.innerHTML === original,
        leftovers: body.querySelectorAll(".tt-translation, .tt-status, .tt-seg, .tt-subject").length,
        styleLeft: document.getElementById("tt-style-vars") !== null,
        ...(body.innerHTML === original ? {} : { original: original.slice(0, 4000), after: body.innerHTML.slice(0, 4000) }),
      }

      // Translated again: the page and the cache know every paragraph.
      phase = "cached"
      await send({ e2e: "command", command: "toggle-translation" })
      await until("the remembered translation", () => last !== null && last.active && last.total > 0 && last.done === last.total)
      report.cached = { state: last, shown: snapshot(body), subject: subjectLine() }

      // Retranslated: every tier is asked again although everything is cached.
      phase = "retranslate"
      await send({ e2e: "command", command: "retranslate" })
      const total = last!.total
      await until("the AI results of the retranslation", () => events.filter((e) => e.phase === "retranslate" && e.tier === "ai").length >= total && last?.done === total)
      report.retranslated = { state: last, shown: snapshot(body), subject: subjectLine() }
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
