// @vitest-environment jsdom
/** The Markdown subset of AI translations (src/shared/markdown.ts): syntax, CommonMark delimiter rules, escapes, blocks, safety, time. */
import { describe, expect, it } from "vitest"
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, markdownBlocks, markdownFragment, safeHref } from "../src/shared/markdown"

/** The rendered DOM as HTML, read back for the assertion only. */
function html(text: string): string {
  const div = document.createElement("div")
  div.appendChild(markdownFragment(document, text))
  return div.innerHTML
}

/** Every element of the rendered DOM with its attributes. */
function elements(text: string): { tag: string; attrs: string[] }[] {
  const div = document.createElement("div")
  div.appendChild(markdownFragment(document, text))
  return Array.from(div.querySelectorAll("*"), (el) => ({ tag: el.tagName.toLowerCase(), attrs: el.getAttributeNames() }))
}

/** The text the rendered DOM shows. */
function shown(text: string): string {
  const div = document.createElement("div")
  div.appendChild(markdownFragment(document, text))
  return div.textContent ?? ""
}

const ALLOWED: Record<string, string[]> = { strong: [], em: [], code: [], del: [], a: ["href", "rel"], ul: [], ol: ["start"], li: [], br: [] }

/** Only the allowed elements and attributes, every link to http:, https: or mailto:. */
function expectSafe(text: string): void {
  const div = document.createElement("div")
  div.appendChild(markdownFragment(document, text))
  for (const el of Array.from(div.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase()
    expect(Object.keys(ALLOWED)).toContain(tag)
    for (const name of el.getAttributeNames()) expect(ALLOWED[tag]).toContain(name)
    if (tag === "a") expect(new URL(el.getAttribute("href")!).protocol).toMatch(/^(https?|mailto):$/)
    if (tag === "ol" && el.hasAttribute("start")) expect(el.getAttribute("start")).toMatch(/^\d+$/)
  }
  for (const node of Array.from(div.querySelectorAll("*")).flatMap((el) => Array.from(el.childNodes))) expect([1, 3]).toContain(node.nodeType)
}

describe("inline syntax", () => {
  it.each([
    ["**strong**", "<strong>strong</strong>"],
    ["__strong__", "<strong>strong</strong>"],
    ["*em*", "<em>em</em>"],
    ["_em_", "<em>em</em>"],
    ["***both***", "<em><strong>both</strong></em>"],
    ["~~gone~~", "<del>gone</del>"],
    ["`a *b* c`", "<code>a *b* c</code>"],
    ["``a ` b``", "<code>a ` b</code>"],
    ["` `` `", "<code>``</code>"],
    ["`  `", "<code>  </code>"],
    ["[text](https://example.com/a?b=1)", '<a href="https://example.com/a?b=1" rel="noopener noreferrer">text</a>'],
    ["[mail](mailto:bob@example.com)", '<a href="mailto:bob@example.com" rel="noopener noreferrer">mail</a>'],
    ["[x](<https://example.com/a b>)", '<a href="https://example.com/a%20b" rel="noopener noreferrer">x</a>'],
    ["[wiki](https://en.wikipedia.org/wiki/Foo_(bar))", '<a href="https://en.wikipedia.org/wiki/Foo_(bar)" rel="noopener noreferrer">wiki</a>'],
    ["[**bold** link](http://example.com)", '<a href="http://example.com/" rel="noopener noreferrer"><strong>bold</strong> link</a>'],
    ["**[link](https://a.example) inside**", '<strong><a href="https://a.example/" rel="noopener noreferrer">link</a> inside</strong>'],
    ["a ~~b *c*~~ d", "a <del>b <em>c</em></del> d"],
  ])("%s", (text, expected) => {
    expect(html(text)).toBe(expected)
  })

  it("closes each code span with the next run of the same length", () => {
    expect(html("`a` `b` ``c`` `d`")).toBe("<code>a</code> <code>b</code> <code>c</code> <code>d</code>")
    expect(html("``a`b`` and `c`")).toBe("<code>a`b</code> and <code>c</code>")
  })

  it("reads a destination in angle brackets", () => {
    expect(html("[x](<https://e.com/a\\>b>)")).toBe('<a href="https://e.com/a%3Eb" rel="noopener noreferrer">x</a>')
    for (const text of ["[x](<https://e.com)", "[x](<https://e.com<b>)", "[x](<https://e.com\nb>)", "[x](<https://e.com> y)"]) expect(html(text)).not.toContain("<a")
  })

  it("keeps what is inside code as it is", () => {
    expect(html("`**not bold** [x](https://e.com)`")).toBe("<code>**not bold** [x](https://e.com)</code>")
    expect(html("`a\nb`")).toBe("<code>a b</code>")
  })

  it("leaves unclosed and invalid markup as its characters", () => {
    for (const text of ["**open", "open**", "*a", "`code", "``a`", "~~a", "~one~", "~~~three~~~", "[text]", "[text](", "[text](https://e.com", "[a](b c)", "a ] b", "[]()"]) {
      expect(html(text)).toBe(text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    }
  })

  it("reads backslash escapes of ASCII punctuation", () => {
    expect(html("\\*not em\\*")).toBe("*not em*")
    expect(html("\\_a\\_ \\`b\\` \\[c\\](https://e.com) \\~~d~~")).toBe("_a_ `b` [c](https://e.com) ~~d~~")
    expect(html("\\\\*em*")).toBe("\\<em>em</em>")
    // Other characters keep their backslash.
    expect(html("C:\\Users\\a")).toBe("C:\\Users\\a")
    expect(html("[x](https://e.com/\\(a\\))")).toBe('<a href="https://e.com/(a)" rel="noopener noreferrer">x</a>')
  })

  it("matches nested and mixed runs as CommonMark does", () => {
    expect(html("*a **b** c*")).toBe("<em>a <strong>b</strong> c</em>")
    expect(html("**a *b* c**")).toBe("<strong>a <em>b</em> c</strong>")
    // The ** between a and b has an ASCII letter on both sides: it neither opens nor closes.
    expect(html("**a**b**")).toBe("<strong>a**b</strong>")
    expect(html("**a** b**")).toBe("<strong>a</strong> b**")
    expect(html("*a**")).toBe("<em>a</em>*")
    expect(html("**a*")).toBe("*<em>a</em>")
    // The rule of three: *foo**bar* is one emphasis.
    expect(html("*foo**bar*")).toBe("<em>foo**bar</em>")
    expect(html("_a *b_ c*")).toBe("<em>a *b</em> c*")
  })

  it("keeps a link that is not in the text of another", () => {
    expect(html("[a [b](https://b.example) c](https://a.example)")).toBe('[a <a href="https://b.example/" rel="noopener noreferrer">b</a> c](https://a.example)')
    expect(html("[a [b] c](https://e.com)")).toBe('<a href="https://e.com/" rel="noopener noreferrer">a [b] c</a>')
  })
})

describe("delimiter rules", () => {
  it.each([
    // Intraword underscores never delimit.
    ["snake_case_name", "snake_case_name"],
    ["file_name.txt and other_file.txt", "file_name.txt and other_file.txt"],
    ["__init__.py", "<strong>init</strong>.py"],
    // A * between two ASCII letters or digits neither opens nor closes.
    ["2*3*4", "2*3*4"],
    ["a*b*c", "a*b*c"],
    ["x * y * z", "x * y * z"],
    ["5 * 3 = 15 and *done*", "5 * 3 = 15 and <em>done</em>"],
    // Flanking: a run followed by whitespace cannot open, preceded by whitespace cannot close.
    ["a * not em * b", "a * not em * b"],
    ["** not strong **", "** not strong **"],
    ["a * b*", "a * b*"],
    // Punctuation: an opener before punctuation needs whitespace or punctuation in front of it.
    ['say *"hi"* now', 'say <em>"hi"</em> now'],
    ['a*"b"*c', 'a*"b"*c'],
    ["(*a*)", "(<em>a</em>)"],
    ["**foo.**bar", "**foo.**bar"],
    ["*foo*bar", "*foo*bar"],
    ["*foo* bar", "<em>foo</em> bar"],
    ["*Foo*-bar", "<em>Foo</em>-bar"],
    ["_foo_bar", "_foo_bar"],
    ["_foo_.", "<em>foo</em>."],
  ])("%s", (text, expected) => {
    expect(html(text)).toBe(expected)
  })

  it("delimits beside CJK letters by the Unicode rules", () => {
    expect(html("这是**重要**的通知")).toBe("这是<strong>重要</strong>的通知")
    expect(html("这是*强调*的")).toBe("这是<em>强调</em>的")
    expect(html("会议在`周四`举行")).toBe("会议在<code>周四</code>举行")
    expect(html("日本語の**太字**です")).toBe("日本語の<strong>太字</strong>です")
    expect(html("한국어 **굵게** 표시")).toBe("한국어 <strong>굵게</strong> 표시")
    // Full-width punctuation is Unicode punctuation: after it, a closer needs whitespace or punctuation, as in CommonMark.
    expect(html("请**注意：**明天")).toBe("请**注意：**明天")
    expect(html("请**注意：** 明天")).toBe("请<strong>注意：</strong> 明天")
    expect(html("“**重要**”")).toBe("“<strong>重要</strong>”")
    // An ideographic space is Unicode whitespace.
    expect(html("**　空白**")).toBe("**　空白**")
    // Underscores between CJK letters are intraword.
    expect(html("中文_强调_中文")).toBe("中文_强调_中文")
  })

  it("treats letters outside the Basic Multilingual Plane as whole characters", () => {
    expect(html("𠀀**𠀁**𠀂")).toBe("𠀀<strong>𠀁</strong>𠀂")
    expect(html("😀*a*😀")).toBe("😀<em>a</em>😀")
  })

  it("keeps right-to-left text and its marks", () => {
    expect(html("مرحبا **بالعالم**")).toBe("مرحبا <strong>بالعالم</strong>")
    expect(html("שלום \u202e*abc*\u202c")).toBe("שלום \u202e<em>abc</em>\u202c")
  })
})

describe("blocks", () => {
  it("renders a single line break as <br>", () => {
    expect(html("one\ntwo\r\nthree")).toBe("one<br>two<br>three")
    expect(html("one\n\ntwo")).toBe("one<br><br>two")
  })

  it("lets emphasis span a line break", () => {
    expect(html("**a\nb**")).toBe("<strong>a<br>b</strong>")
  })

  it("renders consecutive list lines as a list", () => {
    expect(html("- a\n- **b**\n- c")).toBe("<ul><li>a</li><li><strong>b</strong></li><li>c</li></ul>")
    expect(html("* a\n* b")).toBe("<ul><li>a</li><li>b</li></ul>")
    expect(html("+ a")).toBe("<ul><li>a</li></ul>")
    expect(html("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>")
    expect(html("3. c\n4. d")).toBe('<ol start="3"><li>c</li><li>d</li></ol>')
  })

  it("puts text before and after a list around it", () => {
    expect(html("Please:\n- a\n- b\nThanks")).toBe("Please:<ul><li>a</li><li>b</li></ul>Thanks")
    expect(html("Please:\n\n- a\n\nThanks")).toBe("Please:<br><ul><li>a</li></ul><br>Thanks")
  })

  it("starts a new list with another marker", () => {
    expect(html("- a\n* b\n1. c")).toBe("<ul><li>a</li></ul><ul><li>b</li></ul><ol><li>c</li></ol>")
  })

  it("reads only the list lines that CommonMark reads", () => {
    // No space after the marker, nothing after it, or four spaces of indentation.
    for (const text of ["-a", "- ", "1.a", "    - a", "**bold** start", "-- signature", "1) a"]) expect(html(text)).not.toContain("<li>")
    // An ordered list interrupts a line of text only from 1.
    expect(html("We meet on\n3. October")).toBe("We meet on<br>3. October")
    expect(html("Steps:\n1. a\n2. b")).toBe("Steps:<ol><li>a</li><li>b</li></ol>")
    expect(html("3. Oktober ist ein Feiertag.")).toBe('<ol start="3"><li>Oktober ist ein Feiertag.</li></ol>')
  })

  it("leaves headings, tables, images, quotes and rules as their characters", () => {
    expect(html("# Title")).toBe("# Title")
    expect(html("| a | b |\n|---|---|")).toBe("| a | b |<br>|---|---|")
    expect(html("![logo](https://e.com/logo.png)")).toBe("![logo](https://e.com/logo.png)")
    expect(html("> quote")).toBe("&gt; quote")
    expect(html("---")).toBe("---")
  })

  it("splits the blocks of a translation", () => {
    expect(markdownBlocks("a\n- b\n- c\nd")).toEqual([
      { kind: "text", text: "a" },
      { kind: "list", ordered: false, start: 1, marker: "-", items: ["b", "c"] },
      { kind: "text", text: "d" },
    ])
  })
})

describe("links", () => {
  it("accepts http:, https: and mailto: only", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com/")
    expect(safeHref("HTTP://EXAMPLE.COM/A")).toBe("http://example.com/A")
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com")
    for (const raw of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "file:///etc/passwd", "ftp://e.com", "/relative", "page.html", "//e.com", "http:", "https://", "http://[bad"]) {
      expect(safeHref(raw)).toBeNull()
    }
  })

  it("keeps a link to another address as its whole source text", () => {
    expect(html("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))")
    expect(html("see [**x**](data:text/html,hi) now")).toBe("see [**x**](data:text/html,hi) now")
    expect(html("[a](page.html) and *b*")).toBe("[a](page.html) and <em>b</em>")
    expect(html("*[a](javascript:x)*")).toBe("<em>[a](javascript:x)</em>")
  })

  it("keeps a link with a user name or a password before the host as its source text", () => {
    for (const text of ["[https://a.example](https://a.example@b.example/)", "[x](https://user:pw@b.example/)", "[x](<http://:pw@b.example>)"]) {
      expect(elements(text)).toEqual([])
      expect(shown(text)).toBe(text)
    }
  })

  it("reads a destination of up to 2048 characters", () => {
    const at = `https://e.com/${"a".repeat(2048 - 14)}`
    expect(html(`[x](${at})`)).toBe(`<a href="${at}" rel="noopener noreferrer">x</a>`)
    expect(html(`[x](<${at}>)`)).toBe(`<a href="${at}" rel="noopener noreferrer">x</a>`)
    expect(html(`[x](${at}b)`)).toBe(`[x](${at}b)`)
    expect(html(`[x](<${at}b>)`)).toBe(`[x](&lt;${at}b&gt;)`)
  })

  it("reads parentheses in a destination nested up to 32 deep", () => {
    const nested = (n: number) => `https://e.com/${"(".repeat(n)}a${")".repeat(n)}`
    expect(elements(`[x](${nested(32)})`)).toEqual([{ tag: "a", attrs: ["href", "rel"] }])
    expect(elements(`[x](${nested(33)})`)).toEqual([])
    expect(shown(`[x](${nested(33)})`)).toBe(`[x](${nested(33)})`)
  })
})

describe("safety", () => {
  /** The text each hostile input shows where it differs from the input without its line breaks: the elements it may make keep their text. */
  const SHOWN: Record<string, string> = {
    "[x](https://e.com\"onmouseover=\"alert(1))": "x",
    "**<img src=x onerror=alert(1)>**": "<img src=x onerror=alert(1)>",
    "`<script>alert(1)</script>`": "<script>alert(1)</script>",
    "[<b onclick=alert(1)>x</b>](https://e.com)": "<b onclick=alert(1)>x</b>",
    "- <svg onload=alert(1)>\n- [x](vbscript:msgbox(1))": "<svg onload=alert(1)>[x](vbscript:msgbox(1))",
  }
  const hostile = [
    "[x](javascript:alert(1))",
    "[x](JAVASCRIPT:alert(1))",
    "[x](java\nscript:alert(1))",
    "[x]( javascript:alert(1) )",
    "[x](<javascript:alert(1)>)",
    "[x](&#106;avascript:alert(1))",
    "[x](data:text/html,<script>alert(1)</script>)",
    "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[x](https://e.com\"onmouseover=\"alert(1))",
    "[x](https://e.com' onclick='alert(1))",
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "**<img src=x onerror=alert(1)>**",
    "`<script>alert(1)</script>`",
    "<a href=\"javascript:alert(1)\">x</a>",
    "&lt;script&gt; &amp; &#x3C;",
    "![x](javascript:alert(1))",
    "[<b onclick=alert(1)>x</b>](https://e.com)",
    "- <svg onload=alert(1)>\n- [x](vbscript:msgbox(1))",
  ]

  it.each(hostile)("%s creates no executable content", (text) => {
    expectSafe(text)
    const div = document.createElement("div")
    div.appendChild(markdownFragment(document, text))
    expect(div.querySelector("script, img, svg, iframe, object, embed, style, [onerror], [onclick], [onload], [onmouseover]")).toBeNull()
    for (const a of Array.from(div.querySelectorAll("a"))) expect(a.getAttribute("href")).toMatch(/^(https?|mailto):/)
    // The text survives: what is not markup stays as characters.
    expect(div.textContent).toBe(SHOWN[text] ?? text.replace(/\n/g, ""))
  })

  it("puts a quote of the address into the attribute only, escaped", () => {
    const div = document.createElement("div")
    div.appendChild(markdownFragment(document, '[x](https://e.com/"><script>)'))
    // The destination ends at the first space or control character: here it holds the quote and the angle brackets.
    const a = div.querySelector("a")
    expect(a?.getAttribute("href")).toBe("https://e.com/%22%3E%3Cscript%3E")
    expect(div.querySelector("script")).toBeNull()
  })

  it("keeps deep nesting at a bounded depth with its text", () => {
    const deep = `${"*a ".repeat(200)}x${" a*".repeat(200)}`
    expectSafe(deep)
    const div = document.createElement("div")
    div.appendChild(markdownFragment(document, deep))
    let depth = 0
    for (let el: Element | null = div.querySelector("em, strong"); el; el = el.querySelector(":scope > em, :scope > strong")) depth++
    expect(depth).toBe(16)
    const text = `${"a ".repeat(200)}x${" a".repeat(200)}`
    expect(div.textContent).toBe(text)
  })

  it("survives long and odd input", () => {
    for (const text of ["*".repeat(10_000), "[".repeat(5000) + "](https://e.com)".repeat(100), "`".repeat(3000), "\\".repeat(4001), "**a".repeat(3000), "- \n".repeat(1000), "\u0000\u200b\ufeff**x**\ud800"]) {
      expectSafe(text)
    }
  })
})

describe("time", () => {
  /** Milliseconds of one rendering of each text, the fastest of seven rounds that take turns, so that a busy machine slows both alike. */
  function times(texts: string[]): number[] {
    const best = texts.map(() => Infinity)
    for (let round = 0; round < 7; round++) {
      texts.forEach((text, i) => {
        const t0 = performance.now()
        markdownFragment(document, text)
        best[i] = Math.min(best[i], performance.now() - t0)
      })
    }
    return best
  }

  it.each([
    ["plain prose", (n: number) => "The meeting was moved to Thursday. ".repeat(n)],
    ["openers without closers", (n: number) => "*a ".repeat(n)],
    ["closers without openers", (n: number) => "a* ".repeat(n)],
    ["alternating runs", (n: number) => "*_".repeat(n)],
    ["nested emphasis", (n: number) => `${"*a ".repeat(n)}x${" a*".repeat(n)}`],
    ["brackets without destination", (n: number) => "[a ".repeat(n)],
    ["links", (n: number) => "[a](https://e.com) ".repeat(n)],
    ["rejected links", (n: number) => "[*a*](javascript:x) ".repeat(n)],
    ["destinations without a closing parenthesis", (n: number) => "[](".repeat(n)],
    ["links whose destination never ends", (n: number) => "[a](b(".repeat(n)],
    ["backtick runs of rising length", (n: number) => Array.from({ length: n }, (_, i) => "`".repeat((i % 40) + 1)).join(" a ")],
  ])("%s: linear in the length, 10 KB at once", (_, make) => {
    // Characters added by one more repetition.
    const unit = make(2).length - make(1).length
    const ten = make(Math.ceil(10_000 / unit))
    const eighty = make(Math.ceil(80_000 / unit))
    expect(ten.length).toBeGreaterThanOrEqual(10_000)
    const [t10, t80] = times([ten, eighty])
    // Eight times the text: linear growth takes eight times the time, quadratic growth sixty-four.
    expect(t80).toBeLessThan(Math.max(t10 * 24, 5))
    expect(t10).toBeLessThan(100)
  })
})

it("lists only the allowed elements", () => {
  const all = elements("**a** *b* `c` ~~d~~ [e](https://e.com)\nf\n- g\n1. h\n\n3. i")
  expect([...new Set(all.map((e) => e.tag))].sort()).toEqual(["a", "br", "code", "del", "em", "li", "ol", "strong", "ul"])
})

describe("answers about images (rich)", () => {
  const rich = (text: string, header?: { from: string[]; to: string[] }) => {
    const div = document.createElement("div")
    div.appendChild(markdownFragment(document, text, { rich: true, header }))
    return div.innerHTML
  }
  const TABLE = "| Original | Translation |\n| --- | --- |\n| Umsatz | Revenue |\n| Kosten | Costs |"

  it("reads a pipe table with a head and a body", () => {
    expect(rich(TABLE)).toBe("<table><thead><tr><th>Original</th><th>Translation</th></tr></thead><tbody><tr><td>Umsatz</td><td>Revenue</td></tr><tr><td>Kosten</td><td>Costs</td></tr></tbody></table>")
    // The pipes at the start and the end are optional, and a table may have no rows.
    expect(rich("a | b\n-|-")).toBe("<table><thead><tr><th>a</th><th>b</th></tr></thead></table>")
    expect(rich("| a |\n| - |\n| x |")).toBe("<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>")
  })

  it("keeps the lines as text without a delimiter row of as many cells", () => {
    expect(rich("| a | b |\n| c | d |")).toBe("<p>| a | b |<br>| c | d |</p>")
    expect(rich("| a | b |\n| --- |")).toBe("<p>| a | b |<br>| --- |</p>")
    expect(rich("| a | b |\n| --- | x |")).toBe("<p>| a | b |<br>| --- | x |</p>")
    // A delimiter row needs a pipe, so a line under a dashed rule is no table.
    expect(rich("a\n---")).toBe("<p>a<br>---</p>")
    expect(rich("|\n|")).toBe("<p>|<br>|</p>")
  })

  it("fills short rows, cuts long ones and reads escaped pipes and inline markup in cells", () => {
    expect(rich("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |")).toBe("<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td></td></tr><tr><td>1</td><td>2</td></tr></tbody></table>")
    expect(rich("| a | b |\n|---|---|\n| x \\| y | **z** [l](https://e.com) `c` |")).toBe(
      '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>x | y</td><td><strong>z</strong> <a href="https://e.com/" rel="noopener noreferrer">l</a> <code>c</code></td></tr></tbody></table>',
    )
    // An escaped backslash before a pipe leaves the pipe a divider.
    expect(rich("| a | b |\n|---|---|\n| x \\\\| y |")).toContain("<td>x \\</td><td>y</td>")
  })

  it("marks the alignment with a class only", () => {
    const out = rich("| l | c | r | n |\n| :-- | :-: | --: | --- |\n| 1 | 2 | 3 | 4 |")
    expect(out).toContain('<th>l</th><th class="tt-align-center">c</th><th class="tt-align-right">r</th><th>n</th>')
    expect(out).toContain('<td>1</td><td class="tt-align-center">2</td><td class="tt-align-right">3</td><td>4</td>')
    expect(out).not.toContain("style")
  })

  it("starts a table after a line of text and ends it at a blank line or a line without a pipe", () => {
    expect(rich("**Summary:** two labels\n| a | b |\n|---|---|\n| 1 | 2 |\nafter")).toBe(
      "<p><strong>Summary:</strong> two labels</p><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><p>after</p>",
    )
    expect(rich("| a | b |\n|---|---|\n| 1 | 2 |\n\n| 3 | 4 |")).toBe("<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><p>| 3 | 4 |</p>")
  })

  it("has at most 20 columns and 300 rows; the rest stays text", () => {
    const table = (columns: number, rows: number) => [`|${" h |".repeat(columns)}`, `|${" - |".repeat(columns)}`, ...Array.from({ length: rows }, (_, i) => `| r${i} |${" x |".repeat(columns - 1)}`)].join("\n")
    const rendered = (text: string) => {
      const div = document.createElement("div")
      div.appendChild(markdownFragment(document, text, { rich: true }))
      return div
    }
    expect(MAX_TABLE_COLUMNS).toBe(20)
    expect(MAX_TABLE_ROWS).toBe(300)
    expect(rendered(table(MAX_TABLE_COLUMNS, 1)).querySelectorAll("th")).toHaveLength(20)
    expect(rendered(table(MAX_TABLE_COLUMNS + 1, 1)).querySelector("table")).toBeNull()
    const long = rendered(table(2, MAX_TABLE_ROWS + 2))
    expect(long.querySelectorAll("tbody tr")).toHaveLength(300)
    expect(long.querySelector("p")?.innerHTML).toBe("| r300 | x |<br>| r301 | x |")
  })

  it("shows the header that `header` names in its labels", () => {
    const header = { from: ["Original", "Translation"], to: ["原文", "译文"] }
    expect(rich(TABLE, header)).toContain("<th>原文</th><th>译文</th>")
    expect(rich("| Original | Notes |\n|---|---|", header)).toContain("<th>Original</th><th>Notes</th>")
  })

  it("ends a block at a blank line without a line break for it", () => {
    expect(rich("one\ntwo\n\n\nthree")).toBe("<p>one<br>two</p><p>three</p>")
    expect(rich("\n\n- a\n- b\n\n- c\n\nend\n\n")).toBe("<ul><li>a</li><li>b</li></ul><ul><li>c</li></ul><p>end</p>")
    expect(markdownBlocks("a\n\nb", { rich: true })).toEqual([{ kind: "text", text: "a" }, { kind: "gap" }, { kind: "text", text: "b" }])
  })

  it("shows a heading line as a paragraph of bold text", () => {
    expect(rich("# Title\ntext")).toBe("<p><strong>Title</strong></p><p>text</p>")
    expect(rich("###### *Six* ##")).toBe("<p><strong><em>Six</em></strong></p>")
    expect(rich("## C# ##")).toBe("<p><strong>C#</strong></p>")
    expect(rich("#")).toBe("<p><strong></strong></p>")
    for (const text of ["#hashtag", "####### seven", "    # code"]) expect(rich(text)).not.toContain("<strong>")
  })

  it("leaves the translations of the AI tier as they were", () => {
    expect(html(TABLE)).toBe("| Original | Translation |<br>| --- | --- |<br>| Umsatz | Revenue |<br>| Kosten | Costs |")
    expect(html("# a\n\nb")).toBe("# a<br><br>b")
  })

  it.each([
    "| <script>alert(1)</script> | <img src=x onerror=alert(1)> |\n|---|---|\n| [x](javascript:alert(1)) | <b onclick=alert(1)>y</b> |",
    "# <svg onload=alert(1)>\n\n| a |\n| - |\n| ![i](https://e.com/i.png) |",
    "| a | b |\n| :-: | --: |\n| \" onmouseover=\"alert(1) | ' style='x |",
  ])("creates no executable content in a table or heading: %s", (text) => {
    const div = document.createElement("div")
    div.appendChild(markdownFragment(document, text, { rich: true }))
    const allowed: Record<string, string[]> = { ...ALLOWED, p: [], table: [], thead: [], tbody: [], tr: [], th: ["class"], td: ["class"] }
    for (const el of Array.from(div.querySelectorAll("*"))) {
      const tag = el.tagName.toLowerCase()
      expect(Object.keys(allowed)).toContain(tag)
      for (const name of el.getAttributeNames()) expect(allowed[tag]).toContain(name)
      if (el.hasAttribute("class")) expect(el.getAttribute("class")).toMatch(/^tt-align-(center|right)$/)
    }
    expect(div.querySelector("script, img, svg, [onerror], [onclick], [onload], [onmouseover], [style]")).toBeNull()
  })
})

describe("time of the answers about images", () => {
  /** As above, with the reading of the answers about images. */
  function times(texts: string[]): number[] {
    const best = texts.map(() => Infinity)
    for (let round = 0; round < 7; round++) {
      texts.forEach((text, i) => {
        const t0 = performance.now()
        markdownFragment(document, text, { rich: true })
        best[i] = Math.min(best[i], performance.now() - t0)
      })
    }
    return best
  }

  it.each([
    ["pipes only", (n: number) => "|".repeat(n)],
    ["lines of pipes", (n: number) => "|||||||||\n".repeat(n)],
    ["header rows without a delimiter row", (n: number) => "| a | b |\n".repeat(n)],
    ["header rows with a delimiter row of the wrong width", (n: number) => "| a | b |\n| - |\n".repeat(n)],
    ["tables", (n: number) => "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n".repeat(n)],
    ["one table with many rows", (n: number) => `| a | b |\n| - | - |\n${"| *x* | `y` |\n".repeat(n)}`],
    ["a row of many cells", (n: number) => `| a |\n| - |\n${"| x ".repeat(n)}`],
    ["escaped pipes", (n: number) => "\\|".repeat(n)],
    ["blank lines and headings", (n: number) => "# h\n\n\ntext\n".repeat(n)],
    ["heading lines of spaces", (n: number) => `#${" ".repeat(n)}x`],
  ])("%s: linear in the length, 10 KB at once", (_, make) => {
    const unit = make(2).length - make(1).length
    const ten = make(Math.ceil(10_000 / unit))
    const eighty = make(Math.ceil(80_000 / unit))
    expect(ten.length).toBeGreaterThanOrEqual(10_000)
    const [t10, t80] = times([ten, eighty])
    // Eight times the text: linear growth takes eight times the time, quadratic growth sixty-four.
    expect(t80).toBeLessThan(Math.max(t10 * 24, 5))
    expect(t10).toBeLessThan(100)
  })
})
