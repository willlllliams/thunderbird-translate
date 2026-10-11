/**
 * Dictionary packs of the release index and the installed ones, with
 * download (progress, checksum, cancel) and delete: the "Dictionaries" section of
 * the settings page, and on the welcome page the packs the languages need,
 * each with a check box, downloaded together. The page writes IndexedDB
 * itself and tells the background script to read the packs again.
 */

import { dictLang } from "../background/dictionary/format"
import { fetchDictionaryIndex, type IndexedPack, installPack } from "../background/dictionary/download"
import { DictionaryStore, type InstalledPack } from "../background/dictionary/store"
import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { appLang, getLanguage, isChinesePair, pairKey } from "../shared/languages"
import { send } from "../shared/page"
import { button, h } from "./dom"

/** What a row shows: the index entry when the release has the pack, the stored description when it is installed. */
interface Row {
  id: string
  available?: IndexedPack
  installed?: InstalledPack
}

export interface DictionarySectionDeps {
  /** Release tag of the settings. */
  tag: () => string
  list: HTMLElement
  status: HTMLElement
  /** Welcome page: only the packs these languages need, with check boxes instead of download buttons. */
  needed?: () => { source: string; target: string }
  store?: DictionaryStore
  fetchFn?: typeof fetch
}

function languageName(code: string): string {
  const lang = getLanguage(appLang(code))
  return getI18n().languageName(lang.code, lang.native)
}

/**
 * Packs that translate `source` into `target`, as the dictionary uses them:
 * the direct pack when the release has it, otherwise the two packs through
 * English. Automatic detection counts as English. None between Simplified
 * and Traditional Chinese, which the dictionary does not translate.
 */
export function neededPackIds(source: string, target: string, available: { src: string; tgt: string }[]): string[] {
  const src = dictLang(source === "auto" ? "en" : source)
  const tgt = dictLang(target)
  if (!src || !tgt || src === tgt || isChinesePair(src, tgt)) return []
  if (src === "en" || tgt === "en" || available.some((p) => p.src === src && p.tgt === tgt)) return [pairKey(src, tgt)]
  return [pairKey(src, "en"), pairKey("en", tgt)]
}

export class DictionarySection {
  private available: IndexedPack[] = []
  private installed: InstalledPack[] = []
  private loading = false
  private indexError = ""
  /** Download progress in percent, by pack id. */
  private progress = new Map<string, number>()
  /** Cancellation of the running downloads, by pack id. */
  private downloads = new Map<string, AbortController>()
  private rowErrors = new Map<string, string>()
  /** Check boxes the user cleared; every other pack shown and not installed is picked. */
  private unpicked = new Set<string>()
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
    for (const pack of this.available) rows.set(pairKey(pack.src, pack.tgt), { id: pairKey(pack.src, pack.tgt), available: pack })
    for (const pack of this.installed) rows.set(pack.id, { ...rows.get(pack.id), id: pack.id, installed: pack })
    if (!this.deps.needed) return [...rows.values()]
    const { source, target } = this.deps.needed()
    return neededPackIds(source, target, this.available).flatMap((id) => rows.get(id) ?? [])
  }

  /** Welcome page: download the picked packs. */
  async downloadPicked(): Promise<void> {
    const picked = this.rows().filter((row) => row.available && !row.installed && !this.unpicked.has(row.id))
    await Promise.all(picked.map((row) => this.download(row.available!)))
  }

  render(): void {
    const rows = this.rows()
    let status = ""
    if (this.loading) status = t("dictLoading")
    else if (this.indexError) status = t("dictIndexFailed", [this.indexError])
    else if (rows.length === 0) status = this.deps.needed ? t("dictNoneForPair") : t("dictNone")
    this.deps.status.textContent = status
    this.deps.list.replaceChildren(...rows.map((row) => this.renderRow(row)))
  }

  private renderRow({ id, available, installed }: Row): HTMLLIElement {
    const pack = (installed ?? available)!
    const meta = t("dictPackMeta", [(pack.bytes / 1048576).toFixed(1), pack.entries, pack.license])
    const name = `${languageName(pack.src)} → ${languageName(pack.tgt)}`
    const li = h(
      "li",
      {},
      this.deps.needed && available && !installed ? this.checkbox(id, name, this.progress.has(id)) : h("span", { className: "dict-name", text: name }),
      h("span", { className: "dict-meta hint", text: meta }),
      installed ? h("span", { className: "tag active", text: t("dictInstalled") }) : null,
    )
    const progress = this.progress.get(id)
    if (progress !== undefined) {
      li.append(h("span", { text: t("dictDownloading", [progress]) }), button(t("buttonCancel"), () => this.downloads.get(id)?.abort()))
    } else if (installed && !this.deps.needed) {
      li.append(button(t("buttonDelete"), () => void this.remove(id)))
    } else if (available && !this.deps.needed) {
      li.append(button(t("buttonDownload"), () => void this.download(available), true))
    }
    li.append(h("span", { className: "attribution hint", text: (available ?? installed)!.attribution }))
    const error = this.rowErrors.get(id)
    if (error) li.append(h("div", { className: "test-result fail", text: error }))
    return li
  }

  /** Check box with the pack's name, for a pack to download; disabled while it downloads. */
  private checkbox(id: string, name: string, disabled: boolean): HTMLElement {
    const box = h("input", { type: "checkbox", checked: !this.unpicked.has(id), disabled })
    box.addEventListener("change", () => (box.checked ? this.unpicked.delete(id) : this.unpicked.add(id)))
    return h("label", { className: "check dict-name" }, box, h("span", { text: name }))
  }

  private async changed(): Promise<void> {
    await send({ type: "dictionaryChanged" })
    this.installed = await this.store.list()
  }

  private async download(pack: IndexedPack): Promise<void> {
    const id = pairKey(pack.src, pack.tgt)
    this.rowErrors.delete(id)
    this.progress.set(id, 0)
    const controller = new AbortController()
    this.downloads.set(id, controller)
    this.render()
    try {
      await installPack(pack, this.deps.tag(), this.store, {
        fetchFn: this.deps.fetchFn,
        signal: controller.signal,
        onProgress: (loaded, total) => {
          const percent = Math.min(100, Math.round((loaded / total) * 100))
          if (percent === this.progress.get(id)) return
          this.progress.set(id, percent)
          this.render()
        },
      })
      await this.changed()
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
