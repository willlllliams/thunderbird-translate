/**
 * Offline translation models: the direction pairs offered by Mozilla and
 * the installed ones, with download, update, cancel and delete: the
 * "Offline models" list of the settings page and of the welcome page (see
 * offline-list.ts). The background script does the work (see
 * src/background/offline-admin.ts); the page polls the download progress.
 * On the settings page a line names the directions the current languages
 * need, and deleting one of them asks for confirmation.
 */

import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { pairKey } from "../shared/languages"
import { type BergamotPairInfo, type BergamotProgress, type BergamotResult, send } from "../shared/messages"
import { button, h } from "../shared/dom"
import { type ListItem, megabytes, OfflineList, type OfflineListDeps } from "./offline-list"

type PairItem = BergamotPairInfo & ListItem

export interface BergamotSectionDeps extends OfflineListDeps {
  /** Where the needed directions are named; settings page only. */
  needed?: HTMLElement
  pollMs?: number
}

export class BergamotSection extends OfflineList<PairItem> {
  protected readonly service = "bergamot"
  private pairs: BergamotPairInfo[] = []
  private progress: BergamotProgress = {}
  private running = new Set<string>()
  private deleting = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: BergamotSectionDeps) {
    super(deps)
  }

  /** Read the list from the background script; `refresh` asks Mozilla again. */
  async load(refresh = false): Promise<void> {
    this.loading = true
    this.render()
    try {
      const r = await send({ type: "bergamotList", refresh })
      this.pairs = r?.ok ? (r.pairs ?? []) : []
      this.listError = r && !r.ok ? (r.error ?? "") : ""
    } catch (error) {
      this.listError = describeError(error, getI18n())
    }
    this.loading = false
    this.render()
  }

  protected items(): PairItem[] {
    return this.pairs.map((p) => ({ ...p, id: pairKey(p.src, p.tgt) }))
  }

  protected statusText() {
    return { loading: t("bergamotLoading"), empty: "" }
  }

  protected installing(item: PairItem): boolean {
    return this.queued.has(item.id) || this.running.has(item.id)
  }

  /** The directions the current languages need; with automatic detection, those into the target language. */
  private neededText(): string {
    const { source, target } = this.deps.languages()
    const list = this.required().map((id) => getI18n().pairName(id)).join(", ")
    if (source === "auto") return list ? t("bergamotNeededAuto", [list]) : t("bergamotNeededAutoEnglish")
    return list ? t("bergamotNeeded", [getI18n().tagName(source), getI18n().tagName(target), list]) : ""
  }

  render(): void {
    if (this.deps.needed) this.deps.needed.textContent = this.neededText()
    super.render()
  }

  protected details(p: PairItem): (Node | null)[] {
    const out: (Node | null)[] = [
      h("span", { className: "dict-meta hint", text: t("bergamotPairMeta", [megabytes(p.bytes), p.version]), title: t("tipModelMeta") }),
      p.installed ? h("span", { className: "tag active", text: t("dictInstalled"), title: t("tipInstalled") }) : null,
    ]
    if (p.installedVersion) out.push(h("span", { className: "hint", text: t("bergamotUpdateAvailable", [p.installedVersion, p.version]) }))
    const progress = this.progress[p.id]
    if (this.running.has(p.id)) {
      const percent = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
      out.push(h("span", { text: t("dictDownloading", [percent]) }), button(t("buttonCancel"), () => void send({ type: "bergamotCancel", src: p.src, tgt: p.tgt }), false, t("tipCancelDownload")))
    } else if (this.queued.has(p.id)) {
      out.push(...this.waiting(p.id))
    } else if (this.deleting.has(p.id)) {
      out.push(
        h("span", { className: "field-warning", text: t("bergamotDeleteNeeded") }),
        button(t("buttonDeleteAnyway"), () => void this.remove(p), false, t("tipDeleteAnyway")),
        button(
          t("buttonCancel"),
          () => {
            this.deleting.delete(p.id)
            this.render()
          },
          false,
          t("tipKeepModel"),
        ),
      )
    } else if (!this.deps.pick) {
      if (!p.installed) out.push(button(t("buttonDownload"), () => void this.installAll([p]), true, t("tipDownloadItem")))
      if (p.installedVersion) out.push(button(t("buttonUpdate"), () => void this.installAll([p]), true, t("tipUpdate")))
      if (p.installed) {
        out.push(
          button(
            t("buttonDelete"),
            () => {
              if (!this.required().includes(p.id)) return void this.remove(p)
              this.deleting.add(p.id)
              this.render()
            },
            false,
            t("tipDelete"),
          ),
        )
      }
    }
    return out
  }

  private poll(): void {
    this.timer ??= setInterval(async () => {
      this.progress = (await send({ type: "bergamotProgress" }).catch(() => undefined)) ?? {}
      if (this.running.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
      this.render()
    }, this.deps.pollMs ?? 400)
  }

  protected reload(): Promise<void> {
    return this.load()
  }

  protected async install(p: PairItem): Promise<void> {
    this.rowErrors.delete(p.id)
    this.running.add(p.id)
    this.poll()
    this.render()
    const r = await send({ type: "bergamotInstall", src: p.src, tgt: p.tgt }).catch((error): BergamotResult => ({ ok: false, error: describeError(error, getI18n()) }))
    this.running.delete(p.id)
    if (!r?.ok && !r?.cancelled) this.rowErrors.set(p.id, r?.error || describeError(undefined, getI18n()))
  }

  private async remove(p: PairItem): Promise<void> {
    this.deleting.delete(p.id)
    this.rowErrors.delete(p.id)
    const r = await send({ type: "bergamotRemove", src: p.src, tgt: p.tgt }).catch((error): BergamotResult => ({ ok: false, error: describeError(error, getI18n()) }))
    if (!r?.ok) this.rowErrors.set(p.id, r?.error || describeError(undefined, getI18n()))
    await this.load()
  }
}
