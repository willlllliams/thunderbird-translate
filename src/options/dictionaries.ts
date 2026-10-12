/**
 * Dictionary packs of the release index and the installed ones, with
 * download (progress, checksum, cancel) and delete: the "Dictionaries" list
 * of the settings page and of the welcome page (see offline-list.ts). The
 * page writes IndexedDB itself and tells the background script to read the
 * packs again.
 */

import { fetchDictionaryIndex, type IndexedPack, installPack } from "../offline/dictionary/download"
import { DictionaryStore, type InstalledPack } from "../offline/dictionary/store"
import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { pairKey } from "../shared/languages"
import { send } from "../shared/messages"
import { button, h } from "../shared/dom"
import { type ListItem, megabytes, OfflineList, type OfflineListDeps } from "./offline-list"

/** A row: the index entry when the release has the pack, the stored description when it is installed. */
interface PackItem extends ListItem {
  available?: IndexedPack
  stored?: InstalledPack
}

export interface DictionarySectionDeps extends OfflineListDeps {
  /** Release tag of the settings. */
  tag: () => string
  store?: DictionaryStore
  fetchFn?: typeof fetch
}

export class DictionarySection extends OfflineList<PackItem> {
  protected readonly service = "dictionary"
  private available: IndexedPack[] = []
  private installed: InstalledPack[] = []
  /** Download progress in percent, by pack id. */
  private progress = new Map<string, number>()
  /** Cancellation of the running downloads, by pack id. */
  private downloads = new Map<string, AbortController>()
  /** A download stored a pack that the background script has not heard of yet. */
  private stored = false
  private readonly store: DictionaryStore

  constructor(private readonly deps: DictionarySectionDeps) {
    super(deps)
    this.store = deps.store ?? new DictionaryStore()
  }

  async load(): Promise<void> {
    this.loading = true
    this.render()
    const [index, installed] = await Promise.allSettled([fetchDictionaryIndex(this.deps.tag(), this.deps.fetchFn), this.store.list()])
    this.available = index.status === "fulfilled" ? index.value : []
    this.listError = index.status === "rejected" ? t("dictIndexFailed", [describeError(index.reason, getI18n())]) : ""
    this.installed = installed.status === "fulfilled" ? installed.value : []
    this.loading = false
    this.render()
  }

  protected items(): PackItem[] {
    const rows = new Map<string, PackItem>()
    for (const pack of this.available) {
      const id = pairKey(pack.src, pack.tgt)
      rows.set(id, { id, src: pack.src, tgt: pack.tgt, bytes: pack.bytes, installed: false, available: pack })
    }
    for (const pack of this.installed) rows.set(pack.id, { ...rows.get(pack.id), id: pack.id, src: pack.src, tgt: pack.tgt, bytes: pack.bytes, installed: true, stored: pack })
    return [...rows.values()]
  }

  protected statusText() {
    return { loading: t("dictLoading"), empty: t("dictNone") }
  }

  protected installing(item: PackItem): boolean {
    return this.queued.has(item.id) || this.progress.has(item.id)
  }

  protected details(item: PackItem): (Node | null)[] {
    const { id, available, stored } = item
    const pack = (stored ?? available)!
    const out: (Node | null)[] = [
      h("span", { className: "dict-meta hint", text: t("dictPackMeta", [megabytes(pack.bytes), pack.entries, pack.license]), title: t("tipPackMeta") }),
      stored ? h("span", { className: "tag active", text: t("dictInstalled"), title: t("tipInstalled") }) : null,
    ]
    const progress = this.progress.get(id)
    if (progress !== undefined) out.push(h("span", { text: t("dictDownloading", [progress]) }), button(t("buttonCancel"), () => this.downloads.get(id)?.abort(), false, t("tipCancelDownload")))
    else if (this.queued.has(id)) out.push(...this.waiting(id))
    else if (stored && !this.deps.pick) out.push(button(t("buttonDelete"), () => void this.remove(id), false, t("tipDelete")))
    else if (available && !stored && !this.deps.pick) out.push(button(t("buttonDownload"), () => void this.installAll([item]), true, t("tipDownloadItem")))
    out.push(h("span", { className: "attribution hint", text: pack.attribution }))
    return out
  }

  private async changed(): Promise<void> {
    await send({ type: "dictionaryChanged" })
    this.installed = await this.store.list()
  }

  protected async reload(): Promise<void> {
    // The packs are stored and shown either way; only the notice to the background script can fail.
    if (this.stored) await this.changed().catch(() => {})
    this.stored = false
  }

  protected async install({ id, available }: PackItem): Promise<void> {
    if (!available) return
    this.rowErrors.delete(id)
    this.progress.set(id, 0)
    const controller = new AbortController()
    this.downloads.set(id, controller)
    this.render()
    try {
      await installPack(available, this.deps.tag(), this.store, {
        fetchFn: this.deps.fetchFn,
        signal: controller.signal,
        onProgress: (loaded, total) => {
          const percent = Math.min(100, Math.round((loaded / total) * 100))
          if (percent === this.progress.get(id)) return
          this.progress.set(id, percent)
          this.render()
        },
      })
      this.installed = await this.store.list()
      this.stored = true
    } catch (error) {
      if (!controller.signal.aborted) this.rowErrors.set(id, describeError(error, getI18n()))
    } finally {
      this.progress.delete(id)
      this.downloads.delete(id)
      this.render()
    }
  }

  private async remove(id: string): Promise<void> {
    this.rowErrors.delete(id)
    try {
      await this.store.remove(id)
      await this.changed()
    } catch (error) {
      this.rowErrors.set(id, describeError(error, getI18n()))
    }
    this.render()
  }
}
