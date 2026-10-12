/**
 * Dictionary packs of the release index and the installed ones, with
 * download (progress, cancel) and delete: the "Dictionaries" list of the
 * settings page and of the welcome page (see offline-list.ts). The list
 * names the release tag of the page, which may not be saved yet.
 */

import { t } from "../shared/i18n"
import { pairKey } from "../shared/languages"
import type { DictionaryPackInfo } from "../shared/messages"
import { button, h } from "../shared/dom"
import { type ListItem, megabytes, OfflineList, type OfflineListDeps } from "./offline-list"

type PackItem = DictionaryPackInfo & ListItem

export interface DictionarySectionDeps extends OfflineListDeps {
  /** Release tag of the settings, as edited on the page. */
  tag: () => string
}

export class DictionarySection extends OfflineList<PackItem> {
  protected readonly service = "dictionary"

  constructor(private readonly deps: DictionarySectionDeps) {
    super(deps)
  }

  protected tag(): string {
    return this.deps.tag()
  }

  protected items(): PackItem[] {
    return (this.entries as DictionaryPackInfo[]).map((p) => ({ ...p, id: pairKey(p.src, p.tgt) }))
  }

  protected statusText() {
    return { loading: t("dictLoading"), empty: t("dictNone") }
  }

  protected details(item: PackItem): (Node | null)[] {
    const out: (Node | null)[] = [
      h("span", { className: "dict-meta hint", text: t("dictPackMeta", [megabytes(item.bytes), item.entries, item.license]), title: t("tipPackMeta") }),
      item.installed ? h("span", { className: "tag active", text: t("dictInstalled"), title: t("tipInstalled") }) : null,
    ]
    const activity = this.activity(item)
    if (activity) out.push(...activity)
    else if (item.installed && !this.deps.pick) out.push(button(t("buttonDelete"), () => void this.remove(item), false, t("tipDelete")))
    else if (!item.installed && !this.deps.pick) out.push(button(t("buttonDownload"), () => void this.installAll([item]), true, t("tipDownloadItem")))
    out.push(h("span", { className: "attribution hint", text: item.attribution }))
    return out
  }
}
