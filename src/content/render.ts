/**
 * Renders translations into units and undoes every change.
 *
 * - bilingual: a block with the translation is appended inside the unit, so
 *   it stays in the same list item / table cell / quote as the original.
 * - translation-only: the unit's children are swapped for the translation;
 *   the original nodes are kept in memory and put back on clear().
 */

import type { DisplayMode, StylePreset } from "../shared/settings"
import { CLS_STATUS, CLS_TRANSLATION, type Unit } from "./paragraphs"

interface UnitDom {
  added: HTMLElement | null
  original: Node[] | null
}

export class Renderer {
  private dom = new Map<Unit, UnitDom>()
  stylePreset: StylePreset = "border"

  constructor(private readonly doc: Document) {}

  private state(unit: Unit): UnitDom {
    let s = this.dom.get(unit)
    if (!s) {
      s = { added: null, original: null }
      this.dom.set(unit, s)
    }
    return s
  }

  clear(unit: Unit): void {
    const s = this.dom.get(unit)
    if (!s) return
    if (s.original) unit.el.replaceChildren(...s.original)
    else s.added?.remove()
    this.dom.delete(unit)
  }

  clearAll(): void {
    for (const unit of [...this.dom.keys()]) this.clear(unit)
  }

  showLoading(unit: Unit, label: string): void {
    this.clear(unit)
    const span = this.doc.createElement("span")
    span.className = `${CLS_STATUS} tt-loading`
    span.setAttribute("aria-label", label)
    span.title = label
    unit.el.appendChild(span)
    this.state(unit).added = span
  }

  showError(unit: Unit, message: string, label: string, onRetry: () => void): void {
    this.clear(unit)
    const span = this.doc.createElement("span")
    span.className = `${CLS_STATUS} tt-error`
    span.textContent = label
    span.title = message
    span.setAttribute("role", "button")
    span.tabIndex = 0
    span.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      onRetry()
    })
    unit.el.appendChild(span)
    this.state(unit).added = span
  }

  showTranslation(unit: Unit, text: string, mode: DisplayMode, lang?: string): void {
    this.clear(unit)
    const node = this.doc.createElement("span")
    node.className = [
      CLS_TRANSLATION,
      mode === "bilingual" ? "tt-bilingual" : "tt-only",
      `tt-style-${this.stylePreset}`,
      unit.pre ? "tt-pre" : "tt-flow",
    ].join(" ")
    node.textContent = text
    node.setAttribute("dir", "auto")
    if (lang) node.setAttribute("lang", lang)
    const s = this.state(unit)
    if (mode === "bilingual") {
      unit.el.appendChild(node)
      s.added = node
    } else {
      node.title = unit.text.length > 600 ? `${unit.text.slice(0, 600)}…` : unit.text
      s.original = Array.from(unit.el.childNodes)
      unit.el.replaceChildren(node)
      s.added = node
    }
  }

  isRendered(unit: Unit): boolean {
    return this.dom.has(unit)
  }
}
