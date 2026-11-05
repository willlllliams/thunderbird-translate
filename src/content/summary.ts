/**
 * The summary and to-dos of the displayed message, in a panel at the top of
 * the body: the summary, the to-dos (who,
 * what, by when, with the words each rests on as hover text), the questions
 * the reader should answer, and the dates and meetings. An empty part is
 * left out. The background script asks the AI service and reads its JSON
 * answer (background/summary.ts); the panel draws it with DOM nodes only and
 * writes it as Markdown for "Copy as Markdown". It is a collapsible
 * <details>, expanded unless the settings say otherwise, and stays until
 * "Close": turning the translation off leaves it. A small "Summary" button
 * above a translated message opens it, when the settings ask for it.
 */

import type { TextUse } from "../shared/consent"
import { button, h } from "../shared/dom"
import { type MessageKey, t } from "../shared/i18n"
import { textDirection } from "../shared/locales"
import type { ConsentNeed, PublicSettings } from "../shared/settings"
import { type MailSummary, SUMMARY_ME, type SummaryResponse } from "../shared/summary"
import { hasTranslatableText } from "../shared/text"
import type { MessageConsent } from "./consent"
import { noticeBox } from "./notice"

const CLS_SUMMARY = "tt-summary"
const CLS_SUMMARY_BUTTON = "tt-summary-button"

const who = (name: string) => (name.toLowerCase() === SUMMARY_ME ? t("summaryMe") : name)
const joined = (...parts: string[]) => parts.filter(Boolean).join(" · ")

/** The lines of each part, as the panel and the Markdown show them; `strong` is the person in front of a line. */
function partLines(summary: MailSummary): [MessageKey, { strong?: string; text: string; title?: string }[]][] {
  return [
    ["summaryPartSummary", summary.summary.map((text) => ({ text }))],
    [
      "summaryPartActions",
      summary.actions.map((a) => {
        const task = a.due || a.dueText ? `${a.task} (${t("summaryDue", [joined(a.due, a.dueText)])})` : a.task
        return { strong: who(a.who), text: a.unverified ? `${task} · ${t("summaryUnverified")}` : task, title: a.unverified ? t("tipSummaryUnverified") : a.quote }
      }),
    ],
    ["summaryPartQuestions", summary.questions.map((q) => ({ strong: q.from, text: q.question }))],
    ["summaryPartDates", summary.dates.map((d) => ({ text: joined(d.what, d.when, d.where) }))],
  ]
}

/** A line of the summary as one Markdown line: line breaks become spaces, and the characters that mark Markdown are escaped. */
const markdownLine = (text: string) => text.replace(/\s*\n\s*/g, " ").replace(/[\\`*_]/g, "\\$&")

/** The summary as Markdown: a heading per part that has lines, a list item per line. */
export function summaryMarkdown(summary: MailSummary): string {
  return partLines(summary)
    .filter(([, lines]) => lines.length > 0)
    .map(([key, lines]) => [`## ${t(key)}`, ...lines.map((line) => `- ${line.strong ? `**${markdownLine(line.strong)}**: ` : ""}${markdownLine(line.text)}`)].join("\n"))
    .join("\n\n")
}

/** Text on the clipboard: the Clipboard API, else a selected text area and the copy command; whether it got there. */
async function copyText(doc: Document, text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = Object.assign(doc.createElement("textarea"), { value: text, readOnly: true })
    area.style.cssText = "position:fixed;opacity:0"
    doc.body.append(area)
    area.select()
    try {
      return doc.execCommand("copy")
    } catch {
      return false
    } finally {
      area.remove()
    }
  }
}

export interface SummaryPanelDeps {
  root: () => HTMLElement | null
  /** The summary from the background script; `fresh`: generated again, past the cache. */
  request: (fresh: boolean) => Promise<SummaryResponse>
  /** The panel opens collapsed. */
  collapsed: () => boolean
  /** The language the summary is written in, the target language; none: the lines take the direction of their text. */
  lang?: () => string | undefined
}

export class SummaryPanel {
  private el: HTMLDetailsElement | null = null
  /** Counts the requests: only the answer of the latest one is drawn. */
  private run = 0

  constructor(private readonly deps: SummaryPanelDeps) {}

  /** The panel is on screen; read by the e2e probe. */
  get shown(): boolean {
    return this.el !== null
  }

  /** Shows the panel, or brings it back, and asks for the summary; `fresh` generates it again. */
  async show(fresh = false): Promise<void> {
    const root = this.deps.root()
    if (!root) return
    const run = ++this.run
    if (!this.el) {
      this.el = noticeBox("details", CLS_SUMMARY, null, { open: !this.deps.collapsed() })
      root.prepend(this.el)
    }
    this.draw(undefined, [h("p", { text: t("summaryRunning") })])
    const result = await this.deps.request(fresh)
    if (run !== this.run || !this.el) return
    if (!result.ok) return this.draw(result.service, result.error.split("\n").map((line) => h("p", { className: "tt-error", text: line })))
    if (!result.summary) return this.draw(result.service, [h("p", { text: t("summaryUnreadable") }), h("pre", { text: result.raw })])
    this.draw(result.service, this.parts(result.summary), result.summary)
  }

  /** Removes the panel; an answer still on its way is dropped. */
  close(): void {
    this.run++
    const el = this.el
    // The panel that had the focus is gone: the "Summary" button takes it.
    const focused = el?.contains(el.ownerDocument.activeElement) === true
    el?.remove()
    this.el = null
    if (focused) this.deps.root()?.ownerDocument.querySelector<HTMLElement>(`.${CLS_SUMMARY_BUTTON} button`)?.focus({ preventScroll: true })
  }

  /** The title line with its buttons, then `body`; "Copy as Markdown" needs a summary. A button or the title line that had the focus has it again. */
  private draw(service: string | undefined, body: HTMLElement[], summary?: MailSummary): void {
    const el = this.el!
    const active = el.contains(el.ownerDocument.activeElement) ? (el.ownerDocument.activeElement as HTMLElement) : null
    /** The action of the button that had the focus; empty for the title line or the text; null when the panel had none. */
    const focused = active ? (active.dataset.action ?? "") : null
    // A button in the title line must not open or close the panel.
    const action = (key: MessageKey, tip: MessageKey, run: () => void) => {
      const b = button(t(key), run, false, t(tip))
      b.dataset.action = key
      b.addEventListener("click", (event) => event.preventDefault())
      return b
    }
    // Disabled without a summary.
    const copy = action("summaryCopy", "tipSummaryCopy", () =>
      void copyText(el.ownerDocument, summaryMarkdown(summary!)).then((ok) => {
        copy.textContent = t(ok ? "summaryCopied" : "summaryCopyFailed")
        // The text area of the copy command took the focus.
        copy.focus()
      }),
    )
    copy.disabled = !summary
    const title = service ? t("summaryTitleService", [service]) : t("summaryTitle")
    el.replaceChildren(
      h(
        "summary",
        { title: t("tipSummaryPanel") },
        h("strong", { text: title }),
        h("span", { className: "tt-notice-actions" }, copy, action("summaryRegenerate", "tipSummaryRegenerate", () => void this.show(true)), action("noticeClose", "tipSummaryClose", () => this.close())),
      ),
      ...body,
    )
    if (focused === null) return
    // "Copy" waits disabled for the summary: the title line takes the focus meanwhile.
    const again = focused ? el.querySelector<HTMLButtonElement>(`[data-action="${focused}"]`) : null
    ;(again && !again.disabled ? again : el.querySelector("summary"))?.focus({ preventScroll: true })
  }

  /** The language and direction of a line of the summary. */
  private direction(): { dir: string; lang?: string } {
    const lang = this.deps.lang?.()
    return lang ? { dir: textDirection(lang), lang } : { dir: "auto" }
  }

  /** A heading and a list per part that has lines; a line about nothing found when none has. */
  private parts(summary: MailSummary): HTMLElement[] {
    const parts = partLines(summary).filter(([, lines]) => lines.length > 0)
    if (parts.length === 0) return [h("p", { text: t("summaryEmpty") })]
    return parts.flatMap(([key, lines]) => [
      h("h4", { text: t(key) }),
      h("ul", {}, ...lines.map((line) => h("li", { ...this.direction(), title: line.title || undefined }, line.strong ? h("strong", {}, `${line.strong}: `) : null, line.text))),
    ])
  }
}

/** The "Summary" button above a translated message. */
export class SummaryButton {
  private el: HTMLElement | null = null

  constructor(private readonly deps: { root: () => HTMLElement | null; onClick: () => void }) {}

  /** Shows the button, or removes it. */
  sync(show: boolean): void {
    if (!show) {
      this.el?.remove()
      this.el = null
      return
    }
    const root = this.deps.root()
    if (this.el || !root) return
    this.el = noticeBox("div", CLS_SUMMARY_BUTTON, null, {}, button(t("summaryButton"), this.deps.onClick, false, t("tipSummaryButton")))
    root.prepend(this.el)
  }
}

export interface SummaryOpenerDeps {
  panel: SummaryPanel
  /** The consent panel of the message and the services allowed in it, which its translation uses as well. */
  consent: { ask(needs: ConsentNeed[], use: TextUse, focus: boolean): Promise<boolean> }
  allowed: MessageConsent
  /** The settings applied last. */
  current: () => PublicSettings | null
  messageText: () => string
}

/**
 * Opens the summary of the message: for a click or command of the user, and by itself when the settings ask for it
 * (Settings.summary.auto), once per message and only for a message with text. The first time, the service of the
 * summary is asked in the consent panel of the message, which its translation shares.
 */
export function summaryOpener({ panel, consent, allowed, current, messageText }: SummaryOpenerDeps): { open: (byUser: boolean) => Promise<void>; auto: () => void } {
  /** The summary opened by itself for this message, or the user's answer to its consent panel: it is not asked for again. */
  let autoSummarized = false
  /** `byUser`: asked for by the user, not by itself. */
  const open = async (byUser: boolean) => {
    const s = current()
    const need = s?.summary.available ? s.summary.consent : undefined
    if (need === undefined) return
    if (need && !allowed.allows(need)) {
      if (!(await consent.ask([need], "summary", byUser))) return
      allowed.allow(need)
    }
    await panel.show()
  }
  return {
    open,
    auto() {
      if (autoSummarized || panel.shown || !hasTranslatableText(messageText())) return
      autoSummarized = true
      void open(false)
    },
  }
}
