/**
 * What the two offline lists of the settings page and the welcome page
 * share: the dictionary packs (dictionaries.ts) and the offline models
 * (bergamot.ts).
 *
 * A list shows every direction of its catalog and the installed ones. The
 * directions of the recommended languages (recommendedFor()) come first,
 * labelled with where the language comes from, then the others by name; a
 * filter narrows the list down. "Download common languages" shows the
 * directions of COMMON_LANGUAGES that are not installed and their size, and
 * downloads them once confirmed. Downloads run two at a time, and the list
 * is read again once they have ended. A direction waiting for its turn
 * reads "Waiting" with a Cancel that takes it off the queue; a queued or
 * running direction is not downloaded a second time. On the welcome page
 * every direction that is not installed has a check box for the page's "Download selected": with
 * automatic detection the directions of the recommended languages are
 * ticked, with a fixed source language the ones the language pair needs.
 */

import { ext } from "../shared/ext"
import { getI18n, type MessageKey, t } from "../shared/i18n"
import { localeToLanguageTag } from "../shared/locales"
import { commonDirections, itemSources, type LanguageSource, type OfflineService, orderItems, pairNeeds, recommendedLanguages, serviceLang, type SourcedLanguage } from "../shared/offline-needs"
import type { Settings } from "../shared/settings"
import { button, h, setTitle } from "../shared/dom"

/** A direction of a list. */
export interface ListItem {
  /** "en>zh-Hans" */
  id: string
  src: string
  tgt: string
  bytes: number
  installed: boolean
}

export interface OfflineListDeps {
  list: HTMLElement
  status: HTMLElement
  /** Where "Download common languages" and its confirmation go. */
  common: HTMLElement
  filter?: HTMLInputElement
  /** Source ("auto" or a code) and target language of the settings. */
  languages: () => { source: string; target: string }
  /** The recommended languages (recommendedFor()). */
  recommended: () => readonly SourcedLanguage[]
  /** Welcome page: check boxes for "Download selected" instead of download buttons. */
  pick?: boolean
  /** Runs after every redraw, e.g. to update the page's "Download selected" button. */
  onRender?: () => void
}

const SOURCE_KEYS: Record<LanguageSource, MessageKey> = {
  target: "langSourceTarget",
  source: "langSourceSource",
  addon: "langSourceAddon",
  thunderbird: "langSourceThunderbird",
  system: "langSourceSystem",
}

/** Hover text of each source label. */
const SOURCE_TIPS: Record<LanguageSource, MessageKey> = {
  target: "tipLangTarget",
  source: "tipLangSource",
  addon: "tipLangAddon",
  thunderbird: "tipLangThunderbird",
  system: "tipLangSystem",
}

export const megabytes = (bytes: number) => (bytes / 1048576).toFixed(1)

let systemLanguages: string[] = []

/** Read the system's preferred languages, once per page. */
export async function loadSystemLanguages(): Promise<void> {
  const i18n = ext.i18n as typeof ext.i18n & { getPreferredSystemLanguages?: () => Promise<string[]> }
  // Older Thunderbird versions lack getPreferredSystemLanguages(), and it can fail or answer nothing; then the locale of the Intl formats, which follows the system, stands in for it.
  const preferred = (await i18n.getPreferredSystemLanguages?.().catch(() => undefined)) ?? []
  systemLanguages = preferred.length > 0 ? preferred : [Intl.DateTimeFormat().resolvedOptions().locale]
}

/** The recommended languages: target and fixed source language, the extension's interface language ("follow Thunderbird": Thunderbird's), Thunderbird's and the system's. */
export function recommendedFor(s: Pick<Settings, "sourceLang" | "targetLang" | "uiLanguage">): SourcedLanguage[] {
  const thunderbird = ext.i18n.getUILanguage()
  return recommendedLanguages({
    target: [s.targetLang],
    source: [s.sourceLang],
    addon: [s.uiLanguage === "auto" ? thunderbird : localeToLanguageTag(s.uiLanguage)],
    thunderbird: [thunderbird],
    system: systemLanguages,
  })
}

export abstract class OfflineList<T extends ListItem> {
  protected abstract readonly service: OfflineService
  protected loading = true
  protected listError = ""
  protected rowErrors = new Map<string, string>()
  /** Check boxes the user changed, by id. */
  private choice = new Map<string, boolean>()
  /** "Download common languages" shows its confirmation. */
  private confirmingCommon = false
  /** Directions waiting for their turn to download, by id. */
  protected readonly queued = new Set<string>()

  constructor(private readonly base: OfflineListDeps) {}

  /** The catalog and the installed directions. */
  protected abstract items(): T[]
  /** Download (or update) a direction; a failure goes to rowErrors. Through installAll(), which reads the list again. */
  protected abstract install(item: T): Promise<void>
  /** Read the list again after downloads. */
  protected abstract reload(): Promise<void>
  /** Queued or downloading. */
  protected abstract installing(item: T): boolean
  /** Size, state and buttons of a row, after its name and labels. */
  protected abstract details(item: T): (Node | null)[]
  /** Status line while the list loads, and when the catalog is empty. */
  protected abstract statusText(): { loading: string; empty: string }

  /** The directions the language pair of the settings uses; with automatic detection, those from English. */
  protected required(): string[] {
    const { source, target } = this.base.languages()
    const items = this.items()
    const catalog = items.length > 0 ? new Set(items.map((i) => i.id)) : null
    const installed = new Set(items.filter((i) => i.installed).map((i) => i.id))
    return pairNeeds(this.service, source === "auto" ? "en" : source, target, catalog, installed).required
  }

  private sources(item: T): LanguageSource[] {
    return itemSources(this.service, item.id, this.base.recommended())
  }

  private checked(item: T, required: string[]): boolean {
    const chosen = this.choice.get(item.id)
    if (chosen !== undefined) return chosen
    return this.base.languages().source === "auto" ? this.sources(item).length > 0 : required.includes(item.id)
  }

  /** Welcome page: the ticked directions that are not installed. */
  picked(): T[] {
    const required = this.required()
    return this.items().filter((i) => !i.installed && !this.installing(i) && this.checked(i, required))
  }

  /** Welcome page: download the ticked directions; resolves with the number of failures. */
  async downloadPicked(): Promise<number> {
    const picked = this.picked()
    await this.installAll(picked)
    return picked.filter((i) => this.rowErrors.has(i.id)).length
  }

  /** Download the directions that are neither queued nor running, two at a time, then read the list once. */
  protected async installAll(items: readonly T[]): Promise<void> {
    const queue = items.filter((i) => !this.installing(i))
    for (const item of queue) this.queued.add(item.id)
    this.render()
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        // Skipped when taken off the queue, or installed since it was queued.
        if (!this.queued.delete(item.id) || (!item.installed && this.items().some((i) => i.id === item.id && i.installed))) continue
        await this.install(item)
      }
    }
    await Promise.all([worker(), worker()])
    await this.reload()
  }

  /** The languages changed: the check boxes start from the new recommendation. */
  resetChoice(): void {
    this.choice.clear()
  }

  private matches(item: T): boolean {
    const terms = (this.base.filter?.value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    const text = `${item.id} ${getI18n().pairName(item.id)}`.toLowerCase()
    return terms.length === 0 || terms.some((term) => text.includes(term))
  }

  render(): void {
    const all = this.items()
    const shown = orderItems(all.filter((i) => this.matches(i)), (i) => this.sources(i), (i) => getI18n().pairName(i.id), getI18n().lang)
    const { loading, empty } = this.statusText()
    let status = ""
    if (this.loading) status = loading
    else if (this.listError) status = this.listError
    else if (all.length === 0) status = empty
    else if (shown.length === 0) status = t("offlineNoMatch")
    this.base.status.textContent = status
    const required = this.required()
    this.base.list.replaceChildren(...shown.map((item) => this.row(item, required)))
    this.renderCommon()
    this.base.onRender?.()
  }

  private row(item: T, required: string[]): HTMLLIElement {
    const name = getI18n().pairName(item.id)
    let label: HTMLElement = h("span", { className: "dict-name", text: name })
    if (this.base.pick && !item.installed) {
      const box = h("input", { type: "checkbox", checked: this.checked(item, required), disabled: this.installing(item) })
      box.addEventListener("change", () => {
        this.choice.set(item.id, box.checked)
        this.base.onRender?.()
      })
      label = h("label", { className: "check dict-name" }, box, h("span", { text: name }))
      setTitle(label, t("tipPickItem"))
    }
    const li = h("li", { "data-id": item.id }, label, this.labels(item), ...this.details(item))
    const error = this.rowErrors.get(item.id)
    if (error) li.append(h("div", { className: "test-result fail", text: error }))
    return li
  }

  /** A queued row: "Waiting" and a Cancel that takes it off the queue. */
  protected waiting(id: string): Node[] {
    return [
      h("span", { text: t("dictQueued"), title: t("tipWaiting") }),
      button(
        t("buttonCancel"),
        () => {
          this.queued.delete(id)
          this.render()
        },
        false,
        t("tipCancelQueued"),
      ),
    ]
  }

  /** Where the languages of a recommended direction come from, and its part in translating into the target language. */
  private labels(item: T): HTMLElement | null {
    const sources = this.sources(item)
    if (sources.length === 0) return null
    const target = serviceLang(this.service, this.base.languages().target)
    const tags: [MessageKey, MessageKey][] = sources.map((s) => [SOURCE_KEYS[s], SOURCE_TIPS[s]])
    if (target && target !== "en" && item.tgt === target) tags.push(["routeDirect", "tipRouteDirect"])
    else if (target && target !== "en" && item.tgt === "en" && item.src !== target) tags.push(["routeViaEnglish", "tipRouteViaEnglish"])
    return h("span", { className: "lang-sources" }, ...tags.map(([text, tip]) => h("span", { className: "tag", text: t(text), title: t(tip) })))
  }

  /** "Download common languages", then the confirmation with what it downloads. */
  private renderCommon(): void {
    const items = this.items()
    const common = new Set(commonDirections(items.map((i) => i.id)))
    const missing = items.filter((i) => common.has(i.id) && !i.installed)
    const downloads = missing.filter((i) => !this.installing(i))
    const start = button(
      t("buttonDownloadCommon"),
      () => {
        this.confirmingCommon = true
        this.render()
      },
      false,
      t("tipDownloadCommon"),
    )
    start.disabled = this.loading || downloads.length === 0
    const parts: HTMLElement[] = [start]
    if (downloads.length === 0) this.confirmingCommon = false
    if (!this.loading && common.size > 0 && missing.length === 0) parts.push(h("span", { className: "hint", text: t("commonAllInstalled") }))
    if (this.confirmingCommon) {
      const total = downloads.reduce((sum, i) => sum + i.bytes, 0)
      const confirm = button(t("buttonConfirmDownload"), () => {
        this.confirmingCommon = false
        void this.installAll(downloads)
      }, true, t("tipConfirmDownload"))
      const cancel = button(t("buttonCancel"), () => {
        this.confirmingCommon = false
        this.render()
      }, false, t("tipCancelCommon"))
      parts.push(
        h(
          "div",
          { className: "common-confirm" },
          h("p", { text: t("commonConfirm", [downloads.length, megabytes(total)]) }),
          h("ul", {}, ...downloads.map((i) => h("li", { text: t("commonConfirmItem", [getI18n().pairName(i.id), megabytes(i.bytes)]) }))),
          h("div", { className: "row" }, confirm, cancel),
        ),
      )
    }
    this.base.common.replaceChildren(...parts)
  }
}
