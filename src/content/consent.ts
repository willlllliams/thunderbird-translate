/**
 * Panel above a message that asks before its text first goes to an online
 * service. The background script names the online services of the tiers in
 * use that the user has not allowed yet, with the host each sends to
 * (PublicSettings.consent); the panel lists them, says what is sent (the
 * paragraphs, the whole message with precise translation, or the whole message
 * with sender, date and subject for its summary) and that an
 * API key goes only to its service, and offers "Allow…" and "Cancel".
 * "Allow…" hands the question to the background script, which opens the
 * popup of the message: the user allows there, on a page the message cannot
 * style or cover, and the background script records the answer and sends it
 * back (answer()). Nothing is requested before; the background script
 * refuses such requests as well. The offline tiers need no consent.
 */

import { consentText, mergeTextUses, type TextUse } from "../shared/consent"
import { button, h } from "../shared/dom"
import { t } from "../shared/i18n"
import { type ConsentNeed, consentKey } from "../shared/settings"
import { noticeBox } from "./notice"

const CLS_CONSENT = "tt-consent"

/**
 * The services allowed in a consent panel of this message, each with the host the panel named, before the settings
 * that record them arrive. A service asked for anew, with another host or after the consent was taken back, is asked
 * for again. The text of a message, for its translation and for its summary, keeps one; its images keep another.
 */
export class MessageConsent {
  private readonly keys = new Set<string>()

  allow(need: ConsentNeed): void {
    this.keys.add(consentKey(need))
  }

  allows(need: ConsentNeed): boolean {
    return this.keys.has(consentKey(need))
  }

  /** New settings: what `next` asks for and `prev` did not is asked for again. */
  follow(prev: readonly ConsentNeed[], next: readonly ConsentNeed[]): void {
    const before = new Set(prev.map(consentKey))
    for (const need of next) if (!before.has(consentKey(need))) this.keys.delete(consentKey(need))
  }

  clear(): void {
    this.keys.clear()
  }
}

export interface ConsentDeps {
  root: () => HTMLElement | null
  /** "Allow…": the question goes to the popup of the message, which answers through answer(). */
  review: (needs: ConsentNeed[], uses: TextUse[]) => void
  /** The panel went without an answer of the popup: the popup no longer asks. */
  closed: () => void
}

export class ConsentPanel {
  private el: HTMLElement | null = null
  private resolve: ((allowed: boolean) => void) | null = null
  private pending: Promise<boolean> | null = null
  /** What the open panel shows: every service any open question needs, and what the text is sent for. */
  private needs: ConsentNeed[] = []
  private uses: TextUse[] = []
  /** The popup was asked to show the question. */
  private reviewed = false

  constructor(private readonly deps: ConsentDeps) {}

  /** Whether the panel is on screen; read by the e2e probe. */
  get shown(): boolean {
    return this.el !== null
  }

  /**
   * Show the panel for `needs`; resolves true once the popup allowed them
   * (recorded by the background script), false on "Cancel" here or there,
   * when the panel is cleared, and without a message to show it on. Asked again while it is on screen, it answers with the same promise, and the panel lists the
   * services and the uses of both questions: whoever records an answer of yes records only services the user saw. `focus`: the user
   * asked for it, so the panel takes the focus and scrolls into view; the panel itself takes it, never a button, so
   * no key pressed by chance answers it. A panel that opens by itself leaves the focus where it is.
   */
  ask(needs: ConsentNeed[], use: TextUse, focus = false): Promise<boolean> {
    if (this.pending && this.el) {
      const added = needs.filter((need) => !this.needs.some((shown) => shown.id === need.id))
      const uses = mergeTextUses(this.uses, [use])
      if (added.length > 0 || uses.length > this.uses.length) {
        this.needs = [...this.needs, ...added]
        this.uses = uses
        const focused = this.el.contains(document.activeElement)
        const next = this.render(this.needs, this.uses)
        this.el.replaceWith(next)
        this.el = next
        if (focused) next.focus({ preventScroll: true })
        // The popup shows the question as it is now.
        if (this.reviewed) this.deps.review(this.needs, this.uses)
      }
      if (focus) this.el.focus()
      return this.pending
    }
    const root = this.deps.root()
    if (!root) return Promise.resolve(false)
    this.pending = new Promise<boolean>((resolve) => (this.resolve = resolve))
    this.needs = needs
    this.uses = [use]
    this.el = this.render(needs, this.uses)
    root.prepend(this.el)
    if (focus) this.el.focus()
    return this.pending
  }

  /** The translation stopped or the message went away: the panel goes, and a pending question is answered with no. */
  clear(): void {
    if (this.el) this.deps.closed()
    this.settle(false)
  }

  /** The answer of the popup, recorded by the background script already. */
  answer(allowed: boolean): void {
    this.settle(allowed)
  }

  private settle(allowed: boolean): void {
    this.reviewed = false
    this.el?.remove()
    this.el = null
    this.needs = []
    this.uses = []
    const resolve = this.resolve
    this.resolve = null
    this.pending = null
    resolve?.(allowed)
  }

  private render(needs: ConsentNeed[], uses: TextUse[]): HTMLElement {
    const text = consentText({ kind: "text", needs, uses })
    const allow = button(t("consentReview"), () => {
      this.reviewed = true
      this.deps.review(this.needs, this.uses)
    }, true, t("tipConsentReview"))
    const cancel = button(t("consentCancel"), () => {
      this.deps.closed()
      this.settle(false)
    }, false, t("tipConsentCancel"))
    return noticeBox(
      "div",
      CLS_CONSENT,
      text.title,
      { tabindex: "-1" },
      h("strong", { text: text.title }),
      ...text.before.map((line) => h("p", { text: line })),
      h("ul", {}, ...text.services.map((line) => h("li", { text: line }))),
      ...text.after.map((line) => h("p", { text: line })),
      h("div", { className: "tt-notice-actions" }, allow, cancel),
    )
  }
}
