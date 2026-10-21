/**
 * A small Markdown reader for the translations of the AI tier.
 *
 * It knows a safe subset and builds DOM nodes with createElement and
 * createTextNode only; no text is ever parsed as HTML.
 *
 * - inline: **strong** and __strong__, *emphasis* and _emphasis_, `code`,
 *   ~~strikethrough~~, [text](url) with an http:, https: or mailto: address,
 *   and backslash escapes of ASCII punctuation;
 * - blocks, inside one translation: consecutive lines starting with "- ",
 *   "* ", "+ " or "1. " become a list, and every other line break a <br>.
 *
 * The delimiter runs of *, _ and ~~ open and close by the left- and
 * right-flanking rules of CommonMark (0.31), with Unicode whitespace and
 * Unicode punctuation (categories P and S), so 这是**重要**的 is strong while
 * snake_case and file_name.txt stay as they are. One rule goes further than
 * CommonMark: a run of * with an ASCII letter or digit right before and
 * right after it neither opens nor closes, so 2*3*4 stays arithmetic.
 *
 * A link to any other address (javascript:, data:, a relative path) stays as
 * its whole source text. Unclosed or invalid markup stays as its characters.
 * Headings, tables, images and HTML are not read: their characters stay.
 *
 * Parsing takes time linear in the length of the text: delimiters are
 * matched with the "openers bottom" bound of CommonMark, closing backtick
 * runs are looked up in an index, and nodes move between lists in constant
 * time. Elements nest at most MAX_DEPTH deep; deeper markup keeps its text
 * without the element.
 */

/** Inline node: text, code, a line break or a container with children. */
interface Inline {
  type: "text" | "code" | "br" | "strong" | "em" | "del" | "a"
  /** text and code. */
  text: string
  /** a: the checked address. */
  href: string
  prev: Inline | null
  next: Inline | null
  first: Inline | null
  last: Inline | null
}

/** A delimiter run of *, _ or ~~ that can open or close. */
interface Delim {
  node: Inline
  char: string
  /** Characters left in the run. */
  count: number
  /** Length of the run in the source. */
  orig: number
  canOpen: boolean
  canClose: boolean
  prev: Delim | null
  next: Delim | null
}

/** An opening [ that may become a link, or ![ of an image, which stays as its source text. */
interface Bracket {
  node: Inline
  image: boolean
  /** Position of the [ in the source. */
  pos: number
  /** The top of the delimiter stack when the [ was read. */
  bottom: Delim | null
  active: boolean
  prev: Bracket | null
}

/** A block of one translation: lines of text, or a list; `marker` is the character of a bullet list, "." for an ordered one. */
export type MarkdownBlock = { kind: "text"; text: string } | { kind: "list"; ordered: boolean; start: number; marker: string; items: string[] }

/** Elements nest at most this deep. */
const MAX_DEPTH = 16

const ASCII_PUNCT = /[!-/:-@[-`{-~]/
const UNICODE_WS = /[\p{Zs}\t\n\f\r]/u
const UNICODE_PUNCT = /[\p{P}\p{S}]/u
const ASCII_ALNUM = /[A-Za-z0-9]/
/** A list item: up to three spaces, the marker, at least one space or tab, then the text. */
const LIST_ITEM = /^ {0,3}(?:([-*+])|(\d{1,9})\.)[ \t]+(?=\S)(.*)$/

const node = (type: Inline["type"], text = ""): Inline => ({ type, text, href: "", prev: null, next: null, first: null, last: null })

/** The address of a link when its protocol is http:, https: or mailto:, else null. */
export function safeHref(raw: string): string | null {
  if (!/^(?:https?|mailto):/i.test(raw)) return null
  try {
    const url = new URL(raw)
    return url.protocol === "mailto:" || url.host ? url.href : null
  } catch {
    return null
  }
}

const unescapePunct = (s: string) => s.replace(/\\([!-/:-@[-`{-~])/g, "$1")

/** The destination of a link from "(" at `i`: "(url)" or "(<url>)"; null when there is none. */
function linkDestination(s: string, i: number): { raw: string; end: number } | null {
  if (s[i] !== "(") return null
  let j = i + 1
  while (s[j] === " " || s[j] === "\t") j++
  let raw: string
  if (s[j] === "<") {
    const start = ++j
    while (j < s.length && s[j] !== ">" && s[j] !== "<" && s[j] !== "\n") j += s[j] === "\\" && j + 1 < s.length ? 2 : 1
    if (s[j] !== ">") return null
    raw = s.slice(start, j++)
  } else {
    const start = j
    let depth = 0
    while (j < s.length) {
      const c = s[j]
      if (c === "\\" && ASCII_PUNCT.test(s[j + 1] ?? "")) {
        j += 2
        continue
      }
      if (c <= " " || c === "\x7f") break
      if (c === "(") depth++
      else if (c === ")") {
        if (depth === 0) break
        depth--
      }
      j++
    }
    if (depth !== 0 || j === start) return null
    raw = s.slice(start, j)
  }
  while (s[j] === " " || s[j] === "\t") j++
  if (s[j] !== ")") return null
  return { raw: unescapePunct(raw), end: j + 1 }
}

/** The character before `i`, a whole code point; a newline at the start. */
function charBefore(s: string, i: number): string {
  if (i <= 0) return "\n"
  const low = s.charCodeAt(i - 1)
  return low >= 0xdc00 && low <= 0xdfff && i >= 2 ? s.slice(i - 2, i) : s[i - 1]
}

/** The character at `i`, a whole code point; a newline at the end. */
function charAt(s: string, i: number): string {
  return i >= s.length ? "\n" : String.fromCodePoint(s.codePointAt(i)!)
}

/** Parses the inline markup of `s` into a list of nodes. */
function parseInline(s: string): Inline {
  const root = node("text")
  let delims: Delim | null = null
  let brackets: Bracket | null = null
  let buffer = ""

  const append = (n: Inline) => {
    n.prev = root.last
    n.next = null
    if (root.last) root.last.next = n
    else root.first = n
    root.last = n
  }
  const unlink = (n: Inline) => {
    if (n.prev) n.prev.next = n.next
    else root.first = n.next
    if (n.next) n.next.prev = n.prev
    else root.last = n.prev
  }
  const flush = () => {
    if (buffer) append(node("text", buffer))
    buffer = ""
  }
  const removeDelim = (d: Delim) => {
    if (d.prev) d.prev.next = d.next
    if (d.next) d.next.prev = d.prev
    else delims = d.prev
  }

  // Closing backtick runs, by length: positions in ascending order.
  const runs = new Map<number, number[]>()
  for (const m of s.matchAll(/`+/g)) {
    const list = runs.get(m[0].length) ?? []
    list.push(m.index)
    runs.set(m[0].length, list)
  }
  /** The first run of `length` backticks that starts at or after `from`. */
  const closingRun = (length: number, from: number): number => {
    const list = runs.get(length)
    if (!list) return -1
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (list[mid] < from) lo = mid + 1
      else hi = mid
    }
    return lo < list.length ? list[lo] : -1
  }

  /** Match the delimiters above `bottom` into strong, em and del nodes (CommonMark's "process emphasis"). */
  const processEmphasis = (bottom: Delim | null) => {
    const openersBottom = new Map<string, Delim | null>()
    // The lowest delimiter above bottom.
    let closer: Delim | null = delims === bottom ? null : delims
    while (closer && closer.prev !== bottom) closer = closer.prev
    while (closer) {
      if (!closer.canClose) {
        closer = closer.next
        continue
      }
      const key = `${closer.char}${closer.canOpen ? 1 : 0}${closer.orig % 3}`
      const floor = openersBottom.has(key) ? openersBottom.get(key)! : bottom
      let opener: Delim | null = closer.prev
      let found = false
      while (opener && opener !== bottom && opener !== floor) {
        const odd = (closer.canOpen || opener.canClose) && closer.orig % 3 !== 0 && (opener.orig + closer.orig) % 3 === 0
        if (opener.char === closer.char && opener.canOpen && (closer.char === "~" || !odd)) {
          found = true
          break
        }
        opener = opener.prev
      }
      if (found && opener) {
        const use = closer.char === "~" ? 2 : closer.count >= 2 && opener.count >= 2 ? 2 : 1
        opener.count -= use
        closer.count -= use
        opener.node.text = opener.node.text.slice(0, opener.count)
        closer.node.text = closer.node.text.slice(0, closer.count)
        const wrapper = node(closer.char === "~" ? "del" : use === 2 ? "strong" : "em")
        // Move the nodes between the two runs into the wrapper.
        const a = opener.node
        const b = closer.node
        // Two runs of one character are never next to each other: at least one node lies between them.
        wrapper.first = a.next!
        wrapper.last = b.prev!
        wrapper.first.prev = null
        wrapper.last.next = null
        a.next = wrapper
        wrapper.prev = a
        wrapper.next = b
        b.prev = wrapper
        // The delimiters between them are gone.
        opener.next = closer
        closer.prev = opener
        if (opener.count === 0) {
          unlink(opener.node)
          removeDelim(opener)
        }
        if (closer.count === 0) {
          const next: Delim | null = closer.next
          unlink(closer.node)
          removeDelim(closer)
          closer = next
        }
      } else {
        openersBottom.set(key, closer.prev)
        const next: Delim | null = closer.next
        if (!closer.canOpen) removeDelim(closer)
        closer = next
      }
    }
    while (delims && delims !== bottom) removeDelim(delims)
  }

  let pos = 0
  while (pos < s.length) {
    const c = s[pos]
    if (c === "\\") {
      const next = s[pos + 1] ?? ""
      if (ASCII_PUNCT.test(next)) {
        buffer += next
        pos += 2
      } else {
        buffer += c
        pos++
      }
      continue
    }
    if (c === "`") {
      let end = pos
      while (s[end] === "`") end++
      const length = end - pos
      const close = closingRun(length, end)
      if (close === -1) {
        buffer += s.slice(pos, end)
        pos = end
        continue
      }
      flush()
      let code = s.slice(end, close).replace(/\n/g, " ")
      if (code.length >= 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1)
      append(node("code", code))
      pos = close + length
      continue
    }
    if (c === "*" || c === "_" || c === "~") {
      let end = pos
      while (s[end] === c) end++
      const length = end - pos
      const before = charBefore(s, pos)
      const after = charAt(s, end)
      const wsBefore = UNICODE_WS.test(before)
      const wsAfter = UNICODE_WS.test(after)
      const punctBefore = UNICODE_PUNCT.test(before)
      const punctAfter = UNICODE_PUNCT.test(after)
      const left = !wsAfter && (!punctAfter || wsBefore || punctBefore)
      const right = !wsBefore && (!punctBefore || wsAfter || punctAfter)
      let canOpen: boolean
      let canClose: boolean
      if (c === "_" || (c === "*" && ASCII_ALNUM.test(before) && ASCII_ALNUM.test(after))) {
        canOpen = left && (!right || punctBefore)
        canClose = right && (!left || punctAfter)
      } else {
        canOpen = left
        canClose = right
      }
      if (c === "~" && length !== 2) canOpen = canClose = false
      if (!canOpen && !canClose) {
        buffer += s.slice(pos, end)
        pos = end
        continue
      }
      flush()
      const run = node("text", s.slice(pos, end))
      append(run)
      const d: Delim = { node: run, char: c, count: length, orig: length, canOpen, canClose, prev: delims, next: null }
      if (delims) delims.next = d
      delims = d
      pos = end
      continue
    }
    if (c === "[") {
      const image = buffer.endsWith("!") && s[pos - 1] === "!" && s[pos - 2] !== "\\"
      if (image) buffer = buffer.slice(0, -1)
      flush()
      const open = node("text", image ? "![" : "[")
      append(open)
      brackets = { node: open, image, pos: image ? pos - 1 : pos, bottom: delims, active: true, prev: brackets }
      pos++
      continue
    }
    if (c === "]" && brackets) {
      const opener: Bracket = brackets
      const dest = opener.active ? linkDestination(s, pos + 1) : null
      if (!dest) {
        brackets = opener.prev
        buffer += c
        pos++
        continue
      }
      flush()
      brackets = opener.prev
      const href = opener.image ? null : safeHref(dest.raw)
      if (!href) {
        // An image, or a link with another protocol: the whole of it stays as its source text.
        while (root.last !== opener.node) unlink(root.last!)
        unlink(opener.node)
        while (delims !== opener.bottom) removeDelim(delims!)
        append(node("text", s.slice(opener.pos, dest.end)))
        pos = dest.end
        continue
      }
      processEmphasis(opener.bottom)
      const link = node("a")
      link.href = href
      const first = opener.node.next
      if (first) {
        link.first = first
        link.last = root.last
        first.prev = null
      }
      root.last = opener.node
      opener.node.next = null
      unlink(opener.node)
      append(link)
      // A link holds no other link: the brackets before it no longer open one.
      for (let b = brackets; b && b.active; b = b.prev) b.active = false
      pos = dest.end
      continue
    }
    buffer += c
    pos++
  }
  flush()
  processEmphasis(null)
  return root
}

/** Splits a translation into lines of text and lists. */
export function markdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let lines: string[] = []
  const flushText = () => {
    if (lines.length > 0) blocks.push({ kind: "text", text: lines.join("\n") })
    lines = []
  }
  for (const line of text.split(/\r\n?|\n/)) {
    const m = LIST_ITEM.exec(line)
    const last = blocks.at(-1)
    if (m) {
      const ordered = m[2] !== undefined
      const marker = m[1] ?? "."
      if (lines.length === 0 && last?.kind === "list" && last.marker === marker) {
        last.items.push(m[3])
        continue
      }
      // An ordered list interrupts a line of text only when it starts at 1, as in CommonMark.
      if (!ordered || lines.length === 0 || lines.at(-1)!.trim() === "" || Number(m[2]) === 1) {
        flushText()
        blocks.push({ kind: "list", ordered, start: ordered ? Number(m[2]) : 1, marker, items: [m[3]] })
        continue
      }
    }
    lines.push(line)
  }
  flushText()
  return blocks
}

/** Builds the DOM of an inline list under `parent`, without recursion; containers deeper than MAX_DEPTH add only their children. */
function appendInline(doc: Document, parent: Node, root: Inline): void {
  const stack: { node: Inline | null; into: Node; depth: number }[] = [{ node: root.first, into: parent, depth: 0 }]
  while (stack.length > 0) {
    const top = stack[stack.length - 1]
    const n = top.node
    if (!n) {
      stack.pop()
      continue
    }
    top.node = n.next
    if (n.type === "text") {
      const parts = n.text.split("\n")
      parts.forEach((part, i) => {
        if (i > 0) top.into.appendChild(doc.createElement("br"))
        if (part) top.into.appendChild(doc.createTextNode(part))
      })
    } else if (n.type === "code") {
      const code = doc.createElement("code")
      code.textContent = n.text
      top.into.appendChild(code)
    } else {
      let into = top.into
      if (top.depth < MAX_DEPTH) {
        const el = doc.createElement(n.type)
        if (n.type === "a") {
          el.setAttribute("href", n.href)
          el.setAttribute("rel", "noopener noreferrer")
        }
        top.into.appendChild(el)
        into = el
      }
      stack.push({ node: n.first, into, depth: top.depth + 1 })
    }
  }
}

/** The DOM of a translation with the Markdown subset rendered. */
export function markdownFragment(doc: Document, text: string): DocumentFragment {
  const fragment = doc.createDocumentFragment()
  for (const block of markdownBlocks(text)) {
    if (block.kind === "text") {
      appendInline(doc, fragment, parseInline(block.text))
      continue
    }
    const list = doc.createElement(block.ordered ? "ol" : "ul")
    if (block.ordered && block.start !== 1) list.setAttribute("start", String(block.start))
    for (const item of block.items) {
      const li = doc.createElement("li")
      appendInline(doc, li, parseInline(item))
      list.appendChild(li)
    }
    fragment.appendChild(list)
  }
  return fragment
}

/** The text of an inline list, without recursion. */
function inlineText(root: Inline): string {
  let out = ""
  const stack: (Inline | null)[] = [root.first]
  while (stack.length > 0) {
    const n = stack[stack.length - 1]
    if (!n) {
      stack.pop()
      continue
    }
    stack[stack.length - 1] = n.next
    if (n.type === "text" || n.type === "code") out += n.text
    else stack.push(n.first)
  }
  return out
}

/**
 * The text of a translation with the Markdown marks of renderMarkdown()
 * removed: the text of emphasis, code and links, list items on lines of
 * their own, ordered ones with their number. For places that show plain
 * text, such as the subjects of a folder.
 */
export function stripMarkdown(text: string): string {
  return markdownBlocks(text)
    .map((block) =>
      block.kind === "text" ? inlineText(parseInline(block.text)) : block.items.map((item, i) => `${block.ordered ? `${block.start + i}. ` : ""}${inlineText(parseInline(item))}`).join("\n"),
    )
    .join("\n")
}
