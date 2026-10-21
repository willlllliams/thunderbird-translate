// @vitest-environment jsdom
/** The Markdown of AI translations in a message: only the AI tier, provisional results as text, restoring, the switch, styles, subjects. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type ControllerDeps, TranslationController } from "../src/content/controller"
import { Renderer } from "../src/content/render"
import type { TranslateRequest, TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import type { PublicSettings } from "../src/shared/settings"
import { answering, manualTranslate, type OnTier, tieredSettings } from "./fixtures/content"
import { until } from "./helpers"

const ok = (text: string): TranslateResponse => ({ ok: true, text })
const fail = (error: string): TranslateResponse => ({ ok: false, error })

/** An AI answer with every kind of markup. */
const MARKDOWN = "**Bold** and *em*, `code`, ~~old~~ and [the report](https://example.com/report)\n- one\n- two"

async function mount(html: string, settings: PublicSettings, deps: Partial<ControllerDeps> & Pick<ControllerDeps, "translate">) {
  document.body.innerHTML = html
  const original = document.body.innerHTML
  const c = new TranslationController({ root: () => document.body, ...deps })
  await c.updateSettings(settings)
  return { c, original }
}

/** The elements inside the first translation, without its mark. */
function tags(block = document.querySelector<HTMLElement>(".tt-translation")!): string[] {
  return Array.from(block.querySelectorAll("*"))
    .filter((el) => !el.closest(".tt-status"))
    .map((el) => el.tagName.toLowerCase())
}

/** The text of a translation without its mark. */
function text(block = document.querySelector<HTMLElement>(".tt-translation")!): string {
  const copy = block.cloneNode(true) as HTMLElement
  copy.querySelector(".tt-status")?.remove()
  return copy.textContent ?? ""
}

beforeEach(() => {
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})

describe("only the AI tier", () => {
  it("renders the final AI translation", async () => {
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["ai"]), { translate: answering(() => ok(MARKDOWN)) })
    await c.start()
    expect(tags()).toEqual(["strong", "em", "code", "del", "a", "ul", "li", "li"])
    const link = document.querySelector<HTMLAnchorElement>(".tt-translation a")!
    expect([link.getAttribute("href"), link.rel, link.textContent]).toEqual(["https://example.com/report", "noopener noreferrer", "the report"])
    expect(text()).toBe("Bold and em, code, old and the reportonetwo")
  })

  it.each<[string, Tier[], Partial<Record<Tier, TranslateResponse>>, string, string]>([
    ["a final machine translation", ["machine"], { machine: ok("**MT** 2*3") }, "done", "**MT** 2*3"],
    ["a final dictionary translation", ["dictionary"], { dictionary: ok("*D*") }, "done", "*D*"],
    ["a provisional machine translation", ["machine", "ai"], { machine: ok("**MT**") }, "provisional", "**MT**"],
    ["a provisional dictionary translation", ["dictionary", "ai"], { dictionary: ok("_D_") }, "provisional", "_D_"],
    ["a machine translation kept after the AI tier failed", ["machine", "ai"], { machine: ok("[MT](https://e.com)"), ai: fail("AI down") }, "fallback", "[MT](https://e.com)"],
  ])("leaves %s as text", async (_name, tiers, results, kind, expected) => {
    const translate = vi.fn((req: TranslateRequest, onTier: OnTier) => {
      for (const tier of req.tiers) if (results[tier]) onTier(tier, results[tier])
      return new Promise<void>(() => {})
    })
    const { c } = await mount("<p>Good morning</p>", tieredSettings(tiers), { translate })
    void c.start()
    await until(() => expect(document.querySelector(".tt-translation")).not.toBeNull())
    const block = document.querySelector<HTMLElement>(".tt-translation")!
    expect(kind === "done" || block.classList.contains(`tt-${kind}`)).toBe(true)
    expect(tags(block)).toEqual([])
    expect(text(block)).toBe(expected)
  })

  it("replaces the provisional text with the rendered AI translation", async () => {
    const m = manualTranslate()
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["machine", "ai"]), { translate: m.translate })
    void c.start()
    await until(() => expect(m.translate).toHaveBeenCalled())
    m.answer("Good morning", "machine", ok("**MT**"))
    expect(text()).toBe("**MT**")
    expect(tags()).toEqual([])
    m.answer("Good morning", "ai", ok("**AI**"))
    expect(tags()).toEqual(["strong"])
    expect(document.querySelector(".tt-translation")!.classList.contains("tt-provisional")).toBe(false)
  })
})

describe("restoring", () => {
  const HTML = '<p>Good <b>morning</b>, see <a href="https://a.example">this</a>.</p><ul><li>First item</li><li>Second item</li></ul><blockquote>Quoted text here</blockquote>'

  it.each(["bilingual", "translation-only"] as const)("gives back the original DOM in %s mode", async (mode) => {
    const { c, original } = await mount(HTML, tieredSettings(["machine", "ai"], { mode }), { translate: answering((t, tier) => ok(tier === "ai" ? `${MARKDOWN}\n${t}` : `MT ${t}`)) })
    await c.start()
    // The paragraph, the two list items and the quote.
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(".tt-translation"))
    expect(blocks).toHaveLength(4)
    for (const block of blocks) expect(tags(block)).toEqual(["strong", "em", "code", "del", "a", "ul", "li", "li"])
    c.stop()
    expect(document.body.innerHTML).toBe(original)
    await c.start()
    c.stop()
    expect(document.body.innerHTML).toBe(original)
  })

  it("keeps the original text as the hover text of a rendered translation in translation-only mode", async () => {
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["ai"], { mode: "translation-only" }), { translate: answering(() => ok("**Guten** Morgen")) })
    await c.start()
    const block = document.querySelector<HTMLElement>(".tt-translation.tt-only")!
    expect(block.title).toBe("Good morning")
    expect(tags(block)).toEqual(["strong"])
  })
})

describe("the switch", () => {
  it("renders again without a request when it changes", async () => {
    const translate = answering(() => ok("**AI** text"))
    const settings = tieredSettings(["machine", "ai"])
    const { c } = await mount("<p>Good morning</p>", settings, { translate })
    await c.start()
    expect(tags()).toEqual(["strong"])
    await c.updateSettings({ ...settings, renderMarkdown: false })
    expect(tags()).toEqual([])
    expect(text()).toBe("**AI** text")
    await c.updateSettings({ ...settings, renderMarkdown: true })
    expect(tags()).toEqual(["strong"])
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it("shows the text as the service wrote it when off from the start", async () => {
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["ai"], { renderMarkdown: false }), { translate: answering(() => ok(MARKDOWN)) })
    await c.start()
    expect(tags()).toEqual([])
    expect(text()).toBe(MARKDOWN)
  })
})

describe("styles", () => {
  it("puts the rendered elements inside the styled translation block", async () => {
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["ai"], { style: { preset: "highlight", color: "#ff0000", textColor: "#202124", opacity: 0.9, fontScale: 1.2 } }), {
      translate: answering(() => ok(MARKDOWN)),
    })
    await c.start()
    const block = document.querySelector<HTMLElement>(".tt-translation")!
    expect([...block.classList]).toEqual(expect.arrayContaining(["tt-bilingual", "tt-style-highlight", "tt-flow"]))
    for (const el of Array.from(block.querySelectorAll("strong, em, code, del, a, ul, li"))) expect(el.closest(".tt-translation")).toBe(block)
    expect(document.getElementById("tt-style-vars")!.textContent).toBe(":root{--tt-color:#ff0000;--tt-text-color:#202124;--tt-opacity:0.9;--tt-scale:1.2;}")
  })

  it("gives links the text colour of the translations and lists and code their own spacing", () => {
    const css = readFileSync(join(__dirname, "..", "static", "content.css"), "utf8")
    expect(css).toMatch(/\.tt-translation a \{\s*color: var\(--tt-text-color, LinkText\);/)
    expect(css).toMatch(/\.tt-translation ul,\s*\.tt-translation ol \{/)
    expect(css).toMatch(/\.tt-translation code \{[^}]*font-size: 0\.92em;/)
  })

  it("keeps the colour and size of the translation on the rendered elements in a real cascade", () => {
    document.head.innerHTML = `<style>${readFileSync(join(__dirname, "..", "static", "content.css"), "utf8")}</style><style>:root{--tt-text-color:#123456}</style>`
    document.body.innerHTML = "<p>Good morning</p>"
    const unit = { el: document.querySelector("p")!, text: "Good morning", pre: false }
    new Renderer(document).showTranslation(unit, "**Guten** Morgen", "bilingual", "de", undefined, "markdown")
    const strong = document.querySelector<HTMLElement>(".tt-translation strong")!
    expect(getComputedStyle(strong).color).toBe(getComputedStyle(document.querySelector(".tt-translation")!).color)
  })
})

describe("subjects", () => {
  it("shows the subject line as text without the marks", async () => {
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["machine", "ai"]), {
      translate: answering((t, tier) => ok(tier === "ai" ? `**AI** ${t}` : `**MT** ${t}`)),
      subject: async () => "Re: Budget",
    })
    await c.start()
    await until(() => expect(document.querySelector(".tt-subject .tt-translation")?.textContent).toBe("AI Budget"))
    const line = document.querySelector<HTMLElement>(".tt-subject")!
    expect(line.querySelectorAll(".tt-translation *").length).toBe(0)
    // The paragraphs of the body are rendered.
    expect(document.querySelector("p .tt-translation strong")?.textContent).toBe("AI")
  })

  it("shows the units of a plain-text page without the marks", async () => {
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["ai"]), { translate: answering(() => ok("**Angebot** für [Sie](https://e.com)")), plainText: true })
    await c.start()
    expect(tags()).toEqual([])
    expect(text()).toBe("Angebot für Sie")
  })
})
