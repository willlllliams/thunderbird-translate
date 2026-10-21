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
 * The answers about images (rich: true) read three more kinds of block:
 *
 * - GFM pipe tables: a header row, a delimiter row of as many cells
 *   (:?-+:?), then rows up to a blank line or a line without "|"; a row with
 *   fewer cells gets empty ones, one with more loses the rest; "\|" is a
 *   pipe inside a cell, whose content is read as inline markup. Alignment
 *   becomes the class tt-align-center or tt-align-right, never a style. A
 *   table has at most MAX_TABLE_COLUMNS columns and MAX_TABLE_ROWS rows: one
 *   with more columns stays text, rows past the limit follow as text;
 * - a blank line ends a block: every run of text lines between two blank
 *   lines, lists or tables becomes a <p>, and no <br> stands for the blank line;
 * - a heading line ("# Title" to "###### Title") becomes a paragraph of
 *   bold text: a heading element would break into the headings of the message
 *   around the answer, and the outline screen readers navigate by.
 *
 * The delimiter runs of *, _ and ~~ open and close by the left- and
 * right-flanking rules of CommonMark (0.31), with Unicode whitespace and
 * Unicode punctuation (categories P and S), so 这是**重要**的 is strong while
 * snake_case and file_name.txt stay as they are. One rule goes further than
 * CommonMark: a run of * with an ASCII letter or digit right before and
 * right after it neither opens nor closes, so 2*3*4 stays arithmetic.
 *
 * A link to any other address (javascript:, data:, a relative path, a user
 * name before the host, more than MAX_DESTINATION characters, parentheses
 * nested more than MAX_PARENS deep) stays as its whole source text. Unclosed or invalid markup stays as its characters.
 * Images and HTML are never read, headings and tables only with `rich`: their characters stay.
 *
 * Parsing takes time linear in the length of the text: delimiters are
 * matched with the "openers bottom" bound of CommonMark, closing backtick
 * runs are looked up in an index, at most MAX_PARENS + 1 link destinations
 * read any one character (each one still read has its "(" unclosed, so they
 * nest), and nodes move between lists in constant time. Every line is split
 * into cells at most twice, as a possible header row and as a possible
 * delimiter row, each time in one pass. Elements nest at most MAX_DEPTH deep; deeper markup keeps its text
 * without the element.
 */

/** Inline node: text, code or a container with children. */
interface Inline {
  type: "text" | "code" | "strong" | "em" | "del" | "a"
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

/** How a column of a table is aligned. */
export type TableAlign = "left" | "center" | "right" | ""

/**
 * A block of one translation: lines of text, or a list; `marker` is the character of a bullet list, "." for an ordered
 * one. With `rich`: a table, whose cells hold their source text; a blank line (gap); and text that was a heading line
 * (strong).
 */
export type MarkdownBlock =
  | { kind: "text"; text: string; strong?: true }
  | { kind: "list"; ordered: boolean; start: number; marker: string; items: string[] }
  | { kind: "table"; header: string[]; align: TableAlign[]; rows: string[][] }
  | { kind: "gap" }

export interface MarkdownOptions {
  /** Tables, blank lines as the ends of blocks, heading lines as bold paragraphs: the answers about images. */
  rich?: boolean
  /** A table whose header cells are exactly `from` shows `to` instead, e.g. the English column names in the interface language. */
  header?: { from: readonly string[]; to: readonly string[] }
}

/** A table has at most this many columns; one with more stays text. */
export const MAX_TABLE_COLUMNS = 20
/** A table has at most this many rows besides the header; the rows after them stay text. */
export const MAX_TABLE_ROWS = 300

/** Elements nest at most this deep. */
const MAX_DEPTH = 16
/** A link destination longer than this stays text. */
const MAX_DESTINATION = 2048
/** Parentheses nest at most this deep in a link destination, as in cmark. */
const MAX_PARENS = 32

const ASCII_PUNCT = /[!-/:-@[-`{-~]/
const UNICODE_WS = /[\p{Zs}\t\n\f\r]/u
const UNICODE_PUNCT = /[\p{P}\p{S}]/u
const ASCII_ALNUM = /[A-Za-z0-9]/
/** A list item: up to three spaces, the marker, at least one space or tab, then the text. */
const LIST_ITEM = /^ {0,3}(?:([-*+])|(\d{1,9})\.)[ \t]+(?=\S)(.*)$/
/** The opening of a heading line: up to three spaces, one to six #, then a space, a tab or the end. */
const HEADING = /^ {0,3}#{1,6}(?=[ \t]|$)/
/** A cell of a delimiter row. */
const DELIMITER_CELL = /^[ \t]*(:?)-+(:?)[ \t]*$/

const node = (type: Inline["type"], text = ""): Inline => ({ type, text, href: "", prev: null, next: null, first: null, last: null })

/** The address of a link when its protocol is http:, https: or mailto:, else null. */
export function safeHref(raw: string): string | null {
  if (!/^(?:https?|mailto):/i.test(raw)) return null
  try {
    const url = new URL(raw)
    // https://bank.example@evil.example/ shows one host and goes to another.
    if (url.username || url.password) return null
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
    while (j < s.length && j - start <= MAX_DESTINATION && s[j] !== ">" && s[j] !== "<" && s[j] !== "\n") j += s[j] === "\\" && j + 1 < s.length ? 2 : 1
    if (s[j] !== ">" || j - start > MAX_DESTINATION) return null
    raw = s.slice(start, j++)
  } else {
    const start = j
    let depth = 0
    while (j < s.length && j - start <= MAX_DESTINATION) {
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
      if (depth > MAX_PARENS) return null
      j++
    }
    if (depth !== 0 || j === start || j - start > MAX_DESTINATION) return null
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

/** The text of a heading line without its #s, the closing ones included; null for any other line. */
function headingText(line: string): string | null {
  const open = HEADING.exec(line)
  if (!open) return null
  let rest = line.slice(open[0].length).trim()
  // Closing #s count only after a space or a tab, or as the whole rest.
  let end = rest.length
  while (end > 0 && rest[end - 1] === "#") end--
  if (end === 0 || rest[end - 1] === " " || rest[end - 1] === "\t") rest = rest.slice(0, end).trimEnd()
  return rest
}

/**
 * The cells of a table row, split at every "|" that no backslash escapes, without the pipes at the start and the end;
 * a cell keeps its "\|", which the inline reader turns into "|". One pass over the line.
 */
function rowCells(line: string): string[] {
  const s = line.trim()
  const cells: string[] = []
  let cell = ""
  let closed = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "\\" && i + 1 < s.length) {
      cell += c + s[++i]
      closed = false
    } else if (c === "|") {
      cells.push(cell)
      cell = ""
      closed = true
    } else {
      cell += c
      closed = false
    }
  }
  if (!closed) cells.push(cell)
  if (s.startsWith("|")) cells.shift()
  return cells.map((part) => part.trim())
}

/** The alignment of each column when `line` is a delimiter row of `columns` cells; null otherwise. */
function delimiterRow(line: string, columns: number): TableAlign[] | null {
  if (!line.includes("|")) return null
  const cells = rowCells(line)
  if (cells.length !== columns) return null
  const align: TableAlign[] = []
  for (const cell of cells) {
    const m = DELIMITER_CELL.exec(cell)
    if (!m) return null
    align.push(m[1] && m[2] ? "center" : m[2] ? "right" : m[1] ? "left" : "")
  }
  return align
}

/** Splits a translation into lines of text and lists; with `rich`, also tables, blank lines and heading lines. */
export function markdownBlocks(text: string, { rich = false }: Pick<MarkdownOptions, "rich"> = {}): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let lines: string[] = []
  const flushText = () => {
    if (lines.length > 0) blocks.push({ kind: "text", text: lines.join("\n") })
    lines = []
  }
  const all = text.split(/\r\n?|\n/)
  for (let i = 0; i < all.length; i++) {
    const line = all[i]
    if (rich) {
      if (!line.trim()) {
        flushText()
        if (blocks.length > 0 && blocks.at(-1)!.kind !== "gap") blocks.push({ kind: "gap" })
        continue
      }
      const heading = headingText(line)
      if (heading !== null) {
        flushText()
        blocks.push({ kind: "text", text: heading, strong: true })
        continue
      }
      const header = line.includes("|") ? rowCells(line) : null
      const align = header && header.length > 0 && header.length <= MAX_TABLE_COLUMNS && i + 1 < all.length ? delimiterRow(all[i + 1], header.length) : null
      if (header && align) {
        flushText()
        const rows: string[][] = []
        let j = i + 2
        for (; j < all.length && rows.length < MAX_TABLE_ROWS && all[j].includes("|") && all[j].trim(); j++) {
          const cells = rowCells(all[j]).slice(0, header.length)
          while (cells.length < header.length) cells.push("")
          rows.push(cells)
        }
        blocks.push({ kind: "table", header, align, rows })
        i = j - 1
        continue
      }
    }
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

/** Whether the header of a table is the one `header.from` names. */
const relabelled = (cells: string[], header: MarkdownOptions["header"]) => header !== undefined && cells.length === header.from.length && cells.every((cell, i) => cell === header.from[i])

/** A table with a head and a body; the header cells of options.header show its labels as text. */
function tableElement(doc: Document, block: Extract<MarkdownBlock, { kind: "table" }>, header: MarkdownOptions["header"]): HTMLTableElement {
  const table = doc.createElement("table")
  const labels = relabelled(block.header, header) ? header!.to : null
  const row = (cells: string[], tag: "th" | "td", labels: readonly string[] | null = null) => {
    const tr = doc.createElement("tr")
    cells.forEach((cell, i) => {
      const el = doc.createElement(tag)
      const align = block.align[i]
      if (align === "center" || align === "right") el.className = `tt-align-${align}`
      if (labels) el.appendChild(doc.createTextNode(labels[i]))
      else appendInline(doc, el, parseInline(cell))
      tr.appendChild(el)
    })
    return tr
  }
  const head = doc.createElement("thead")
  head.appendChild(row(block.header, "th", labels))
  table.appendChild(head)
  if (block.rows.length > 0) {
    const body = doc.createElement("tbody")
    for (const cells of block.rows) body.appendChild(row(cells, "td"))
    table.appendChild(body)
  }
  return table
}

/** The DOM of a translation with the Markdown subset rendered; with `rich`, of an answer about an image. */
export function markdownFragment(doc: Document, text: string, options: MarkdownOptions = {}): DocumentFragment {
  const fragment = doc.createDocumentFragment()
  for (const block of markdownBlocks(text, options)) {
    if (block.kind === "gap") continue
    if (block.kind === "table") {
      fragment.appendChild(tableElement(doc, block, options.header))
      continue
    }
    if (block.kind === "text") {
      if (!options.rich) {
        appendInline(doc, fragment, parseInline(block.text))
        continue
      }
      const p = doc.createElement("p")
      const into = block.strong ? p.appendChild(doc.createElement("strong")) : p
      appendInline(doc, into, parseInline(block.text))
      fragment.appendChild(p)
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
 * The text of a translation with the Markdown marks of markdownFragment()
 * removed: the text of emphasis, code and links, list items on lines of
 * their own, ordered ones with their number. For places that show plain
 * text, such as the subjects of a folder. The blocks of the rich form
 * (tables, blank lines) belong to the answers about images, which are only
 * rendered.
 */
export function stripMarkdown(text: string): string {
  const plain = (s: string) => inlineText(parseInline(s))
  return markdownBlocks(text)
    .map((block) => (block.kind === "list" ? block.items.map((item, i) => `${block.ordered ? `${block.start + i}. ` : ""}${plain(item)}`).join("\n") : block.kind === "text" ? plain(block.text) : ""))
    .join("\n")
}
