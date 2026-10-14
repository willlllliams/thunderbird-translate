// @vitest-environment jsdom
/** TranslationController: tier combinations, result handling, settings changes and lifecycle. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type ControllerDeps, TranslationController } from "../src/content/controller"
import { ENGLISH } from "../src/shared/i18n"
import type { MailContext } from "../src/shared/mail-context"
import type { TabState, TranslateRequest, TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import type { PublicSettings } from "../src/shared/settings"
import { answering, manualTranslate, type OnTier, publicSettings, tieredSettings } from "./fixtures/content"

type Reports = Omit<TabState, "connected">[]

/** Body with `html`, a controller on it and the reports it sends. */
async function mount(html: string, settings: PublicSettings | null, deps: Partial<ControllerDeps> & Pick<ControllerDeps, "translate">) {
  document.body.innerHTML = html
  const original = document.body.innerHTML
  const reports: Reports = []
  const c = new TranslationController({ root: () => document.body, report: (s) => reports.push(s), ...deps })
  if (settings) await c.updateSettings(settings)
  return { c, reports, original }
}

/** translate() that answers the tiers in `results` and stays open while another tier has no answer. */
const scripted = (results: Partial<Record<Tier, TranslateResponse>>) =>
  vi.fn((req: TranslateRequest, onTier: OnTier) => {
    for (const tier of req.tiers) if (results[tier]) onTier(tier, results[tier])
    return req.tiers.every((tier) => results[tier]) ? Promise.resolve() : new Promise<void>(() => {})
  })

/** What the first paragraph shows. */
function shown() {
  const block = document.querySelector<HTMLElement>(".tt-translation")
  if (block) {
    const kind = block.classList.contains("tt-provisional") ? "provisional" : block.classList.contains("tt-fallback") ? "fallback" : "done"
    const mark = block.querySelector<HTMLElement>(".tt-status")
    return { kind, text: block.firstChild?.textContent, ...(mark ? { label: mark.textContent, title: mark.title } : {}) }
  }
  const error = document.querySelector<HTMLElement>(".tt-error")
  if (error) return { kind: "error", label: error.textContent, title: error.title }
  return { kind: document.querySelector(".tt-loading") ? "loading" : "nothing" }
}

const ok = (text: string): TranslateResponse => ({ ok: true, text })
const fail = (error: string): TranslateResponse => ({ ok: false, error })
const AI_FAILED = ENGLISH.t("statusTierFailed", [ENGLISH.t("tierAi")])
const MT_FAILED = ENGLISH.t("statusTierFailed", [ENGLISH.t("tierMachine")])
/** Hover text of a fallback label: the reason, then how to retry. */
const retryable = (reason: string) => `${reason}\n${ENGLISH.t("tipRetryTier")}`

beforeEach(() => {
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})

describe("tier combinations", () => {
  it.each<[string, Tier[], Partial<Record<Tier, TranslateResponse>>, ReturnType<typeof shown>, Partial<Reports[number]>]>([
    ["machine alone", ["machine"], { machine: ok("MT") }, { kind: "done", text: "MT" }, { done: 1 }],
    ["machine alone fails", ["machine"], { machine: fail("HTTP 500") }, { kind: "error", label: ENGLISH.t("statusFailed"), title: "HTTP 500" }, { failed: 1, lastError: "HTTP 500" }],
    ["AI alone", ["ai"], { ai: ok("AI") }, { kind: "done", text: "AI" }, { done: 1 }],
    [
      "dictionary + machine, machine fails",
      ["dictionary", "machine"],
      { dictionary: ok("D"), machine: fail("MT down") },
      { kind: "fallback", text: "D", label: MT_FAILED, title: retryable("MT down") },
      { failed: 1, lastError: "MT down" },
    ],
    ["machine + AI, machine fails", ["machine", "ai"], { machine: fail("MT down"), ai: ok("AI") }, { kind: "done", text: "AI" }, { done: 1, failed: 0 }],
    [
      "dictionary + AI, AI still running",
      ["dictionary", "ai"],
      { dictionary: ok("D") },
      { kind: "provisional", text: "D", label: ENGLISH.t("tierDictionary"), title: ENGLISH.t("statusProvisionalHint", [ENGLISH.t("tierAi")]) },
      { provisional: 1 },
    ],
    [
      "three tiers, dictionary and AI fail",
      ["dictionary", "machine", "ai"],
      { dictionary: fail("no pack"), machine: ok("MT"), ai: fail("AI down") },
      { kind: "fallback", text: "MT", label: AI_FAILED, title: retryable("AI down") },
      { failed: 1, lastError: "AI down" },
    ],
    ["three tiers, all still running", ["dictionary", "machine", "ai"], {}, { kind: "loading" }, { done: 0, provisional: 0, failed: 0 }],
  ])("%s", async (_name, tiers, results, expected, counts) => {
    const translate = scripted(results)
    const { c, reports } = await mount("<p>Good morning</p>", tieredSettings(tiers), { translate })
    void c.start()
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1))
    expect(translate.mock.calls[0][0].tiers).toEqual(tiers)
    expect(shown()).toEqual(expected)
    await vi.waitFor(() => expect(reports.at(-1)).toMatchObject({ active: true, total: 1, ...counts }))
  })

  it("does not report a lower tier's failure as the last error", async () => {
    const { c, reports } = await mount("<p>Good morning</p>", tieredSettings(["machine", "ai"]), { translate: scripted({ machine: fail("MT down") }) })
    void c.start()
    await vi.waitFor(() => expect(shown().kind).toBe("loading"))
    await vi.waitFor(() => expect(reports.at(-1)).not.toHaveProperty("lastError"))
  })

  it("the retry button asks again only the tiers that failed", async () => {
    let results: Partial<Record<Tier, TranslateResponse>> = { dictionary: ok("D"), machine: fail("MT down"), ai: fail("AI down") }
    const translate = vi.fn(async (req: TranslateRequest, onTier: OnTier) => {
      for (const tier of req.tiers) onTier(tier, results[tier]!)
    })
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["dictionary", "machine", "ai"]), { translate })
    await c.start()
    expect(shown()).toMatchObject({ kind: "fallback", text: "D" })
    results = { machine: ok("MT"), ai: ok("AI") }
    document.querySelector<HTMLElement>(".tt-fallback .tt-error")!.click()
    await vi.waitFor(() => expect(shown()).toEqual({ kind: "done", text: "AI" }))
    expect(translate.mock.calls[1][0].tiers).toEqual(["machine", "ai"])
  })

  it("a restart asks only the tiers without a remembered result", async () => {
    const translate = scripted({ dictionary: ok("D"), machine: ok("MT"), ai: fail("AI down") })
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["dictionary", "machine", "ai"]), { translate })
    await c.start()
    c.stop()
    await c.start()
    expect(translate.mock.calls.map(([req]) => req.tiers)).toEqual([["dictionary", "machine", "ai"], ["ai"]])
    expect(shown()).toMatchObject({ kind: "fallback", text: "MT" })
  })
})

describe("results", () => {
  it.each<[string, Tier[], Partial<Record<Tier, TranslateResponse>>, ReturnType<typeof shown>]>([
    ["an empty final result shows nothing", ["machine"], { machine: ok("  ") }, { kind: "nothing" }],
    ["a final result equal to the original shows nothing", ["machine"], { machine: ok(" Good morning ") }, { kind: "nothing" }],
    ["a provisional result equal to the original keeps the spinner", ["machine", "ai"], { machine: ok("Good morning") }, { kind: "loading" }],
    [
      "an empty fallback shows the failure of the highest tier",
      ["machine", "ai"],
      { machine: ok(""), ai: fail("AI down") },
      { kind: "error", label: ENGLISH.t("statusFailed"), title: "AI down" },
    ],
  ])("%s", async (_name, tiers, results, expected) => {
    const translate = scripted(results)
    const { c } = await mount("<p>Good morning</p>", tieredSettings(tiers), { translate })
    void c.start()
    await vi.waitFor(() => expect(translate).toHaveBeenCalled())
    expect(shown()).toEqual(expected)
  })

  it.each<[string, TranslateResponse | undefined]>([
    ["no answer object", undefined],
    ["a blank reason", fail("   ")],
  ])("gives %s a non-empty reason", async (_name, result) => {
    const translate = vi.fn(async (_req: TranslateRequest, onTier: OnTier) => onTier("machine", result as TranslateResponse))
    const { c } = await mount("<p>Good morning</p>", publicSettings(), { translate })
    await c.start()
    expect(shown()).toMatchObject({ kind: "error", title: expect.stringMatching(/\S/) })
  })

  it("a rejected request fails every tier still waiting, and keeps the answers already received", async () => {
    const translate = vi.fn(async (_req: TranslateRequest, onTier: OnTier) => {
      onTier("machine", ok("MT"))
      throw new Error("Port closed")
    })
    const { c, reports } = await mount("<p>Good morning</p>", tieredSettings(["machine", "ai"]), { translate })
    await c.start()
    expect(shown()).toMatchObject({ kind: "fallback", text: "MT", label: AI_FAILED, title: expect.stringContaining("Port closed") })
    await vi.waitFor(() => expect(reports.at(-1)).toMatchObject({ failed: 1, lastError: expect.stringContaining("Port closed") }))
  })

  it("forgets tiers the background did not answer, and asks them with the next request", async () => {
    // The background answered the highest tier from its cache and did not ask the others.
    const translate = vi.fn(async (_req: TranslateRequest, onTier: OnTier) => onTier("ai", ok("AI")))
    const { c, reports } = await mount("<p>Good morning</p>", tieredSettings(["machine", "ai"]), { translate })
    await c.start()
    await vi.waitFor(() => expect(reports.at(-1)).toMatchObject({ done: 1, provisional: 0, failed: 0 }))
    await c.updateSettings(tieredSettings(["machine", "ai"], { mode: "translation-only" }))
    expect(translate.mock.calls.map(([req]) => req.tiers)).toEqual([
      ["machine", "ai"],
      ["machine", "ai"],
    ])
  })
})

describe("settings changes while active", () => {
  it("re-renders on a style preset change without new requests", async () => {
    const translate = answering((text) => ok(`ZH:${text}`))
    const { c } = await mount("<p>Good morning</p>", publicSettings(), { translate })
    await c.start()
    expect(document.querySelector(".tt-translation")!.classList.contains("tt-style-border")).toBe(true)
    await c.updateSettings(publicSettings({ style: { ...publicSettings().style, preset: "highlight" } }))
    const block = document.querySelector(".tt-translation")!
    expect(block.classList.contains("tt-style-highlight")).toBe(true)
    expect(block.classList.contains("tt-style-border")).toBe(false)
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it("writes the colours, opacity and size into a style element while active and removes it on stop", async () => {
    const { c } = await mount("<p>Good morning</p>", publicSettings(), { translate: answering((text) => ok(`ZH:${text}`)) })
    expect(document.getElementById("tt-style-vars")).toBeNull()
    await c.start()
    expect(document.head.querySelector("#tt-style-vars")!.textContent).toBe(":root{--tt-color:#4c8bf5;--tt-opacity:0.85;--tt-scale:1;}")
    await c.updateSettings(publicSettings({ style: { preset: "border", color: "#ff0000", textColor: "#202124", opacity: 1, fontScale: 1.2 } }))
    expect(document.querySelectorAll("#tt-style-vars")).toHaveLength(1)
    expect(document.getElementById("tt-style-vars")!.textContent).toBe(":root{--tt-color:#ff0000;--tt-text-color:#202124;--tt-opacity:1;--tt-scale:1.2;}")
    c.stop()
    expect(document.getElementById("tt-style-vars")).toBeNull()
  })

  it("restarts on a precise switch: registers the message, asks the AI tier again and takes the others from memory", async () => {
    const translate = answering((text, tier) => ok(`${tier}:${text}`))
    const contexts: MailContext[] = []
    const { c } = await mount("<p>Good morning</p><p>See you later</p>", tieredSettings(["machine", "ai"]), { translate, setContext: (ctx) => contexts.push(ctx) })
    await c.start()
    expect(contexts).toHaveLength(0)
    await c.updateSettings(tieredSettings(["machine", "ai"], { precise: true, signatures: { machine: "google-free", ai: "openai|precise" } }))
    expect(contexts).toHaveLength(1)
    expect(translate.mock.calls.slice(2).map(([req]) => [req.tiers, req.context])).toEqual([
      [["ai"], { id: contexts[0].id, index: 0 }],
      [["ai"], { id: contexts[0].id, index: 1 }],
    ])
    expect(document.querySelectorAll(".tt-translation")).toHaveLength(2)
  })

  it("restores the original DOM before translating again into a new target language", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const { c, original } = await mount("<div>Loose text<p>Block text</p></div>", publicSettings(), { translate })
    await c.start()
    await c.updateSettings(publicSettings({ targetLang: "ja" }))
    expect(document.querySelectorAll(".tt-translation")).toHaveLength(2)
    expect(document.querySelectorAll(".tt-seg")).toHaveLength(1)
    c.stop()
    expect(document.body.innerHTML).toBe(original)
  })

  it("keeps the highest tier's result when only a lower tier's service changed", async () => {
    const translate = answering((text, tier) => ok(`${tier}:${text}`))
    const { c } = await mount("<p>Good morning</p>", tieredSettings(["machine", "ai"]), { translate })
    await c.start()
    await c.updateSettings(tieredSettings(["machine", "ai"], { signatures: { machine: "microsoft-free", ai: "openai|bilingual" } }))
    expect(translate).toHaveBeenCalledTimes(1)
    expect(shown()).toEqual({ kind: "done", text: "ai:Good morning" })
  })

  it("drops a result of the previous service that arrives after the change", async () => {
    const r = manualTranslate()
    const { c } = await mount("<p>Good morning</p>", publicSettings(), { translate: r.translate })
    void c.start()
    await vi.waitFor(() => expect(r.translate).toHaveBeenCalledTimes(1))
    const stale = r.translate.mock.calls[0][1]
    void c.updateSettings(publicSettings({ signatures: { machine: "microsoft-free" } }))
    await vi.waitFor(() => expect(r.translate).toHaveBeenCalledTimes(2))
    stale("machine", ok("OLD"))
    expect(shown().kind).toBe("loading")
    r.answer("Good morning", "machine", ok("NEW"))
    expect(shown()).toEqual({ kind: "done", text: "NEW" })
  })

  it("ignores settings while inactive and applies them on the next start", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const { c } = await mount("<p>Good morning</p>", publicSettings(), { translate })
    await c.updateSettings(publicSettings({ mode: "translation-only" }))
    expect(translate).not.toHaveBeenCalled()
    await c.start()
    expect(document.querySelector(".tt-translation.tt-only")!.textContent).toBe("T:Good morning")
  })
})

describe("retranslation", () => {
  const TIERS: Tier[] = ["dictionary", "machine", "ai"]

  it("forgets the results, asks every tier again past the cache in the same display mode, with provisional results on the way", async () => {
    const first = answering((text, tier) => ok(`${tier}:${text}`))
    const r = manualTranslate()
    let translate: ControllerDeps["translate"] = first
    const { c, reports } = await mount("<p>Good morning</p><p>See you later</p>", tieredSettings(TIERS, { mode: "translation-only" }), {
      translate: (req, onTier) => translate(req, onTier),
    })
    await c.start()
    expect(first.mock.calls.every(([req]) => req.bypassCache === undefined)).toBe(true)
    translate = r.translate
    const again = c.retranslate()
    await vi.waitFor(() => expect(r.translate).toHaveBeenCalledTimes(2))
    expect(r.translate.mock.calls.map(([req]) => [req.text, req.tiers, req.bypassCache])).toEqual([
      ["Good morning", TIERS, true],
      ["See you later", TIERS, true],
    ])
    expect(shown().kind).toBe("loading")
    expect(c.active).toBe(true)
    r.answer("Good morning", "dictionary", ok("D2"))
    expect(shown()).toMatchObject({ kind: "provisional", text: "D2" })
    r.answer("Good morning", "ai", ok("AI2"))
    expect(shown()).toEqual({ kind: "done", text: "AI2" })
    expect(document.querySelector(".tt-translation.tt-only")).not.toBeNull()
    for (const text of ["Good morning", "See you later"]) {
      for (const tier of TIERS) r.answer(text, tier, ok(`${tier}2:${text}`))
      r.done(text)
    }
    await again
    await vi.waitFor(() => expect(reports.at(-1)).toMatchObject({ active: true, total: 2, done: 2 }))

    // The new results are what the page remembers; a plain restart asks nothing and passes no cache.
    c.stop()
    await c.start()
    expect(r.translate).toHaveBeenCalledTimes(2)
    expect(shown()).toEqual({ kind: "done", text: "ai2:Good morning" })
  })

  it("does nothing while the message is not translated", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const { c, original } = await mount("<p>Good morning</p>", publicSettings(), { translate })
    await c.retranslate()
    expect(c.active).toBe(false)
    expect(translate).not.toHaveBeenCalled()
    expect(document.body.innerHTML).toBe(original)
  })

  it("registers the message again in precise mode for a new analysis, and a later restart is a plain one", async () => {
    const translate = answering((text, tier) => ok(`${tier}:${text}`))
    const contexts: [MailContext, boolean][] = []
    const settings = tieredSettings(["machine", "ai"], { precise: true })
    const { c } = await mount("<p>Good morning</p>", settings, { translate, setContext: (ctx, bypass) => contexts.push([ctx, bypass]) })
    await c.start()
    await c.retranslate()
    expect(contexts.map(([, bypass]) => bypass)).toEqual([false, true])
    expect(translate.mock.calls[1][0]).toMatchObject({ context: { id: contexts[1][0].id, index: 0 }, bypassCache: true })
    // A new target language restarts without passing the cache.
    await c.updateSettings({ ...settings, targetLang: "ja" })
    expect(contexts.at(-1)![1]).toBe(false)
    expect(translate.mock.calls.at(-1)![0].bypassCache).toBeUndefined()
  })

  it("keeps the notice of the message closed: it opens one round and clears the old one", async () => {
    const notice = { begin: vi.fn(), add: vi.fn(), end: vi.fn(), clear: vi.fn() }
    const { c } = await mount("<p>Good morning</p>", publicSettings(), { translate: answering((text) => ok(`T:${text}`)), notice })
    await c.start()
    await c.retranslate()
    expect(notice.clear).toHaveBeenCalledTimes(1)
    expect(notice.begin).toHaveBeenCalledTimes(2)
    expect(notice.end).toHaveBeenCalledTimes(2)
  })
})

describe("paragraphs already in the target language", () => {
  it("translates Simplified Chinese for a Traditional Chinese target and skips Traditional Chinese", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const { c } = await mount("<p>我们这个月的报告已经发给你了。</p><p>我們這個月的報告已經發給你了。</p>", publicSettings({ targetLang: "zh-TW" }), { translate })
    await c.start()
    expect(translate.mock.calls.map(([req]) => req.text)).toEqual(["我们这个月的报告已经发给你了。"])
  })
})

describe("progress reports", () => {
  it("go out at most every 100 ms while results arrive, and the last state always follows", async () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `<p>Paragraph number ${i}</p>`).join("")
    const { c, reports } = await mount(paragraphs, tieredSettings(["machine", "ai"]), { translate: answering((text, tier) => ok(`${tier}:${text}`)) })
    await c.start()
    // Every paragraph got two results, each a change of state; the reports stay few.
    expect(reports.length).toBeLessThan(5)
    await vi.waitFor(() => expect(reports.at(-1)).toEqual({ active: true, total: 40, done: 40, provisional: 0, failed: 0 }))
    expect(reports.length).toBeLessThan(6)
  })
})

describe("lifecycle", () => {
  it("does nothing without settings or without a root", async () => {
    const translate = answering((text) => ok(text))
    const noSettings = (await mount("<p>Good morning</p>", null, { translate })).c
    await noSettings.start()
    expect(noSettings.active).toBe(false)
    const noRoot = new TranslationController({ root: () => null, translate })
    await noRoot.updateSettings(publicSettings({ autoTranslate: true }))
    await noRoot.start()
    expect(await noRoot.maybeAutoStart()).toBe(false)
    noRoot.stop()
    expect(noRoot.active).toBe(false)
    expect(translate).not.toHaveBeenCalled()
  })

  it("toggles on and off, and a second start while active asks nothing", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const { c, reports, original } = await mount("<p>Good morning</p>", publicSettings(), { translate })
    await c.toggle()
    await c.start()
    expect(c.active).toBe(true)
    expect(translate).toHaveBeenCalledTimes(1)
    await c.toggle()
    expect(c.active).toBe(false)
    expect(document.body.innerHTML).toBe(original)
    await vi.waitFor(() => expect(reports.at(-1)).toEqual({ active: false, total: 0, done: 0, provisional: 0, failed: 0 }))
  })

  it.each<[string, string, Partial<PublicSettings>]>([
    ["auto-translation is off", "<p>This message is written in English.</p>", { autoTranslate: false }],
    ["the message has nothing to translate", "<p>12,345.00 https://example.com</p>", { autoTranslate: true }],
    ["the message is in the chosen source language and that is the target", "<p>Ceci est un message.</p>", { autoTranslate: true, sourceLang: "fr", targetLang: "fr" }],
  ])("does not auto-start when %s", async (_name, html, over) => {
    const translate = answering((text) => ok(text))
    const { c } = await mount(html, publicSettings(over), { translate, detect: async () => null })
    expect(await c.maybeAutoStart()).toBe(false)
    expect(c.active).toBe(false)
  })

  it("does not auto-start again while active", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const { c } = await mount("<p>This message is written in English.</p>", publicSettings({ autoTranslate: true }), { translate })
    expect(await c.maybeAutoStart()).toBe(true)
    expect(await c.maybeAutoStart()).toBe(false)
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it("a retry button kept from a stopped translation does nothing", async () => {
    const translate = answering(() => fail("HTTP 500"))
    const { c, original } = await mount("<p>Good morning</p>", publicSettings(), { translate })
    await c.start()
    const marker = document.querySelector<HTMLElement>(".tt-error")!
    c.stop()
    marker.click()
    await Promise.resolve()
    expect(translate).toHaveBeenCalledTimes(1)
    expect(document.body.innerHTML).toBe(original)
  })

  it("drops answers that arrive after stop", async () => {
    const r = manualTranslate()
    const { c, original, reports } = await mount("<p>Good morning</p>", tieredSettings(["machine", "ai"]), { translate: r.translate })
    void c.start()
    await vi.waitFor(() => expect(r.translate).toHaveBeenCalledTimes(1))
    c.stop()
    const count = reports.length
    r.answer("Good morning", "machine", ok("MT"))
    r.answer("Good morning", "ai", fail("AI down"))
    r.done("Good morning")
    await Promise.resolve()
    expect(document.body.innerHTML).toBe(original)
    expect(reports).toHaveLength(count)
  })
})

describe("subject line", () => {
  const line = () => document.querySelector<HTMLElement>(".tt-subject")

  it("puts the subject above the body, translates its text without the prefixes and removes it on stop", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const subject = vi.fn(async () => "Re: Fwd: Budget for the next quarter")
    const { c, reports, original } = await mount("<p>Good morning</p>", publicSettings(), { translate, subject })
    await c.start()
    expect(document.body.firstElementChild).toBe(line())
    expect(line()!.querySelector(".tt-subject-prefix")!.textContent).toBe("Re: Fwd: ")
    // Bilingual: the subject, then its translation.
    expect(line()!.querySelector(".tt-subject-text")!.firstChild!.textContent).toBe("Budget for the next quarter")
    expect(line()!.querySelector(".tt-translation.tt-bilingual")!.textContent).toBe("T:Budget for the next quarter")
    expect(translate.mock.calls.map(([req]) => req.text)).toEqual(["Good morning", "Budget for the next quarter"])
    await vi.waitFor(() => expect(reports.at(-1)).toMatchObject({ total: 2, done: 2 }))
    c.stop()
    expect(line()).toBeNull()
    expect(document.body.innerHTML).toBe(original)
  })

  it("shows only the prefixes and the translation in translation-only mode", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const { c } = await mount("<p>Good morning</p>", publicSettings({ mode: "translation-only" }), { translate, subject: async () => "AW: Meeting" })
    await c.start()
    expect(line()!.textContent).toBe("AW: T:Meeting")
  })

  it.each<[string, Partial<PublicSettings>, (() => Promise<string | null>) | undefined]>([
    ["the switch is off", { translateSubject: false }, async () => "Budget"],
    ["the page has no subject to ask for", {}, undefined],
    ["the message has no subject", {}, async () => null],
    ["the subject cannot be read", {}, () => Promise.reject(new Error("no message"))],
    ["the subject is only prefixes and numbers", {}, async () => "Re: 2026-10-14"],
    ["the subject is already in the target language", {}, async () => "回复：下个季度的预算"],
  ])("adds no line when %s", async (_name, over, subject) => {
    const translate = answering((text) => ok(`T:${text}`))
    const { c } = await mount("<p>Good morning</p>", publicSettings(over), { translate, ...(subject ? { subject: vi.fn(subject) } : {}) })
    await c.start()
    expect(line()).toBeNull()
    expect(translate.mock.calls.map(([req]) => req.text)).toEqual(["Good morning"])
  })

  it("starts again when the switch changes while the message is translated", async () => {
    const translate = answering((text) => ok(`T:${text}`))
    const subject = vi.fn(async () => "Budget")
    const { c } = await mount("<p>Good morning</p>", publicSettings({ translateSubject: false }), { translate, subject })
    await c.start()
    expect(line()).toBeNull()
    await c.updateSettings(publicSettings({ translateSubject: true }))
    expect(line()!.textContent).toContain("T:Budget")
    await c.updateSettings(publicSettings({ translateSubject: false }))
    expect(line()).toBeNull()
    expect(c.active).toBe(true)
    expect(subject).toHaveBeenCalledTimes(1)
  })

  it("does not show a subject that arrives after stop", async () => {
    let answer!: (subject: string) => void
    const translate = answering((text) => ok(`T:${text}`))
    const { c, original } = await mount("<p>Good morning</p>", publicSettings(), { translate, subject: () => new Promise((resolve) => (answer = resolve)) })
    const started = c.start()
    c.stop()
    answer("Budget")
    await started
    expect(document.body.innerHTML).toBe(original)
    expect(translate).not.toHaveBeenCalled()
  })
})
