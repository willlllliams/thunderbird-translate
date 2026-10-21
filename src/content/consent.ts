/**
 * Panel above a message that asks before its text first goes to an online
 * service; the page of translated subjects shows the same panel above its
 * list, with a title and first sentence about the subjects. The background script names the online services of the tiers in
 * use that the user has not allowed yet, with the host each sends to
 * (PublicSettings.consent); the panel lists them, says what is sent (the
 * paragraphs, or the whole message with precise translation) and that an
 * API key goes only to its service, and offers "Allow and translate" and
 * "Cancel". Nothing is requested before the user allows it; the background
 * script refuses such requests as well. The offline tiers need no consent.
 */

import { button, h } from "../shared/dom"
import { getI18n, t } from "../shared/i18n"
import { getPreset, providerDisplayName } from "../shared/providers"
import type { ConsentNeed } from "../shared/settings"
import { noticeBox } from "./notice"

const CLS_CONSENT = "tt-consent"

export interface ConsentDeps {
  root: () => HTMLElement | null
  /** The page of translated subjects: the title and first sentence name the subjects instead of the paragraphs of a message. */
  subjects?: boolean
}

export class ConsentPanel {
  private el: HTMLElement | null = null
  private answer: ((allowed: boolean) => void) | null = null
  private pending: Promise<boolean> | null = null
  /** What the open panel shows: every service any open question needs, and whether one of them sends the whole message. */
  private needs: ConsentNeed[] = []
  private precise = false

  constructor(private readonly deps: ConsentDeps) {}

  /** Whether the panel is on screen; read by the e2e probe. */
  get shown(): boolean {
    return this.el !== null
  }

  /**
   * Show the panel for `needs`; resolves true on "Allow and translate",
   * false on "Cancel", when the panel is cleared, and without a message to
   * show it on. Asked again while it is on screen, it answers with the same promise, and the panel lists the
   * services of both questions: whoever records an answer of yes records only services the user saw.
   */
  ask(needs: ConsentNeed[], precise: boolean): Promise<boolean> {
    if (this.pending && this.el) {
      const added = needs.filter((need) => !this.needs.some((shown) => shown.id === need.id))
      if (added.length > 0 || (precise && !this.precise)) {
        this.needs = [...this.needs, ...added]
        this.precise ||= precise
        const focused = this.el.contains(document.activeElement)
        const next = this.render(this.needs, this.precise)
        this.el.replaceWith(next)
        this.el = next
        if (focused) next.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true })
      }
      return this.pending
    }
    const root = this.deps.root()
    if (!root) return Promise.resolve(false)
    this.pending = new Promise<boolean>((resolve) => (this.answer = resolve))
    this.needs = needs
    this.precise = precise
    this.el = this.render(needs, precise)
    root.prepend(this.el)
    this.el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true })
    return this.pending
  }

  /** The translation stopped or the message went away: the panel goes, and a pending question is answered with no. */
  clear(): void {
    this.settle(false)
  }

  private settle(allowed: boolean): void {
    this.el?.remove()
    this.el = null
    this.needs = []
    this.precise = false
    const answer = this.answer
    this.answer = null
    this.pending = null
    answer?.(allowed)
  }

  private render(needs: ConsentNeed[], precise: boolean): HTMLElement {
    const i18n = getI18n()
    const services = needs.map(({ id, host }) => {
      const preset = getPreset(id)
      const name = preset ? providerDisplayName(preset, i18n) : id
      return h("li", { text: host ? t("consentService", [name, host]) : name })
    })
    const allow = button(t("consentAllow"), () => this.settle(true), true, t("tipConsentAllow"))
    const cancel = button(t("consentCancel"), () => this.settle(false), false, t("tipConsentCancel"))
    const title = t(this.deps.subjects ? "consentSubjectsTitle" : "consentTitle")
    const body = t(this.deps.subjects ? "consentSubjectsBody" : precise ? "consentBodyPrecise" : "consentBody")
    return noticeBox(
      "div",
      CLS_CONSENT,
      title,
      {},
      h("strong", { text: title }),
      h("p", { text: body }),
      h("ul", {}, ...services),
      h("p", { text: t("consentKey") }),
      h("div", { className: "tt-notice-actions" }, allow, cancel),
    )
  }
}
