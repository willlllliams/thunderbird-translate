/**
 * Renders translations into units and undoes every change.
 *
 * - bilingual: a block with the translation is appended inside the unit, so
 *   it stays in the same list item / table cell / quote as the original.
 * - translation-only: the translation goes in front of the unit's children,
 *   which move into a hidden span (CLS_ORIGINAL) and come back on clear().
 *   They stay in the document, so a content script that replaces this one
 *   (the extension was updated) finds them (restoreLeftovers()). The images
 *   of the unit stay: copies of them follow the translation, except remote
 *   ones, whose copies would be fetched again. What images.ts put under an
 *   image inside the unit stays where it is.
 *
 * A translation can carry a mark: a provisional result of a lower tier while
 * the highest tier runs, or a lower result kept after the highest tier failed.
 *
 * A translation is shown as text or as the Markdown subset of shared/markdown.ts
 * rendered into elements (TextFormat); the controller decides which.
 */

import { getI18n } from "../shared/i18n"
import { markdownFragment } from "../shared/markdown"
import type { DisplayMode, Settings, StylePreset } from "../shared/settings"
import { CLS_IMAGE, CLS_ORIGINAL, CLS_STATUS, CLS_TRANSLATION, type Unit } from "./paragraphs"

/** The colours, opacity and size of the translations as CSS variables; without a text colour they keep the colour of the message. */
export function styleVars(style: Settings["style"]): Record<string, string> {
  return { "--tt-color": style.color, ...(style.textColor ? { "--tt-text-color": style.textColor } : {}), "--tt-opacity": String(style.opacity), "--tt-scale": String(style.fontScale) }
}

/** The variables of styleVars() on `el`, for the translations inside it. */
export function setStyleVars(el: HTMLElement, style: Settings["style"]): void {
  el.style.removeProperty("--tt-text-color")
  for (const [name, value] of Object.entries(styleVars(style))) el.style.setProperty(name, value)
}

/**
 * Sample translations of an extension page (the setup guide) inside `box`, in the style of `style`: each paragraph
 * element is a unit of its own, and a translation carries the interface language, which it is written in.
 */
export function sampleRenderer(box: HTMLElement, style: Settings["style"]) {
  setStyleVars(box, style)
  const renderer = new Renderer(box.ownerDocument)
  renderer.stylePreset = style.preset
  const units = new WeakMap<HTMLElement, Unit>()
  const unit = (el: HTMLElement) => {
    if (!units.has(el)) units.set(el, { el, text: el.textContent ?? "", pre: false })
    return units.get(el)!
  }
  return {
    show: (el: HTMLElement, text: string, mode: DisplayMode, mark?: TranslationMark) => renderer.showTranslation(unit(el), text, mode, getI18n().lang, mark),
    loading: (el: HTMLElement, label: string) => renderer.showLoading(unit(el), label),
  }
}

interface UnitDom {
  added: HTMLElement | null
  /** Translation only: the hidden span with the original children. */
  original: HTMLElement | null
}

/**
 * Small label inside a translation; the title explains it, a click handler
 * makes it a retry button, and `retryHint` then follows the title on the
 * label itself (not on the translation around it).
 */
export interface TranslationMark {
  kind: "provisional" | "fallback"
  label: string
  title: string
  onRetry?: () => void
  retryHint?: string
}

/** How the text of a translation is shown: as it is, or with its Markdown rendered. */
export type TextFormat = "text" | "markdown"

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
    if (s.original) s.original.replaceWith(...Array.from(s.original.childNodes))
    s.added?.remove()
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

  /** Status label; with onRetry it is a button that retries the paragraph, which the keyboard reaches as well. */
  private status(className: string, label: string, title: string, onRetry?: () => void): HTMLElement {
    const el = this.doc.createElement(onRetry ? "button" : "span")
    el.className = `${CLS_STATUS} ${className}`
    el.textContent = label
    el.title = title
    if (onRetry) {
      ;(el as HTMLButtonElement).type = "button"
      el.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        onRetry()
      })
    }
    return el
  }

  showError(unit: Unit, message: string, label: string, onRetry: () => void): void {
    this.clear(unit)
    const span = this.status("tt-error", label, message, onRetry)
    unit.el.appendChild(span)
    this.state(unit).added = span
  }

  showTranslation(unit: Unit, text: string, mode: DisplayMode, lang?: string, mark?: TranslationMark, format: TextFormat = "text"): void {
    this.clear(unit)
    const node = this.doc.createElement("span")
    node.className = [
      CLS_TRANSLATION,
      mode === "bilingual" ? "tt-bilingual" : "tt-only",
      `tt-style-${this.stylePreset}`,
      unit.pre ? "tt-pre" : "tt-flow",
      ...(mark ? [`tt-${mark.kind}`] : []),
    ].join(" ")
    if (format === "markdown") node.appendChild(markdownFragment(this.doc, text))
    else node.textContent = text
    node.setAttribute("dir", "auto")
    if (lang) node.setAttribute("lang", lang)
    if (mark) {
      const title = mark.onRetry && mark.retryHint ? `${mark.title}\n${mark.retryHint}` : mark.title
      node.appendChild(this.status(mark.kind === "fallback" ? "tt-error" : "tt-tag", mark.label, title, mark.onRetry))
    }
    const s = this.state(unit)
    if (mode === "bilingual") {
      if (mark) node.title = mark.title
      unit.el.appendChild(node)
      s.added = node
    } else {
      node.title = unit.text.length > 600 ? `${unit.text.slice(0, 600)}…` : unit.text
      for (const img of Array.from(unit.el.querySelectorAll("img"))) if (!/^https?:/i.test(img.getAttribute("src") ?? "") && !img.closest(`.${CLS_IMAGE}`)) node.appendChild(img.cloneNode(false))
      const original = this.doc.createElement("span")
      original.className = CLS_ORIGINAL
      original.hidden = true
      original.append(...Array.from(unit.el.childNodes).filter((child) => !(child.nodeType === 1 && (child as Element).classList.contains(CLS_IMAGE))))
      unit.el.prepend(node, original)
      s.original = original
      s.added = node
    }
  }
}
