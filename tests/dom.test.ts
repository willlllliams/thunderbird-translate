// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TranslationController } from "../src/content/controller"
import { candidateLanguages, englishScore, isInTargetLanguage } from "../src/content/lang-detect"
import { collectParagraphs, extractText } from "../src/content/paragraphs"
import { Renderer } from "../src/content/render"
import { hasTranslatableText, unwrapPlainText } from "../src/content/text"
import { ENGLISH } from "../src/shared/i18n"
import type { MailContext } from "../src/shared/mail-context"
import type { TabState, TranslateRequest, TranslateResponse } from "../src/shared/messages"
import type { PublicSettings } from "../src/shared/settings"

const HTML_MAIL = `
<div class="moz-text-html">
  <h1>Quarterly update</h1>
  <p>Hello team, the <b>report</b> is attached.</p>
  <p>   </p>
  <p>12,345.00</p>
  <p><a href="https://example.com/x">https://example.com/x</a></p>
  <p><code>npm install --save foo</code></p>
  <ul><li>First item to review</li><li>Second item, with <i>emphasis</i></li></ul>
  <table><tr><td>Cell text in a table</td><td><table><tr><td>Nested cell content</td></tr></table></td></tr></table>
  <blockquote type="cite">Quoted text from the previous mail</blockquote>
  <div>Loose text before a block<div>Inner block paragraph</div>and loose text after</div>
  <div>First line of a paragraph<br>second line<br><br>Next paragraph after blank line</div>
  <pre>const x = 1; // code in an HTML pre</pre>
  <div style="display:none">Hidden preheader text</div>
  <p translate="no">Do not translate me</p>
  <p>这是一段中文，不需要翻译。</p>
</div>`

const PLAIN_MAIL = `<div class="moz-text-plain" wrap="true"><pre class="moz-quote-pre" wrap="">Hi Anna,

Thanks for the update. The meeting is moved to Thursday at 10:00, please let
everyone in your team know about the change as soon as possible.

- bring the slides
- bring the budget

Best,
Tom
</pre></div>`

function texts(root: HTMLElement): string[] {
  return collectParagraphs(root).units.map((u) => u.text)
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("text filters", () => {
  it("rejects empty, numeric, link-only and address-only text", () => {
    expect(hasTranslatableText("   ")).toBe(false)
    expect(hasTranslatableText("12,345.00 €")).toBe(false)
    expect(hasTranslatableText("https://example.com/path?q=1")).toBe(false)
    expect(hasTranslatableText("someone@example.com")).toBe(false)
    expect(hasTranslatableText("— — !!")).toBe(false)
    expect(hasTranslatableText("See https://example.com for details")).toBe(true)
    expect(hasTranslatableText("你好")).toBe(true)
  })

  it("joins hard-wrapped lines but keeps short lines and lists", () => {
    const src = "This line is long enough to be a hard wrapped line in mail\ncontinued here.\n- item one\nBest,\nTom"
    expect(unwrapPlainText(src)).toBe(
      "This line is long enough to be a hard wrapped line in mail continued here.\n- item one\nBest,\nTom",
    )
  })
})

describe("paragraph detection", () => {
  it("finds paragraph-level blocks in an HTML mail and skips non-text", () => {
    document.body.innerHTML = HTML_MAIL
    const found = texts(document.body)
    expect(found).toEqual([
      "Quarterly update",
      "Hello team, the report is attached.",
      "First item to review",
      "Second item, with emphasis",
      "Cell text in a table",
      "Nested cell content",
      "Quoted text from the previous mail",
      "Loose text before a block",
      "Inner block paragraph",
      "and loose text after",
      "First line of a paragraph\nsecond line",
      "Next paragraph after blank line",
      "这是一段中文，不需要翻译。",
    ])
  })

  it("splits a plain-text mail into blank-line separated paragraphs", () => {
    document.body.innerHTML = PLAIN_MAIL
    const units = collectParagraphs(document.body).units
    expect(units.map((u) => u.text)).toEqual([
      "Hi Anna,",
      "Thanks for the update. The meeting is moved to Thursday at 10:00, please let everyone in your team know about the change as soon as possible.",
      "- bring the slides\n- bring the budget",
      "Best,\nTom",
    ])
    expect(units.every((u) => u.pre)).toBe(true)
  })

  it("restore() puts back the exact original DOM", () => {
    for (const html of [HTML_MAIL, PLAIN_MAIL]) {
      document.body.innerHTML = html
      const before = document.body.innerHTML
      const collected = collectParagraphs(document.body)
      expect(document.body.innerHTML).not.toBe(before) // wrappers were inserted
      collected.restore()
      expect(document.body.innerHTML).toBe(before)
    }
  })

  it("extracts text with <br> as newline and collapsed whitespace", () => {
    document.body.innerHTML = "<p>  a\n  b <br> c  </p>"
    expect(extractText(document.body.firstElementChild!)).toBe("a b\nc")
  })
})

describe("rendering", () => {
  it("renders bilingual and translation-only, then restores", () => {
    document.body.innerHTML = HTML_MAIL
    const original = document.body.innerHTML
    const collected = collectParagraphs(document.body)
    const renderer = new Renderer(document)
    const [h1, p] = collected.units

    renderer.showTranslation(h1, "季度更新", "bilingual")
    const added = h1.el.querySelector(".tt-translation")!
    expect(added.textContent).toBe("季度更新")
    expect(added.classList.contains("tt-bilingual")).toBe(true)
    expect(h1.el.textContent).toContain("Quarterly update")

    renderer.showTranslation(p, "大家好，报告已附上。", "translation-only")
    expect(p.el.textContent).toBe("大家好，报告已附上。")
    expect(p.el.querySelector("b")).toBeNull()

    // Switch modes in place.
    renderer.showTranslation(h1, "季度更新", "translation-only")
    expect(h1.el.textContent).toBe("季度更新")
    renderer.showTranslation(p, "大家好，报告已附上。", "bilingual")
    expect(p.el.querySelector("b")?.textContent).toBe("report")

    renderer.clearAll()
    collected.restore()
    expect(document.body.innerHTML).toBe(original)
  })

  it("keeps original element nodes (not copies) after translation-only restore", () => {
    document.body.innerHTML = "<p>Click <a href='#'>here</a> to continue</p>"
    const link = document.querySelector("a")!
    const collected = collectParagraphs(document.body)
    const r = new Renderer(document)
    r.showTranslation(collected.units[0], "点击此处继续", "translation-only")
    expect(document.querySelector("a")).toBeNull()
    r.clearAll()
    collected.restore()
    expect(document.querySelector("a")).toBe(link)
  })
})

describe("language detection", () => {
  it("classifies by script", () => {
    expect(candidateLanguages("这是一段中文")).toEqual(["zh"])
    expect(candidateLanguages("これは日本語の文章です")).toEqual(["ja"])
    expect(candidateLanguages("한국어 문장입니다")).toEqual(["ko"])
    expect(candidateLanguages("Hello world")).toEqual(["latin"])
    expect(englishScore("Thank you for the report, please send it to me")).toBeGreaterThan(0.3)
  })

  it("decides target-language paragraphs", async () => {
    expect(await isInTargetLanguage("这是一段中文", "zh-CN")).toBe(true)
    expect(await isInTargetLanguage("Hello, how are you today?", "zh-CN")).toBe(false)
    expect(await isInTargetLanguage("これは日本語です", "zh-CN")).toBe(false)
    expect(await isInTargetLanguage("Thank you for the report, it is very useful", "en")).toBe(true)
    expect(await isInTargetLanguage("Merci beaucoup pour le rapport", "en", async () => "fr")).toBe(false)
    expect(await isInTargetLanguage("Merci beaucoup pour le rapport", "fr", async () => "fr")).toBe(true)
  })
})

describe("controller", () => {
  const settings = (over: Partial<PublicSettings> = {}): PublicSettings => ({
    uiLanguage: "auto",
    targetLang: "zh-CN",
    mode: "bilingual",
    autoTranslate: false,
    activeProviderId: "google-free",
    providerSignature: "google-free|||",
    precise: false,
    style: { preset: "border", color: "#4c8bf5", opacity: 0.85, fontScale: 1 },
    ...over,
  })

  it("translates, switches mode without new requests, and restores on stop", async () => {
    document.body.innerHTML = HTML_MAIL
    const original = document.body.innerHTML
    const translate = vi.fn(async ({ text }: TranslateRequest) => ({ ok: true as const, text: `ZH:${text}` }))
    const c = new TranslationController({ root: () => document.body, translate })
    await c.updateSettings(settings())
    await c.start()

    // The Chinese paragraph is skipped, 12 others are requested.
    expect(translate).toHaveBeenCalledTimes(12)
    expect(document.querySelectorAll(".tt-translation.tt-bilingual").length).toBe(12)
    expect(document.body.textContent).toContain("Quarterly update")
    expect(document.body.textContent).toContain("ZH:Quarterly update")

    await c.updateSettings(settings({ mode: "translation-only" }))
    expect(translate).toHaveBeenCalledTimes(12)
    expect(document.querySelectorAll(".tt-translation.tt-only").length).toBe(12)
    expect(document.body.textContent).not.toMatch(/(?<!ZH:)Hello team, the report is attached./)

    await c.updateSettings(settings({ mode: "bilingual" }))
    expect(document.querySelectorAll(".tt-translation.tt-bilingual").length).toBe(12)

    c.stop()
    expect(document.body.innerHTML).toBe(original)
    expect(c.active).toBe(false)
  })

  it("re-translates when the target language changes, using its own memo on re-toggle", async () => {
    document.body.innerHTML = "<p>Good morning</p><p>See you later</p>"
    const translate = vi.fn(async ({ text, targetLang: lang }: TranslateRequest) => ({ ok: true as const, text: `${lang}:${text}` }))
    const c = new TranslationController({ root: () => document.body, translate })
    await c.updateSettings(settings())
    await c.start()
    expect(translate).toHaveBeenCalledTimes(2)
    await c.updateSettings(settings({ targetLang: "ja" }))
    expect(translate).toHaveBeenCalledTimes(4)
    expect(document.body.textContent).toContain("ja:Good morning")
    c.stop()
    await c.start()
    expect(translate).toHaveBeenCalledTimes(4) // served from memo
  })

  it("shows an error marker and retries on click", async () => {
    document.body.innerHTML = "<p>Good morning</p>"
    let fail = true
    const translate = vi.fn(async ({ text }: TranslateRequest) => (fail ? { ok: false as const, error: "HTTP 500" } : { ok: true as const, text: `ZH:${text}` }))
    const c = new TranslationController({ root: () => document.body, translate })
    await c.updateSettings(settings())
    await c.start()
    const err = document.querySelector(".tt-error") as HTMLElement
    expect(err).not.toBeNull()
    expect(err.title).toBe("HTTP 500")
    fail = false
    err.click()
    await vi.waitFor(() => expect(document.querySelector(".tt-translation")?.textContent).toBe("ZH:Good morning"))
  })

  it("never shows an empty failure reason and reports the last one", async () => {
    document.body.innerHTML = "<p>Good morning</p><p>See you later</p>"
    const reports: { failed: number; lastError?: string }[] = []
    const translate = vi.fn(async ({ text }: TranslateRequest) => {
      if (text.startsWith("Good")) return { ok: false as const, error: "" }
      throw new Error("")
    })
    const c = new TranslationController({ root: () => document.body, translate, report: (s) => reports.push(s) })
    await c.updateSettings(settings())
    await c.start()
    const markers = Array.from(document.querySelectorAll<HTMLElement>(".tt-error"))
    expect(markers).toHaveLength(2)
    for (const m of markers) expect(m.title.trim()).not.toBe("")
    const last = reports.at(-1)!
    expect(last.failed).toBe(2)
    expect(last.lastError?.trim()).toBeTruthy()
    c.stop()
    expect(reports.at(-1)!.lastError).toBeUndefined()
  })

  it("auto-starts only for messages not in the target language", async () => {
    document.body.innerHTML = "<p>这封邮件已经是中文了。</p>"
    const translate = vi.fn(async ({ text }: TranslateRequest) => ({ ok: true as const, text }))
    const c = new TranslationController({ root: () => document.body, translate })
    await c.updateSettings(settings({ autoTranslate: true }))
    expect(await c.maybeAutoStart()).toBe(false)

    document.body.innerHTML = "<p>This message is written in English.</p>"
    const c2 = new TranslationController({ root: () => document.body, translate })
    await c2.updateSettings(settings({ autoTranslate: true }))
    expect(await c2.maybeAutoStart()).toBe(true)
    expect(translate).toHaveBeenCalledTimes(1)
  })

  /* ---------- race mode ---------- */

  /** translate() whose final answer waits until finish(); provisional() pushes a fast result meanwhile. */
  function racing() {
    const waiting = new Map<string, { resolve: (r: TranslateResponse) => void; onProvisional: (t: string) => void }>()
    const translate = vi.fn(
      (req: TranslateRequest, onProvisional: (t: string) => void) =>
        new Promise<TranslateResponse>((resolve) => waiting.set(req.text, { resolve, onProvisional })),
    )
    return {
      translate,
      provisional: (text: string, value: string) => waiting.get(text)!.onProvisional(value),
      finish: (text: string, r: TranslateResponse) => waiting.get(text)!.resolve(r),
    }
  }

  it("race: shows a provisional translation, then replaces it with the AI translation", async () => {
    document.body.innerHTML = "<p>Good morning</p><p>See you later</p>"
    const original = document.body.innerHTML
    const reports: Omit<TabState, "connected">[] = []
    const r = racing()
    const c = new TranslationController({ root: () => document.body, translate: r.translate, report: (st) => reports.push(st) })
    await c.updateSettings(settings({ activeProviderId: "openai" }))
    const started = c.start()
    await vi.waitFor(() => expect(r.translate).toHaveBeenCalledTimes(2))

    r.provisional("Good morning", "FAST:Good morning")
    const block = document.querySelector<HTMLElement>(".tt-translation.tt-provisional")!
    expect(block.textContent).toContain("FAST:Good morning")
    const tag = block.querySelector<HTMLElement>(".tt-tag")!
    expect(tag.textContent).toBe(ENGLISH.t("statusProvisional"))
    expect(tag.title).toBe(ENGLISH.t("statusProvisionalHint"))
    expect(reports.at(-1)).toMatchObject({ total: 2, done: 0, provisional: 1, failed: 0 })

    // Display mode switch keeps the provisional state.
    await c.updateSettings(settings({ activeProviderId: "openai", mode: "translation-only" }))
    expect(document.querySelector(".tt-translation.tt-only.tt-provisional")).not.toBeNull()

    r.finish("Good morning", { ok: true, text: "AI:Good morning" })
    r.finish("See you later", { ok: true, text: "AI:See you later" })
    await started
    expect(document.querySelector(".tt-provisional")).toBeNull()
    expect(Array.from(document.querySelectorAll(".tt-translation")).map((el) => el.textContent)).toEqual(["AI:Good morning", "AI:See you later"])
    expect(reports.at(-1)).toMatchObject({ total: 2, done: 2, provisional: 0, failed: 0 })

    c.stop()
    expect(document.body.innerHTML).toBe(original)
  })

  it("race: ignores a fast result that arrives after the AI result", async () => {
    document.body.innerHTML = "<p>Good morning</p>"
    const r = racing()
    const c = new TranslationController({ root: () => document.body, translate: r.translate })
    await c.updateSettings(settings({ activeProviderId: "openai" }))
    const started = c.start()
    await vi.waitFor(() => expect(r.translate).toHaveBeenCalledTimes(1))
    r.finish("Good morning", { ok: true, text: "AI:Good morning" })
    await started
    r.provisional("Good morning", "FAST:Good morning")
    expect(document.querySelector(".tt-translation")!.textContent).toBe("AI:Good morning")
    expect(document.querySelector(".tt-provisional")).toBeNull()
  })

  it("race: keeps the fast translation when the AI request fails and retries on click", async () => {
    document.body.innerHTML = "<p>Good morning</p>"
    const original = document.body.innerHTML
    const reports: Omit<TabState, "connected">[] = []
    const r = racing()
    const c = new TranslationController({ root: () => document.body, translate: r.translate, report: (st) => reports.push(st) })
    await c.updateSettings(settings({ activeProviderId: "openai" }))
    const started = c.start()
    await vi.waitFor(() => expect(r.translate).toHaveBeenCalledTimes(1))
    r.provisional("Good morning", "FAST:Good morning")
    r.finish("Good morning", { ok: false, error: "OpenAI request failed: HTTP 401", fallback: "FAST:Good morning" })
    await started

    const block = document.querySelector<HTMLElement>(".tt-translation.tt-fallback")!
    expect(block.textContent).toContain("FAST:Good morning")
    const marker = block.querySelector<HTMLElement>(".tt-error")!
    expect(marker.textContent).toBe(ENGLISH.t("statusAiFailed"))
    expect(marker.title).toBe("OpenAI request failed: HTTP 401")
    expect(reports.at(-1)).toMatchObject({ done: 0, provisional: 0, failed: 1, lastError: "OpenAI request failed: HTTP 401" })

    await c.updateSettings(settings({ activeProviderId: "openai", mode: "translation-only" }))
    expect(document.querySelector(".tt-translation.tt-only.tt-fallback")).not.toBeNull()

    marker.click()
    await vi.waitFor(() => expect(r.translate).toHaveBeenCalledTimes(2))
    r.finish("Good morning", { ok: true, text: "AI:Good morning" })
    await vi.waitFor(() => expect(document.querySelector(".tt-translation")!.textContent).toBe("AI:Good morning"))
    expect(document.querySelector(".tt-fallback")).toBeNull()

    c.stop()
    expect(document.body.innerHTML).toBe(original)
  })

  /* ---------- precise mode ---------- */

  it("precise: registers the message once and refers to it from every request", async () => {
    document.body.innerHTML = "<p>Hello Anna</p><p>这段已经是中文。</p><p>See you on Friday</p>"
    const contexts: MailContext[] = []
    const translate = vi.fn(async ({ text }: TranslateRequest) => ({ ok: true as const, text: `ZH:${text}` }))
    const c = new TranslationController({ root: () => document.body, translate, setContext: (ctx) => contexts.push(ctx) })
    await c.updateSettings(settings({ activeProviderId: "openai", precise: true }))
    await c.start()
    expect(contexts).toHaveLength(1)
    expect(contexts[0].paragraphs).toEqual(["Hello Anna", "这段已经是中文。", "See you on Friday"])
    expect(contexts[0].targets).toEqual([0, 2])
    expect(translate.mock.calls.map(([req]) => req.context)).toEqual([
      { id: contexts[0].id, index: 0 },
      { id: contexts[0].id, index: 2 },
    ])
  })
})
