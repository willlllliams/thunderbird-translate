/**
 * Notice above a message whose paragraphs an offline tier (dictionary,
 * Bergamot) could not translate because a dictionary pack or offline model
 * is not installed.
 *
 * The controller opens a round when a translation starts, reports every
 * paragraph that failed for lack of data (the background script names the
 * service, the language pair and what to download; network errors and
 * pairs without anything to download carry no such report) and closes the
 * round when every paragraph has its answers. After the first complete
 * round of a message the notice appears if anything not muted is missing:
 * one line per service and language pair, a button to the settings page
 * with both offline lists filtered to the missing items, a check box that
 * mutes the listed entries, and a close button. It appears at most once per
 * message; a retranslation brings a notice still on screen back after its
 * round, and a closed one stays away. The paragraphs themselves still get
 * the other tiers' translations.
 */

import { h } from "../options/dom"
import type { MissingData } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import type { BackgroundRequest } from "../shared/messages"
import { CLS_NOTICE } from "./paragraphs"

export interface NoticeDeps {
  root: () => HTMLElement | null
  /** Muted entries of the settings ("dictionary:ja>zh-Hans"). */
  muted: () => string[]
  send: (req: BackgroundRequest) => void
}

/** Key of a notice entry, as muted in the settings. */
export const muteKey = ({ service, pair }: Pick<MissingData, "service" | "pair">) => `${service}:${pair}`

export class MissingNotice {
  /** What the last complete round lacked, muted entries left out; read by the e2e probe. */
  lastRound: MissingData[] = []
  /** Entries of the running round by muteKey(). */
  private entries = new Map<string, MissingData>()
  private open = false
  /** The first round of the message is complete: the notice was shown or is not needed. */
  private decided = false
  private el: HTMLElement | null = null

  constructor(private readonly deps: NoticeDeps) {}

  /** A translation of the message starts. */
  begin(): void {
    this.entries.clear()
    this.open = true
  }

  add(missing: MissingData): void {
    if (!this.open) return
    const key = muteKey(missing)
    const known = this.entries.get(key)
    this.entries.set(key, { ...missing, models: [...new Set([...(known?.models ?? []), ...missing.models])] })
  }

  /** Every paragraph has its answers. */
  end(): void {
    if (!this.open) return
    this.open = false
    const muted = new Set(this.deps.muted())
    this.lastRound = [...this.entries.values()].filter((e) => !muted.has(muteKey(e)))
    if (this.decided) return
    this.decided = true
    const root = this.deps.root()
    if (this.lastRound.length === 0 || !root) return
    this.el = this.render(this.lastRound)
    root.prepend(this.el)
  }

  /** The translation stopped: the notice goes away. `again`: for a retranslation, after whose round a notice on screen appears again. */
  clear(again = false): void {
    this.open = false
    if (again && this.el) this.decided = false
    this.el?.remove()
    this.el = null
  }

  private render(entries: MissingData[]): HTMLElement {
    const i18n = getI18n()
    const list = (items: string[]) => new Intl.ListFormat(i18n.lang, { type: "conjunction" }).format(items.map((m) => i18n.pairName(m)))
    const lines = entries.map((e) => h("li", { text: t(e.service === "dictionary" ? "noticeMissingDictionary" : "noticeMissingBergamot", [i18n.pairName(e.pair), list(e.models)]) }))
    const models = (service: MissingData["service"]) => [...new Set(entries.filter((e) => e.service === service).flatMap((e) => e.models))]

    const open = h("button", { type: "button", text: t("noticeOpenSettings") })
    open.addEventListener("click", () => {
      const [dictionaries, bergamot] = [models("dictionary"), models("bergamot")]
      this.deps.send({ type: "openOptions", place: { section: dictionaries.length > 0 ? "dictionaries" : "bergamot", dictionaries, bergamot } })
    })
    const mute = h("input", { type: "checkbox" })
    mute.addEventListener("change", () => this.deps.send({ type: "muteOfflinePairs", pairs: entries.map(muteKey), muted: mute.checked }))
    const close = h("button", { type: "button", text: t("noticeClose") })
    close.addEventListener("click", () => this.clear())

    return h(
      "div",
      { className: CLS_NOTICE, role: "region", "aria-label": t("noticeMissingTitle"), lang: i18n.lang, dir: i18n.dir },
      h("strong", { text: t("noticeMissingTitle") }),
      h("ul", {}, ...lines),
      h("p", { text: t("noticeMissingHint") }),
      h("div", { className: "tt-notice-actions" }, open, h("label", {}, mute, h("span", { text: t("noticeMute") })), close),
    )
  }
}
