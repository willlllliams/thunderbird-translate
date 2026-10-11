/**
 * Offline translation models: the direction pairs offered by Mozilla and
 * the installed ones, with download, update, cancel and delete. The
 * background script does the work (see src/background/bergamot-admin.ts);
 * the page polls the download progress. On the settings page the
 * directions the current source and target languages need come first, and
 * deleting one of them asks for confirmation. On the welcome page only the
 * needed directions are listed, each with a check box, downloaded together.
 */

import { appLang } from "../background/dictionary/format"
import type { BergamotPairInfo } from "../offline/bergamot"
import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { LANGUAGES } from "../shared/languages"
import type { BergamotProgress, BergamotRequired, BergamotResult } from "../shared/messages"
import { send } from "../shared/page"
import { h } from "./dom"

export interface BergamotSectionDeps {
  /** Source ("auto" or a code) and target language of the settings. */
  languages: () => { source: string; target: string }
  list: HTMLElement
  status: HTMLElement
  /** Where the needed directions are named; settings page only. */
  needed?: HTMLElement
  filter?: HTMLInputElement
  /** Welcome page: only the needed directions, with check boxes instead of download buttons. */
  pick?: boolean
  pollMs?: number
}

const key = (src: string, tgt: string) => `${src}>${tgt}`

/** Name of a model tag (en, zh-Hans, nb…) in the interface language. */
function tagName(tag: string): string {
  const i18n = getI18n()
  const known = LANGUAGES.find((l) => l.code === appLang(tag))
  if (known) return i18n.languageName(known.code, known.native)
  try {
    return new Intl.DisplayNames([i18n.lang, "en"], { type: "language" }).of(tag) ?? tag
  } catch {
    return tag
  }
}

const pairName = ([src, tgt]: [string, string]) => `${tagName(src)} → ${tagName(tgt)}`

export class BergamotSection {
  private pairs: BergamotPairInfo[] = []
  private loading = false
  private listError = ""
  private needed: BergamotRequired = { required: [], missing: [] }
  private progress: BergamotProgress = {}
  private installing = new Set<string>()
  private confirming = new Set<string>()
  private rowErrors = new Map<string, string>()
  /** Check boxes the user cleared; every other direction shown and not installed is picked. */
  private unpicked = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: BergamotSectionDeps) {}

  /** Read the list from the background script; `refresh` asks Mozilla again. */
  async load(refresh = false): Promise<void> {
    this.loading = true
    this.render()
    try {
      const r = await send<BergamotResult | undefined>({ type: "bergamotList", refresh })
      this.pairs = r?.ok ? (r.pairs ?? []) : []
      this.listError = r && !r.ok ? (r.error ?? "") : ""
    } catch (error) {
      this.listError = describeError(error, getI18n())
    }
    this.loading = false
    await this.refreshNeeded()
  }

  /** The directions the current languages need; with automatic detection, those into the target language. */
  async refreshNeeded(): Promise<void> {
    const { source, target } = this.deps.languages()
    try {
      const r = await send<BergamotRequired | undefined>({ type: "bergamotRequired", src: source === "auto" ? "en" : source, tgt: target })
      this.needed = r ?? { required: [], missing: [] }
    } catch {
      this.needed = { required: [], missing: [] }
    }
    this.render()
  }

  private isNeeded(src: string, tgt: string): boolean {
    return this.needed.required.some(([s, t]) => s === src && t === tgt)
  }

  private neededText(): string {
    const { source, target } = this.deps.languages()
    const list = this.needed.required.map(pairName).join(", ")
    if (source === "auto") return list ? t("bergamotNeededAuto", [list]) : t("bergamotNeededAutoEnglish")
    return list ? t("bergamotNeeded", [tagName(source), tagName(target), list]) : ""
  }

  render(): void {
    const rows = this.rows()
    let status = ""
    if (this.loading) status = t("bergamotLoading")
    else if (this.listError) status = this.listError
    else if (rows.length === 0 && this.deps.pick) status = this.neededText() ? "" : t("bergamotNoneNeeded")
    else if (rows.length === 0 && this.pairs.length > 0) status = t("bergamotNoMatch")
    if (this.deps.needed) this.deps.needed.textContent = this.neededText()
    this.deps.status.textContent = status
    this.deps.list.replaceChildren(...rows.map((p) => this.renderRow(p)))
  }

  /** Pairs shown: the needed ones first, then those matching the filter; on the welcome page the needed ones only. */
  private rows(): BergamotPairInfo[] {
    if (this.deps.pick) return this.pairs.filter((p) => this.isNeeded(p.src, p.tgt))
    const filter = this.deps.filter?.value.trim().toLowerCase() ?? ""
    const matches = (tag: string) => tag.toLowerCase().includes(filter) || tagName(tag).toLowerCase().includes(filter)
    return this.pairs
      .filter((p) => !filter || matches(p.src) || matches(p.tgt))
      .sort((a, b) => Number(this.isNeeded(b.src, b.tgt)) - Number(this.isNeeded(a.src, a.tgt)))
  }

  /** Welcome page: download the picked directions. */
  async downloadPicked(): Promise<void> {
    const picked = this.rows().filter((p) => !p.installed && !this.unpicked.has(key(p.src, p.tgt)) && !this.installing.has(key(p.src, p.tgt)))
    await Promise.all(picked.map((p) => this.install(p)))
  }

  private button(text: string, onClick: () => void, primary = false): HTMLButtonElement {
    const b = h("button", { type: "button", className: primary ? "primary" : "", text })
    b.addEventListener("click", onClick)
    return b
  }

  private renderRow(p: BergamotPairInfo): HTMLLIElement {
    const id = key(p.src, p.tgt)
    const name = pairName([p.src, p.tgt])
    let label: HTMLElement = h("span", { className: "dict-name", text: name })
    if (this.deps.pick && !p.installed) {
      const box = h("input", { type: "checkbox", checked: !this.unpicked.has(id), disabled: this.installing.has(id) })
      box.addEventListener("change", () => (box.checked ? this.unpicked.delete(id) : this.unpicked.add(id)))
      label = h("label", { className: "check dict-name" }, box, h("span", { text: name }))
    }
    const li = h(
      "li",
      {},
      label,
      h("span", { className: "dict-meta hint", text: t("bergamotPairMeta", [(p.bytes / 1048576).toFixed(1), p.version]) }),
      p.installed ? h("span", { className: "tag active", text: t("dictInstalled") }) : null,
    )
    if (p.installedVersion) li.append(h("span", { className: "hint", text: t("bergamotUpdateAvailable", [p.installedVersion, p.version]) }))
    const progress = this.progress[id]
    if (this.installing.has(id)) {
      const percent = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
      li.append(
        h("span", { text: t("dictDownloading", [percent]) }),
        this.button(t("buttonCancel"), () => void send({ type: "bergamotCancel", src: p.src, tgt: p.tgt })),
      )
    } else if (this.confirming.has(id)) {
      li.append(
        h("span", { className: "field-warning", text: t("bergamotDeleteNeeded") }),
        this.button(t("buttonDeleteAnyway"), () => void this.remove(p)),
        this.button(t("buttonCancel"), () => {
          this.confirming.delete(id)
          this.render()
        }),
      )
    } else if (!this.deps.pick) {
      if (!p.installed) li.append(this.button(t("buttonDownload"), () => void this.install(p), true))
      if (p.installedVersion) li.append(this.button(t("buttonUpdate"), () => void this.install(p), true))
      if (p.installed) {
        li.append(
          this.button(t("buttonDelete"), () => {
            if (!this.isNeeded(p.src, p.tgt)) return void this.remove(p)
            this.confirming.add(id)
            this.render()
          }),
        )
      }
    }
    const error = this.rowErrors.get(id)
    if (error) li.append(h("div", { className: "test-result fail", text: error }))
    return li
  }

  private poll(): void {
    this.timer ??= setInterval(async () => {
      this.progress = (await send<BergamotProgress | undefined>({ type: "bergamotProgress" }).catch(() => undefined)) ?? {}
      if (this.installing.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
      this.render()
    }, this.deps.pollMs ?? 400)
  }

  private async install(p: BergamotPairInfo): Promise<void> {
    const id = key(p.src, p.tgt)
    this.rowErrors.delete(id)
    this.installing.add(id)
    this.poll()
    this.render()
    const r = await send<BergamotResult | undefined>({ type: "bergamotInstall", src: p.src, tgt: p.tgt }).catch((error): BergamotResult => ({ ok: false, error: describeError(error, getI18n()) }))
    this.installing.delete(id)
    if (!r?.ok && !r?.cancelled) this.rowErrors.set(id, r?.error || describeError(undefined, getI18n()))
    await this.load()
  }

  private async remove(p: BergamotPairInfo): Promise<void> {
    const id = key(p.src, p.tgt)
    this.confirming.delete(id)
    this.rowErrors.delete(id)
    const r = await send<BergamotResult | undefined>({ type: "bergamotRemove", src: p.src, tgt: p.tgt }).catch((error): BergamotResult => ({ ok: false, error: describeError(error, getI18n()) }))
    if (!r?.ok) this.rowErrors.set(id, r?.error || describeError(undefined, getI18n()))
    await this.load()
  }
}
