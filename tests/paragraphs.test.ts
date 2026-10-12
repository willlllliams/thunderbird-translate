// @vitest-environment jsdom
/** Paragraph detection on quotes, tables, lists, code and plain text, and exact restoration after rendering. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { collectParagraphs, extractText } from "../src/content/paragraphs"
import { Renderer } from "../src/content/render"
import { unwrapPlainText } from "../src/content/text"

const texts = (html: string) => {
  document.body.innerHTML = html
  return collectParagraphs(document.body).units.map((u) => u.text)
}
const plain = (body: string) => `<div class="moz-text-plain"><pre class="moz-quote-pre" wrap="">${body}</pre></div>`

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("paragraph detection", () => {
  it.each<[string, string, string[]]>([
    ["nested quotes", `<blockquote type="cite"><p>Outer quote</p><blockquote type="cite">Inner quote text</blockquote></blockquote>`, ["Outer quote", "Inner quote text"]],
    ["a table with header, caption and cells", `<table><caption>Order summary</caption><tr><th>Item name</th></tr><tr><td>Blue chair</td></tr></table>`, ["Order summary", "Item name", "Blue chair"]],
    ["a list item with a nested list", `<ul><li>Fruits to buy<ul><li>Green apples</li></ul></li></ul>`, ["Fruits to buy", "Green apples"]],
    ["an ordered list", `<ol><li>Open the file</li><li>Save it again</li></ol>`, ["Open the file", "Save it again"]],
    ["code-only paragraphs", `<p><code>npm ci</code> <kbd>Ctrl</kbd></p><p><tt>make all</tt></p><p><samp>OK</samp><var>x</var></p>`, []],
    ["code inside prose, kept in the text", `<p>Run <code>npm ci</code> before the build</p>`, ["Run npm ci before the build"]],
    ["a preformatted HTML block with code", `<pre><code>for (const x of list) print(x)</code></pre><p>After the code</p>`, ["After the code"]],
    ["hidden and opted-out elements", `<p hidden>Hidden text</p><p style="visibility:hidden">Invisible text</p><span aria-hidden="true"></span><p class="notranslate">Brand name here</p><p>Visible text</p>`, ["Visible text"]],
    ["a span shown as a block next to inline text", `<div>Inline lead text<span style="display:block">Block span text</span></div>`, ["Inline lead text", "Block span text"]],
    ["a single <br> inside a paragraph", `<p>Line one<br>Line two</p>`, ["Line one\nLine two"]],
    ["<br> runs with whitespace in between", `<div>First part<br> <br>Second part<br><br><br>Third part</div>`, ["First part", "Second part", "Third part"]],
    ["a <br> part without letters", `<div>Only text<br><br>12.00</div>`, ["Only text"]],
    ["whitespace between blocks next to a loose run", `<div>Loose run<p>First block</p> <p>Second block</p></div>`, ["Loose run", "First block", "Second block"]],
    ["a trailing <br> run",`<p>Only one part<br><br></p>`, ["Only one part"]],
    ["inline root without blocks", `<span>Inline root text</span>`, ["Inline root text"]],
  ])("%s", (_name, html, expected) => {
    expect(texts(html)).toEqual(expected)
  })

  it("leaves an inline root alone", () => {
    document.body.innerHTML = "<span>Text inside a span root</span>"
    expect(collectParagraphs(document.body.firstElementChild as HTMLElement).units).toEqual([])
  })

  it("keeps quoted plain-text lines on their own and joins wrapped lines", () => {
    const quoted = "> This quoted line is long enough to be a hard wrapped line\n> continued in the next quoted line."
    expect(texts(plain(`On Monday Anna wrote:\n${quoted}\n\nMy answer.`))).toEqual([`On Monday Anna wrote:\n${quoted}`, "My answer."])
  })

  it("splits a plain-text mail around quote blocks inside it, in document order", () => {
    const html = `<div class="moz-text-plain"><pre class="moz-quote-pre">My reply here.\n\n<blockquote type="cite">Quoted first paragraph.\n\nQuoted second paragraph.</blockquote>\n<span> </span>\n\nAfter the quote.</pre></div>`
    document.body.innerHTML = html
    const units = collectParagraphs(document.body).units
    expect(units.map((u) => [u.text, u.pre])).toEqual([
      ["My reply here.", true],
      ["Quoted first paragraph.", true],
      ["Quoted second paragraph.", true],
      ["After the quote.", true],
    ])
  })

  it("keeps the lines of a quote rendered by Thunderbird, each with its \"> \" tag element, in one paragraph", () => {
    // Markup of Thunderbird 156 for a format=fixed quote; each line used to become a paragraph of its own.
    const cite = '<span class="moz-txt-citetags">&gt; </span>'
    const html = `<div class="moz-text-plain"><pre class="moz-quote-pre">Hello Bob,\n</pre><blockquote type="cite"><pre class="moz-quote-pre">${cite}Could you please confirm that the report will be ready\n${cite}with the client on Thursday?\n</pre></blockquote></div>`
    expect(texts(html)).toEqual(["Hello Bob,", "> Could you please confirm that the report will be ready\n> with the client on Thursday?"])
  })

  it("treats a pre inside .moz-text-flowed as plain text, with CRLF line ends", () => {
    expect(texts(`<div class="moz-text-flowed"><pre>First paragraph\r\n\r\nSecond paragraph</pre></div>`)).toEqual(["First paragraph", "Second paragraph"])
  })

  it("keeps the text of an element whose computed style cannot be read", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      throw new Error("no style")
    })
    expect(texts("<p>Still found</p>")).toEqual(["Still found"])
  })

  it("extracts text without code when asked, and keeps whitespace in pre", () => {
    document.body.innerHTML = "<p>Use <code>x</code> here</p>"
    expect(extractText(document.body.firstChild!, false, true)).toMatch(/^Use +here$/)
    document.body.innerHTML = "<pre>  a  b\n\n\n</pre>"
    expect(extractText(document.body.firstChild!, true)).toBe("  a  b")
  })

  it("does not join a line after a short one", () => {
    expect(unwrapPlainText("Short line\nnext line")).toBe("Short line\nnext line")
    expect(unwrapPlainText("")).toBe("")
  })
})

/** Mails whose paragraphs are wrapped by the detection: inline runs, <br> parts and plain text. */
const WRAPPED = {
  "inline runs next to blocks": "<div>Lead text <b>bold</b><p>A block</p>tail text<br></div>",
  "<br>-separated parts": "<div>Part one<br>still one<br><br>Part two <a href='#'>link</a></div>",
  "a Thunderbird plain-text quote":
    '<div class="moz-text-plain"><pre class="moz-quote-pre">Hi Anna,\n\n</pre><blockquote type="cite"><pre class="moz-quote-pre"><span class="moz-txt-citetags">&gt; </span>First quoted line\n<span class="moz-txt-citetags">&gt; </span>second quoted line\n</pre></blockquote></div>',
  "plain text": plain("Hi Anna,\n\nThe meeting moved to Thursday.\n\n<blockquote type=\"cite\">Old text here\n\nMore old text</blockquote>\nBest,\nTom\n"),
  "a table and a list": "<table><tr><td>Cell one<br><br>Cell two</td></tr></table><ul><li>Item <i>one</i></li></ul>",
}

describe("rendering and restoring", () => {
  it.each(Object.entries(WRAPPED))("%s: both modes, a mode switch and a clear give back the original DOM", (_name, html) => {
    document.body.innerHTML = html
    const original = document.body.innerHTML
    const collected = collectParagraphs(document.body)
    expect(collected.units.length).toBeGreaterThan(1)
    const renderer = new Renderer(document)
    collected.units.forEach((unit, i) => renderer.showTranslation(unit, `T${i}`, i % 2 ? "bilingual" : "translation-only", "zh-CN"))
    expect(document.querySelectorAll(".tt-translation")).toHaveLength(collected.units.length)
    for (const unit of collected.units) renderer.showTranslation(unit, "again", "translation-only")
    renderer.showError(collected.units[0], "HTTP 500", "Failed", () => {})
    renderer.showLoading(collected.units[1], "Translating")
    renderer.clearAll()
    collected.restore()
    expect(document.body.innerHTML).toBe(original)
  })

  it("marks plain-text translations to keep their line breaks and sets the language", () => {
    document.body.innerHTML = plain("Hello there\n\nGood bye")
    const [unit] = collectParagraphs(document.body).units
    new Renderer(document).showTranslation(unit, "你好", "bilingual", "zh-CN")
    const node = unit.el.querySelector(".tt-translation")!
    expect(node.className).toBe("tt-translation tt-bilingual tt-style-border tt-pre")
    expect(node.getAttribute("lang")).toBe("zh-CN")
    expect(node.getAttribute("dir")).toBe("auto")
  })

  it("shows the original as tooltip in translation-only mode, cut after 600 characters", () => {
    const long = "word ".repeat(200).trim()
    document.body.innerHTML = `<p>Short original</p><p>${long}</p>`
    const [short, longUnit] = collectParagraphs(document.body).units
    const r = new Renderer(document)
    r.showTranslation(short, "短", "translation-only")
    r.showTranslation(longUnit, "长", "translation-only")
    expect(short.el.querySelector<HTMLElement>(".tt-only")!.title).toBe("Short original")
    const title = longUnit.el.querySelector<HTMLElement>(".tt-only")!.title
    expect(title).toBe(`${long.slice(0, 600)}…`)
    expect(short.el.querySelector(".tt-only")!.hasAttribute("lang")).toBe(false)
  })

  it("makes a mark a retry button only with a handler, and the click does not reach the page", () => {
    document.body.innerHTML = "<p>Good morning</p><p>See you</p>"
    const [a, b] = collectParagraphs(document.body).units
    const r = new Renderer(document)
    const onRetry = vi.fn()
    const onPage = vi.fn()
    document.body.addEventListener("click", onPage)
    r.showTranslation(a, "早上好", "bilingual", undefined, { kind: "fallback", label: "AI failed", title: "HTTP 401", onRetry })
    r.showTranslation(b, "再见", "bilingual", undefined, { kind: "provisional", label: "Dictionary", title: "waiting" })
    const retry = a.el.querySelector<HTMLElement>(".tt-error")!
    expect(retry.getAttribute("role")).toBe("button")
    expect(a.el.querySelector<HTMLElement>(".tt-fallback")!.title).toBe("HTTP 401")
    retry.click()
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onPage).not.toHaveBeenCalled()
    const tag = b.el.querySelector<HTMLElement>(".tt-tag")!
    expect(tag.hasAttribute("role")).toBe(false)
    expect(tag.textContent).toBe("Dictionary")
  })

  it("clearing a paragraph that shows nothing changes nothing", () => {
    document.body.innerHTML = "<p>Good morning</p>"
    const original = document.body.innerHTML
    const [unit] = collectParagraphs(document.body).units
    new Renderer(document).clear(unit)
    expect(document.body.innerHTML).toBe(original)
  })
})
