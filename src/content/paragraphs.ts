/**
 * Finds paragraph-level blocks in a rendered email.
 *
 * A unit is an element whose content is one paragraph: a leaf block (p, li,
 * td, h1–h6, blockquote, div with inline content only…), or a wrapper span
 * created here around
 *   - a run of inline content sitting next to block children,
 *   - a part of an inline container delimited by two or more <br>,
 *   - a blank-line separated paragraph of a plain-text mail (<pre>).
 *
 * Every container changed by wrapping is recorded with its original child
 * list, so restore() puts back the exact original nodes.
 */

import { hasTranslatableText, unwrapPlainText } from "../shared/text"

const CLS_SEG = "tt-seg"
export const CLS_TRANSLATION = "tt-translation"
export const CLS_STATUS = "tt-status"
/** The notice about missing offline data above the message (notice.ts). */
export const CLS_NOTICE = "tt-notice"
/** The line with the subject of the message above the body (controller.ts). */
export const CLS_SUBJECT = "tt-subject"
/** The button, panel or text under an image (images.ts). */
export const CLS_IMAGE = "tt-image"
/** Translation only: the hidden span that keeps the original children of a unit (render.ts). */
export const CLS_ORIGINAL = "tt-original"

export interface Unit {
  /** Element that holds the paragraph and receives the translation. */
  el: HTMLElement
  /** Text sent to the translator. */
  text: string
  /** Comes from a plain-text <pre>: keep whitespace when rendering. */
  pre: boolean
}

export interface Collected {
  units: Unit[]
  restore(): void
}

const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BODY", "CAPTION", "CENTER", "DD", "DETAILS", "DIALOG", "DIR", "DIV", "DL", "DT",
  "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN",
  "MENU", "NAV", "OL", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL", "LEGEND",
])
const BLOCK_SELECTOR = [...BLOCK_TAGS].map((t) => t.toLowerCase()).join(",")
const BLOCK_DISPLAYS = new Set(["block", "flex", "grid", "table", "list-item", "table-cell", "table-row", "table-caption", "flow-root"])

/** Never descend into these. */
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE", "META", "LINK", "SVG", "MATH", "CANVAS", "VIDEO", "AUDIO",
  "IFRAME", "OBJECT", "EMBED", "IMG", "PICTURE", "INPUT", "TEXTAREA", "SELECT", "BUTTON", "OPTION",
  "CODE", "KBD", "SAMP", "VAR",
])
/** Text inside these counts as code: a paragraph made only of it is skipped. */
const CODE_TAGS = new Set(["CODE", "KBD", "SAMP", "VAR", "TT"])

function isOurs(el: Element): boolean {
  return [CLS_TRANSLATION, CLS_STATUS, CLS_NOTICE, CLS_SUBJECT, CLS_IMAGE, CLS_ORIGINAL].some((cls) => el.classList.contains(cls))
}

/**
 * Undo what an earlier content script of this message left behind: after an update or a reload of the extension, its
 * sandbox is gone and its nodes are still there. The original children of translation-only units come back, every
 * added element goes, and every wrapper span gives its children back. Before 2.4.0 translation-only kept the
 * originals in the memory of the content script: such a translation is all the unit still has, so it stays as plain
 * text, which the new content script translates like any other.
 */
export function restoreLeftovers(root: HTMLElement): void {
  for (const only of Array.from(root.querySelectorAll<HTMLElement>(`.${CLS_TRANSLATION}.tt-only`))) {
    if (only.nextElementSibling?.classList.contains(CLS_ORIGINAL)) continue
    for (const mark of Array.from(only.querySelectorAll(`.${CLS_STATUS}`))) mark.remove()
    only.replaceWith(...Array.from(only.childNodes))
  }
  for (const original of Array.from(root.querySelectorAll(`.${CLS_ORIGINAL}`))) original.replaceWith(...Array.from(original.childNodes))
  for (const el of Array.from(root.querySelectorAll(`.${CLS_TRANSLATION}, .${CLS_STATUS}, .${CLS_SUBJECT}, .${CLS_NOTICE}, .${CLS_IMAGE}`))) el.remove()
  for (const seg of Array.from(root.querySelectorAll(`.${CLS_SEG}`))) seg.replaceWith(...Array.from(seg.childNodes))
  root.ownerDocument.getElementById("tt-style-vars")?.remove()
}

function computedDisplay(el: Element): string | null {
  const inline = (el as HTMLElement).style?.display
  if (inline) return inline
  try {
    return el.ownerDocument.defaultView?.getComputedStyle(el).display ?? null
  } catch {
    return null
  }
}

function isHidden(el: Element): boolean {
  const h = el as HTMLElement
  if (h.hidden) return true
  if (el.getAttribute("aria-hidden") === "true" && !el.textContent?.trim()) return true
  const style = h.style
  if (style && (style.display === "none" || style.visibility === "hidden")) return true
  return computedDisplay(el) === "none"
}

function isSkipped(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true
  if (isOurs(el)) return true
  if (el.getAttribute("translate") === "no" || el.classList.contains("notranslate")) return true
  if ((el as HTMLElement).isContentEditable) return true
  return isHidden(el)
}

function isBlockish(el: Element): boolean {
  const tag = el.tagName.toUpperCase()
  if (tag === "BR") return false
  if (BLOCK_TAGS.has(tag)) return true
  const display = (el as HTMLElement).style?.display
  if (display && BLOCK_DISPLAYS.has(display)) return true
  return el.querySelector(BLOCK_SELECTOR) !== null
}

/** Thunderbird renders plain-text mail as <pre class="moz-quote-pre"> inside .moz-text-plain / .moz-text-flowed. */
function isMailTextPre(el: Element): boolean {
  if (el.tagName.toUpperCase() !== "PRE") return false
  return el.classList.contains("moz-quote-pre") || el.closest(".moz-text-plain, .moz-text-flowed") !== null
}

/**
 * Readable text of an inline subtree: whitespace collapsed like HTML, <br> as
 * a newline. With `pre`, whitespace is kept. `skipCode` drops code-like text.
 */
export function extractText(root: Node, pre = false, skipCode = false): string {
  let out = ""
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const data = (node as Text).data
      out += pre ? data : data.replace(/\s+/g, " ")
      return
    }
    if (node.nodeType !== 1) return
    const el = node as Element
    const tag = el.tagName.toUpperCase()
    if (tag === "BR") {
      out += "\n"
      return
    }
    if (isOurs(el)) return
    if (skipCode && CODE_TAGS.has(tag)) return
    if (SKIP_TAGS.has(tag) && !CODE_TAGS.has(tag)) return
    if (isHidden(el)) return
    if (!pre && BLOCK_TAGS.has(tag) && out && !out.endsWith("\n")) out += "\n"
    for (const child of Array.from(el.childNodes)) walk(child)
    if (!pre && BLOCK_TAGS.has(tag) && out && !out.endsWith("\n")) out += "\n"
  }
  walk(root)
  if (pre) return unwrapPlainText(out.replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, ""))
  return out
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type Piece =
  | { kind: "node"; node: Node }
  | { kind: "sep"; node: Node }
  /** A single line break at the edge of a text node. */
  | { kind: "newline"; node: Node }
  | { kind: "block"; node: Element }

export function collectParagraphs(root: HTMLElement): Collected {
  const doc = root.ownerDocument
  const units: Unit[] = []
  const saved: { container: Element; children: Node[] }[] = []

  const addUnit = (el: HTMLElement, pre: boolean) => {
    const text = extractText(el, pre)
    if (!hasTranslatableText(text)) return
    // A paragraph made only of code is left alone.
    if (!pre && !hasTranslatableText(extractText(el, false, true))) return
    units.push({ el, text, pre })
  }

  const wrap = (nodes: Node[]): HTMLElement => {
    const span = doc.createElement("span")
    span.className = CLS_SEG
    for (const n of nodes) span.appendChild(n)
    return span
  }

  const hasText = (nodes: Node[], pre: boolean) =>
    nodes.some((n) => (n.nodeType === 3 ? /\S/.test((n as Text).data) : n.nodeType === 1 && /\S/.test(extractText(n, pre))))

  /** Replace the container's children and remember the originals. */
  const rebuild = (container: Element, original: Node[], children: Node[]) => {
    saved.push({ container, children: original })
    container.replaceChildren(...children)
  }

  /** Plain-text container: paragraphs are separated by blank lines. */
  const segmentPre = (container: Element) => {
    const original = Array.from(container.childNodes)
    const pieces: Piece[] = []
    for (const child of original) {
      if (child.nodeType === 3) {
        const parts = (child as Text).data.split(/(\n[ \t]*\n\s*)/)
        parts.forEach((part, i) => {
          if (!part) return
          if (i % 2 === 1) {
            pieces.push({ kind: "sep", node: doc.createTextNode(part) })
            return
          }
          // Move leading/trailing newlines out of the paragraph.
          const m = /^(\s*\n)?([\s\S]*?)(\n\s*)?$/.exec(part)!
          if (m[1]) pieces.push({ kind: "newline", node: doc.createTextNode(m[1]) })
          if (m[2]) pieces.push({ kind: "node", node: doc.createTextNode(m[2]) })
          if (m[3]) pieces.push({ kind: "newline", node: doc.createTextNode(m[3]) })
        })
      } else if (child.nodeType === 1 && isBlockish(child as Element)) {
        pieces.push({ kind: "block", node: child as Element })
      } else {
        pieces.push({ kind: "node", node: child })
      }
    }

    const out: Node[] = []
    let current: Node[] = []
    const flush = () => {
      if (current.length === 0) return
      if (hasText(current, true)) {
        const span = wrap(current)
        out.push(span)
        addUnit(span, true)
      } else {
        out.push(...current)
      }
      current = []
    }
    /** Line breaks after the current paragraph; they join it only when more inline content follows. */
    let newlines: Node[] = []
    for (const p of pieces) {
      if (p.kind === "newline") newlines.push(p.node)
      else if (p.kind === "node") {
        // Inline content after a single line break, e.g. the "> " tag of the next quoted line, continues the paragraph.
        if (current.length > 0) current.push(...newlines)
        else out.push(...newlines)
        newlines = []
        current.push(p.node)
      } else {
        flush()
        out.push(...newlines, p.node)
        newlines = []
        // Segment a nested block (a quote) in place, so units stay in document order.
        if (p.kind === "block" && !isSkipped(p.node)) segmentPre(p.node)
      }
    }
    flush()
    out.push(...newlines)
    rebuild(container, original, out)
  }

  /** Inline-only container: paragraphs are separated by two or more <br>. */
  const segmentByBr = (container: HTMLElement): boolean => {
    const children = Array.from(container.childNodes)
    const groups: { nodes: Node[]; sep: boolean }[] = []
    let current: Node[] = []
    let i = 0
    while (i < children.length) {
      const node = children[i]
      if (node.nodeType === 1 && (node as Element).tagName.toUpperCase() === "BR") {
        // Collect the run of <br> (whitespace text allowed in between).
        let j = i
        let brs = 0
        while (
          j < children.length &&
          ((children[j].nodeType === 1 && (children[j] as Element).tagName.toUpperCase() === "BR") ||
            (children[j].nodeType === 3 && !/\S/.test((children[j] as Text).data)))
        ) {
          if (children[j].nodeType === 1) brs++
          j++
        }
        if (brs >= 2) {
          groups.push({ nodes: current, sep: false })
          groups.push({ nodes: children.slice(i, j), sep: true })
          current = []
          i = j
          continue
        }
      }
      current.push(node)
      i++
    }
    groups.push({ nodes: current, sep: false })

    const paragraphs = groups.filter((g) => !g.sep && hasText(g.nodes, false))
    if (paragraphs.length < 2) return false

    const out: Node[] = []
    const spans: HTMLElement[] = []
    for (const g of groups) {
      if (!g.sep && hasText(g.nodes, false)) {
        const span = wrap(g.nodes)
        spans.push(span)
        out.push(span)
      } else {
        out.push(...g.nodes)
      }
    }
    rebuild(container, children, out)
    for (const s of spans) addUnit(s, false)
    return true
  }

  /** Block container with block children: walk children, wrap loose inline runs. */
  const walkMixed = (container: HTMLElement) => {
    const children = Array.from(container.childNodes)
    let run: Node[] = []
    const items: (Node[] | Element)[] = []
    for (const child of children) {
      if (child.nodeType === 1 && isBlockish(child as Element)) {
        if (run.length) items.push(run)
        run = []
        items.push(child as Element)
      } else {
        run.push(child)
      }
    }
    if (run.length) items.push(run)

    const needsWrap = items.some((it) => Array.isArray(it) && hasText(it, false))
    if (needsWrap) {
      const out: Node[] = []
      const spans: HTMLElement[] = []
      for (const it of items) {
        if (Array.isArray(it)) {
          if (hasText(it, false)) {
            const span = wrap(it)
            spans.push(span)
            out.push(span)
          } else out.push(...it)
        } else out.push(it)
      }
      rebuild(container, children, out)
      // Keep document order: walk items again, now with spans in place.
      let s = 0
      for (const it of items) {
        if (Array.isArray(it)) {
          if (hasText(it, false)) visitLeaf(spans[s++])
        } else walk(it as HTMLElement)
      }
    } else {
      for (const it of items) if (!Array.isArray(it)) walk(it as HTMLElement)
    }
  }

  const visitLeaf = (el: HTMLElement) => {
    if (!segmentByBr(el)) addUnit(el, false)
  }

  const walk = (el: HTMLElement) => {
    if (isSkipped(el)) return
    if (isMailTextPre(el)) {
      segmentPre(el)
      return
    }
    if (el.tagName.toUpperCase() === "PRE") return // preformatted HTML: treat as code
    const hasBlockChild = Array.from(el.children).some((c) => isBlockish(c))
    if (!hasBlockChild) {
      if (el === root && !BLOCK_TAGS.has(el.tagName.toUpperCase())) return
      visitLeaf(el)
      return
    }
    walkMixed(el)
  }

  walk(root)

  return {
    units,
    restore() {
      for (let i = saved.length - 1; i >= 0; i--) {
        saved[i].container.replaceChildren(...saved[i].children)
      }
      saved.length = 0
    },
  }
}
