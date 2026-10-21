/**
 * Offline translation models: the direction pairs offered by Mozilla and
 * the installed ones, with download, update, cancel and delete: the
 * "Offline models" list of the settings page and of the welcome page (see
 * offline-list.ts). On the settings page a line names the directions the
 * current languages need, and deleting one of them asks for confirmation.
 */

import { getI18n, t } from "../shared/i18n"
import { pairKey } from "../shared/languages"
import type { BergamotPairInfo } from "../shared/messages"
import { button, h } from "../shared/dom"
import { type ListItem, megabytes, OfflineList, type OfflineListDeps } from "./offline-list"

type PairItem = BergamotPairInfo & ListItem

export interface BergamotSectionDeps extends OfflineListDeps {
  /** Where the needed directions are named; settings page only. */
  needed?: HTMLElement
}

export class BergamotSection extends OfflineList<PairItem> {
  protected readonly service = "bergamot"
  private deleting = new Set<string>()

  constructor(private readonly deps: BergamotSectionDeps) {
    super(deps)
  }

  protected items(): PairItem[] {
    return (this.entries as BergamotPairInfo[]).map((p) => ({ ...p, id: pairKey(p.src, p.tgt) }))
  }

  protected statusText() {
    return { loading: t("bergamotLoading"), empty: "" }
  }

  /** The directions the current languages need; with automatic detection, those into the target language. */
  private neededText(): string {
    const { source, target } = this.deps.languages()
    const list = getI18n().list(this.required().map((id) => getI18n().pairName(id)))
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
    const activity = this.activity(p)
    if (activity) {
      out.push(...activity)
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

  protected remove(p: PairItem): Promise<void> {
    this.deleting.delete(p.id)
    return super.remove(p)
  }
}
