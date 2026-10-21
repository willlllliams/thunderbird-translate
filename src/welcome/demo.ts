/**
 * Tiers step of the welcome page.
 *
 * - The demo translates a sample paragraph the way the chosen tiers work
 *   together: the content script's renderer shows the dictionary result at
 *   once, the machine translation after 0.3 s and the AI translation 1.5 s
 *   later; the lower results carry the provisional mark with the name of
 *   their tier, as in a message, and the highest one is drawn as final.
 *   The texts come from the locale; nothing is requested.
 * - The tour points at the three tier selectors one after the other: a ring
 *   and a shade around the selector, a tip under it with "Next" and "Skip".
 */

import type { Unit } from "../content/paragraphs"
import { Renderer, setStyleVars } from "../content/render"
import { type MessageKey, t } from "../shared/i18n"
import { $ } from "../shared/page"
import { getPreset, providerDisplayName, type Tier, TIER_NAME_KEYS, TIERS } from "../shared/providers"
import { enabledTiers, type Settings } from "../shared/settings"
import { h } from "../shared/dom"

/** When the result of each tier appears, in ms after the start. */
export const DEMO_TIMES: Record<Tier, number> = { dictionary: 0, machine: 300, ai: 1800 }

const DEMO_TEXT: Record<Tier, MessageKey> = { dictionary: "demoDictionary", machine: "demoMachine", ai: "demoAi" }
const TOUR_TEXT: Record<Tier, MessageKey> = { dictionary: "spotlightDictionary", machine: "spotlightMachine", ai: "spotlightAi" }

/** The system asks for less motion: the demo shows its final state at once. */
const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

export class TierDemo {
  private timers: ReturnType<typeof setTimeout>[] = []

  constructor(
    private readonly box: HTMLElement,
    private readonly status: HTMLElement,
  ) {}

  /** Stop the playback; what is shown stays. */
  stop(): void {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  /** Play the sample with the tiers, display mode and style of the settings. */
  play(settings: Settings): void {
    this.stop()
    const p = h("p", { text: t("demoSource") })
    this.box.replaceChildren(p)
    setStyleVars(this.box, settings.style)
    const tiers = enabledTiers(settings.tiers)
    const top = tiers.at(-1)
    if (!top) return void (this.status.textContent = t("tiersEmpty"))
    const renderer = new Renderer(document)
    renderer.stylePreset = settings.style.preset
    const unit: Unit = { el: p, text: t("demoSource"), pre: false }
    const show = (tier: Tier) => {
      const service = providerDisplayName(getPreset(settings.tiers[tier]!)!)
      const mark = tier === top ? undefined : { kind: "provisional" as const, label: t(TIER_NAME_KEYS[tier]), title: t("statusProvisionalHint", [t(TIER_NAME_KEYS[top])]) }
      renderer.showTranslation(unit, t(DEMO_TEXT[tier]), settings.mode, undefined, mark)
      this.status.textContent = `${t("tierLabel", [TIERS.indexOf(tier) + 1, t(TIER_NAME_KEYS[tier])])} · ${service}`
    }
    if (reducedMotion()) return show(top)
    renderer.showLoading(unit, t("statusTranslating"))
    this.status.textContent = t("statusTranslating")
    for (const tier of tiers) this.timers.push(setTimeout(() => show(tier), DEMO_TIMES[tier]))
  }
}

/**
 * Tour of the tier selectors (elements "tier-<tier>" inside a wrapper each,
 * the tip "tourTip" with "tourText", "tourSkip" and "tourNext"). Esc skips,
 * Enter goes on, and so does choosing a service in the selector shown.
 * `closed` runs when the user ends the tour.
 */
export class TierTour {
  private index = -1
  /** Focus before the tour, given back when the tour ends from its tip. */
  private back: Element | null = null
  private readonly tip = $("tourTip")
  private readonly text = $("tourText")
  private readonly nextButton = $("tourNext")
  /** The wrapper of each tier selector, which gets the ring and the tip. */
  private readonly stops = TIERS.map((tier) => $(`tier-${tier}`).closest("div")!)
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close()
    // Enter on a control does what the control does, e.g. the tip's own buttons. Elsewhere it goes on, and the
    // default action is cancelled: the focus moves to "Next", which would take the same key press as a click.
    else if (e.key === "Enter" && !(e.target as Element).closest("button, select, input, a")) {
      e.preventDefault()
      this.next()
    }
  }

  constructor(private readonly closed: () => void) {
    this.nextButton.addEventListener("click", () => this.next())
    $("tourSkip").addEventListener("click", () => this.close())
  }

  /** Start at the first selector; an open tour stays where it is and is drawn again, e.g. in another language. */
  start(): void {
    if (this.index >= 0) return this.draw()
    this.back = document.activeElement
    document.addEventListener("keydown", this.onKey)
    this.show(0)
  }

  /** A service was chosen for `tier`: the tour goes on when it shows that selector. */
  chosen(tier: Tier): void {
    if (TIERS[this.index] === tier) this.next()
  }

  next(): void {
    if (this.index < TIERS.length - 1) this.show(this.index + 1)
    else this.close()
  }

  /** End the tour; `user` = false when the page goes away: the tour has not been closed by the user. */
  close(user = true): void {
    if (this.index < 0) return
    if (this.tip.contains(document.activeElement)) (this.back as HTMLElement | null)?.focus()
    this.stops[this.index].classList.remove("spotlight")
    this.tip.hidden = true
    this.index = -1
    document.removeEventListener("keydown", this.onKey)
    if (user) this.closed()
  }

  private show(index: number): void {
    this.stops[this.index]?.classList.remove("spotlight")
    this.index = index
    this.draw()
    this.nextButton.focus()
  }

  private draw(): void {
    const stop = this.stops[this.index]
    stop.classList.add("spotlight")
    stop.append(this.tip)
    this.tip.hidden = false
    this.text.textContent = t(TOUR_TEXT[TIERS[this.index]])
    const last = this.index === TIERS.length - 1
    this.nextButton.textContent = t(last ? "noticeClose" : "buttonNext")
    this.nextButton.title = t(last ? "tipTourEnd" : "tipTourNext")
    stop.scrollIntoView?.({ block: "nearest" })
  }
}
