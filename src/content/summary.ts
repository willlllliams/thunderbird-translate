/**
 * The summary and to-dos of the displayed message, in a panel at the top of
 * the body, under the line with the subject: the summary, the to-dos (who,
 * what, by when, with the words each rests on as hover text), the questions
 * the reader should answer, and the dates and meetings. An empty part is
 * left out. The background script asks the AI service and reads its JSON
 * answer (background/summary.ts); the panel draws it with DOM nodes only and
 * writes it as Markdown for "Copy as Markdown". It is a collapsible
 * <details>, expanded unless the settings say otherwise, and stays until
 * "Close": turning the translation off leaves it. A small "Summary" button
 * above a translated message opens it, when the settings ask for it.
 */

import { button, h } from "../shared/dom"
import { getI18n, type MessageKey, t } from "../shared/i18n"
import { type MailSummary, SUMMARY_ME, type SummaryResponse } from "../shared/summary"
import { CLS_NOTICE, CLS_SUBJECT } from "./paragraphs"

export const CLS_SUMMARY = "tt-summary"
const CLS_SUMMARY_BUTTON = "tt-summary-button"

/** Put `el` at the top of the body, under the line with the subject when there is one. */
function placeAtTop(root: HTMLElement, el: HTMLElement): void {
  const subject = Array.from(root.children).find((child) => child.classList.contains(CLS_SUBJECT))
  if (subject) subject.after(el)
  else root.prepend(el)
}

const who = (name: string) => (name.toLowerCase() === SUMMARY_ME ? t("summaryMe") : name)
const joined = (...parts: string[]) => parts.filter(Boolean).join(" · ")

/** The lines of each part, as the panel and the Markdown show them; `strong` is the person in front of a line. */
function partLines(summary: MailSummary): [MessageKey, { strong?: string; text: string; title?: string }[]][] {
  return [
    ["summaryPartSummary", summary.summary.map((text) => ({ text }))],
    ["summaryPartActions", summary.actions.map((a) => ({ strong: who(a.who), text: a.due || a.dueText ? `${a.task} (${t("summaryDue", [joined(a.due, a.dueText)])})` : a.task, title: a.quote }))],
    ["summaryPartQuestions", summary.questions.map((q) => ({ strong: q.from, text: q.question }))],
    ["summaryPartDates", summary.dates.map((d) => ({ text: joined(d.what, d.when, d.where) }))],
  ]
}

/** The summary as Markdown: a heading per part that has lines, a list item per line. */
export function summaryMarkdown(summary: MailSummary): string {
  return partLines(summary)
    .filter(([, lines]) => lines.length > 0)
    .map(([key, lines]) => [`## ${t(key)}`, ...lines.map((line) => `- ${line.strong ? `**${line.strong}**: ` : ""}${line.text}`)].join("\n"))
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
      this.el = h("details", { className: `${CLS_NOTICE} ${CLS_SUMMARY}`, open: !this.deps.collapsed(), lang: getI18n().lang, dir: getI18n().dir })
      placeAtTop(root, this.el)
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
    this.el?.remove()
    this.el = null
  }

  /** The title line with its buttons, then `body`; "Copy as Markdown" needs a summary. */
  private draw(service: string | undefined, body: HTMLElement[], summary?: MailSummary): void {
    const el = this.el!
    // A button in the title line must not open or close the panel.
    const action = (key: MessageKey, tip: MessageKey, run: () => void) => {
      const b = button(t(key), run, false, t(tip))
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
  }

  /** A heading and a list per part that has lines; a line about nothing found when none has. */
  private parts(summary: MailSummary): HTMLElement[] {
    const parts = partLines(summary).filter(([, lines]) => lines.length > 0)
    if (parts.length === 0) return [h("p", { text: t("summaryEmpty") })]
    return parts.flatMap(([key, lines]) => [
      h("h4", { text: t(key) }),
      h("ul", {}, ...lines.map((line) => h("li", { dir: "auto", title: line.title || undefined }, line.strong ? h("strong", {}, `${line.strong}: `) : null, line.text))),
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
    this.el = h("div", { className: `${CLS_NOTICE} ${CLS_SUMMARY_BUTTON}` }, button(t("summaryButton"), this.deps.onClick, false, t("tipSummaryButton")))
    placeAtTop(root, this.el)
  }
}
