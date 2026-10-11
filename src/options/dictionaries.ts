/**
 * "Dictionaries" section of the settings page: the packs of the release
 * index and the installed ones, with download (progress, checksum) and
 * delete. The page writes IndexedDB itself and tells the background script
 * to read the packs again.
 */

import { appLang } from "../background/dictionary/format"
import { fetchDictionaryIndex, type IndexedPack, installPack } from "../background/dictionary/download"
import { DictionaryStore, type InstalledPack, packId } from "../background/dictionary/store"
import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { getLanguage } from "../shared/languages"
import { $, send } from "../shared/page"
import { h } from "./dom"

/** What a row shows: the index entry when the release has the pack, the stored description when it is installed. */
interface Row {
  id: string
  available?: IndexedPack
  installed?: InstalledPack
}

export interface DictionarySectionDeps {
  /** Release tag of the settings. */
  tag: () => string
  store?: DictionaryStore
  fetchFn?: typeof fetch
}

function languageName(code: string): string {
  const lang = getLanguage(appLang(code))
  return getI18n().languageName(lang.code, lang.native)
}

export class DictionarySection {
  private available: IndexedPack[] = []
  private installed: InstalledPack[] = []
  private loading = false
  private indexError = ""
  /** Download progress in percent, by pack id. */
  private progress = new Map<string, number>()
  private rowErrors = new Map<string, string>()
  private readonly store: DictionaryStore

  constructor(private readonly deps: DictionarySectionDeps) {
    this.store = deps.store ?? new DictionaryStore()
  }

  async load(): Promise<void> {
    this.loading = true
    this.render()
    const [index, installed] = await Promise.allSettled([fetchDictionaryIndex(this.deps.tag(), this.deps.fetchFn), this.store.list()])
    this.available = index.status === "fulfilled" ? index.value : []
    this.indexError = index.status === "rejected" ? describeError(index.reason, getI18n()) : ""
    this.installed = installed.status === "fulfilled" ? installed.value : []
    this.loading = false
    this.render()
  }

  private rows(): Row[] {
    const rows = new Map<string, Row>()
    for (const pack of this.available) rows.set(packId(pack.src, pack.tgt), { id: packId(pack.src, pack.tgt), available: pack })
    for (const pack of this.installed) rows.set(pack.id, { ...rows.get(pack.id), id: pack.id, installed: pack })
    return [...rows.values()]
  }

  render(): void {
    const rows = this.rows()
    let status = ""
    if (this.loading) status = t("dictLoading")
    else if (this.indexError) status = t("dictIndexFailed", [this.indexError])
    else if (rows.length === 0) status = t("dictNone")
    $("dictStatus").textContent = status
    $("dictList").replaceChildren(...rows.map((row) => this.renderRow(row)))
  }

  private renderRow({ id, available, installed }: Row): HTMLLIElement {
    const pack = (installed ?? available)!
    const meta = t("dictPackMeta", [(pack.bytes / 1048576).toFixed(1), pack.entries, pack.license])
    const name = `${languageName(pack.src)} → ${languageName(pack.tgt)}`
    const li = h(
      "li",
      {},
      h("span", { className: "dict-name", text: name }),
      h("span", { className: "dict-meta hint", text: meta }),
      installed ? h("span", { className: "tag active", text: t("dictInstalled") }) : null,
    )
    const progress = this.progress.get(id)
    if (progress !== undefined) {
      li.append(h("span", { text: t("dictDownloading", [progress]) }))
    } else if (installed) {
      const remove = h("button", { type: "button", text: t("buttonDelete") })
      remove.addEventListener("click", () => void this.remove(id))
      li.append(remove)
    } else if (available) {
      const download = h("button", { type: "button", className: "primary", text: t("buttonDownload") })
      download.addEventListener("click", () => void this.download(available))
      li.append(download)
    }
    li.append(h("span", { className: "attribution hint", text: (available ?? installed)!.attribution }))
    const error = this.rowErrors.get(id)
    if (error) li.append(h("div", { className: "test-result fail", text: error }))
    return li
  }

  private async changed(): Promise<void> {
    await send({ type: "dictionaryChanged" })
    this.installed = await this.store.list()
  }

  private async download(pack: IndexedPack): Promise<void> {
    const id = packId(pack.src, pack.tgt)
    this.rowErrors.delete(id)
    this.progress.set(id, 0)
    this.render()
    try {
      await installPack(pack, this.deps.tag(), this.store, {
        fetchFn: this.deps.fetchFn,
        onProgress: (loaded, total) => {
          const percent = Math.min(100, Math.round((loaded / total) * 100))
          if (percent === this.progress.get(id)) return
          this.progress.set(id, percent)
          this.render()
        },
      })
      await this.changed()
    } catch (error) {
      this.rowErrors.set(id, describeError(error, getI18n()))
    } finally {
      this.progress.delete(id)
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
