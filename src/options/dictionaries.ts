/**
 * Dictionary packs of the release index and the installed ones, with
 * download (progress, cancel) and delete: the "Dictionaries" list of the
 * settings page and of the welcome page (see offline-list.ts). The
 * background script does the work (see src/background/offline-admin.ts), so
 * a download goes on when the page is closed and the translations use a
 * pack as soon as it is stored; the page polls the download progress.
 */

import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { pairKey } from "../shared/languages"
import { type DictionaryPackInfo, type InstallProgress, type OfflineResult, send } from "../shared/messages"
import { button, h } from "../shared/dom"
import { type ListItem, megabytes, OfflineList, type OfflineListDeps } from "./offline-list"

type PackItem = DictionaryPackInfo & ListItem

export interface DictionarySectionDeps extends OfflineListDeps {
  /** Release tag of the settings, as edited on the page. */
  tag: () => string
  pollMs?: number
}

export class DictionarySection extends OfflineList<PackItem> {
  protected readonly service = "dictionary"
  private packs: DictionaryPackInfo[] = []
  private progress: Record<string, InstallProgress> = {}
  private running = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: DictionarySectionDeps) {
    super(deps)
  }

  /** Read the list from the background script, for the release tag of the page; `refresh` reads the index again. */
  async load(refresh = false): Promise<void> {
    this.loading = true
    this.render()
    try {
      const r = await send({ type: "offlineList", service: "dictionary", refresh, tag: this.deps.tag() })
      this.packs = r?.ok ? (r.items as DictionaryPackInfo[]) : []
      this.listError = r?.error ?? ""
    } catch (error) {
      this.packs = []
      this.listError = describeError(error, getI18n())
    }
    this.loading = false
    this.render()
  }

  protected items(): PackItem[] {
    return this.packs.map((p) => ({ ...p, id: pairKey(p.src, p.tgt) }))
  }

  protected statusText() {
    return { loading: t("dictLoading"), empty: t("dictNone") }
  }

  protected installing(item: PackItem): boolean {
    return this.queued.has(item.id) || this.running.has(item.id)
  }

  protected details(item: PackItem): (Node | null)[] {
    const { id, src, tgt } = item
    const out: (Node | null)[] = [
      h("span", { className: "dict-meta hint", text: t("dictPackMeta", [megabytes(item.bytes), item.entries, item.license]), title: t("tipPackMeta") }),
      item.installed ? h("span", { className: "tag active", text: t("dictInstalled"), title: t("tipInstalled") }) : null,
    ]
    if (this.running.has(id)) {
      const progress = this.progress[id]
      const percent = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
      out.push(h("span", { text: t("dictDownloading", [percent]) }), button(t("buttonCancel"), () => void send({ type: "offlineCancel", service: "dictionary", src, tgt }), false, t("tipCancelDownload")))
    } else if (this.queued.has(id)) out.push(...this.waiting(id))
    else if (item.installed && !this.deps.pick) out.push(button(t("buttonDelete"), () => void this.remove(item), false, t("tipDelete")))
    else if (!item.installed && !this.deps.pick) out.push(button(t("buttonDownload"), () => void this.installAll([item]), true, t("tipDownloadItem")))
    out.push(h("span", { className: "attribution hint", text: item.attribution }))
    return out
  }

  private poll(): void {
    this.timer ??= setInterval(async () => {
      this.progress = (await send({ type: "offlineProgress" }).catch(() => undefined))?.dictionary ?? {}
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

  protected async install({ id, src, tgt }: PackItem): Promise<void> {
    this.rowErrors.delete(id)
    this.running.add(id)
    this.poll()
    this.render()
    const r = await send({ type: "offlineInstall", service: "dictionary", pairs: [{ src, tgt }], tag: this.deps.tag() })
      .then((results) => results?.[0])
      .catch((error): OfflineResult => ({ ok: false, error: describeError(error, getI18n()) }))
    this.running.delete(id)
    if (!r?.ok && !r?.cancelled) this.rowErrors.set(id, r?.error || describeError(undefined, getI18n()))
  }

  private async remove({ id, src, tgt }: PackItem): Promise<void> {
    this.rowErrors.delete(id)
    const r = await send({ type: "offlineRemove", service: "dictionary", src, tgt }).catch((error): OfflineResult => ({ ok: false, error: describeError(error, getI18n()) }))
    if (!r?.ok) this.rowErrors.set(id, r?.error || describeError(undefined, getI18n()))
    await this.load()
  }
}
