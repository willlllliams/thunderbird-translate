// @vitest-environment jsdom
/**
 * The summary and to-dos of a message: the prompts and the reading of the model's JSON (background/summary.ts), the
 * request of the translation service with its consent, cache and the glossary of precise translation, the panel above
 * the message with its Markdown copy (content/summary.ts), and the way the content script, the background script and
 * the popup ask for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createCommandRunner } from "../src/background/commands"
import { buildSummaryPrompt, buildSummarySystem, MAX_SUMMARY_ITEMS, parseSummary } from "../src/background/summary"
import { displayedHeader } from "../src/background/subject"
import { createTabRegistry } from "../src/background/tabs"
import type { LlmCallOptions } from "../src/background/translators/llm"
import type { MailAnalysis, Segment } from "../src/background/translators/llm-prompt"
import { connectContent } from "../src/content/client"
import { SummaryButton, SummaryPanel, summaryMarkdown } from "../src/content/summary"
import { ENGLISH, setI18n } from "../src/shared/i18n"
import { createMailContext } from "../src/shared/mail-context"
import type { BackgroundRequest, PortPush } from "../src/shared/messages"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"
import { createDefaultSettings, normalizeSettings, type Settings, SUMMARY_PARTS, summaryProvider, toPublicSettings } from "../src/shared/settings"
import type { MailSummary, SummaryResponse } from "../src/shared/summary"
import { backgroundPort, pagePort, stubBrowser } from "./fixtures/browser"
import { publicSettings } from "./fixtures/content"
import { createService, translateOne, until } from "./helpers"

const SUMMARY: MailSummary = {
  summary: ["Anna asks to move the acceptance test."],
  actions: [
    { who: "me", task: "Confirm the new date", due: "2026-10-23", dueText: "by Thursday", quote: "Could we move the acceptance to Thursday?" },
    { who: "Tom", task: "Book the room", due: "", dueText: "", quote: "" },
  ],
  questions: [{ from: "Anna", question: "Does Thursday 3 pm work?" }],
  dates: [{ what: "Acceptance test", when: "2026-10-23 15:00", where: "Room 4" }],
}

const ANSWER = JSON.stringify({
  summary: SUMMARY.summary,
  actions: [
    { who: "me", task: "Confirm the new date", due: "2026-10-23", due_text: "by Thursday", quote: "Could we move the acceptance to Thursday?" },
    { who: "Tom", task: "Book the room" },
  ],
  questions: [{ from: "Anna", question: "Does Thursday 3 pm work?" }],
  dates: [{ what: "Acceptance test", when: "2026-10-23T15:00", where: "Room 4" }],
})

beforeEach(() => setI18n(ENGLISH))

describe("reading the answer", () => {
  it("takes the JSON out of fences and chatter and renames due_text", () => {
    expect(parseSummary(`Sure! Here it is:\n\`\`\`json\n${ANSWER}\n\`\`\`\nAnything else?`)).toEqual(SUMMARY)
    expect(parseSummary(`<think>reasoning</think>${ANSWER}`)).toEqual(SUMMARY)
  })

  it("tolerates trailing commas, a string for a list and missing lists, and keeps only what it can check", () => {
    const raw = `{"summary": "One sentence.", "actions": [{"task": "  "}, {"task": "Call Anna", "due": "next week", "quote": "${"q".repeat(200)}"}, "loose text", 7,], "dates": [{"when": "2026-01-01"}, {"what": "Kick-off", "when": "2026-11-02 09:30:00"}],}`
    expect(parseSummary(raw)).toEqual({
      summary: ["One sentence."],
      actions: [{ who: "", task: "Call Anna", due: "", dueText: "", quote: "q".repeat(120) }],
      questions: [],
      dates: [{ what: "Kick-off", when: "2026-11-02 09:30", where: "" }],
    })
  })

  it("cuts every list to its maximum and leaves the parts not asked for empty", () => {
    const many = JSON.stringify({ summary: Array.from({ length: 15 }, (_, i) => `S${i}`), questions: [{ from: "A", question: "Q?" }], dates: null })
    const parsed = parseSummary(many, ["summary", "dates"])!
    expect(parsed.summary).toHaveLength(MAX_SUMMARY_ITEMS)
    expect(parsed.questions).toEqual([])
    expect(parsed.dates).toEqual([])
    expect(parseSummary(JSON.stringify({ summary: ["", 3, { text: "an object" }, "Kept"], questions: [{ from: "A" }] }))).toMatchObject({ summary: ["Kept"], questions: [] })
  })

  it("finds nothing in an answer without an object of the four lists", () => {
    for (const raw of ["No summary today.", "[1, 2]", '{"title": "x"}', "{broken"]) expect(parseSummary(raw)).toBeNull()
  })
})

describe("the prompts", () => {
  it("writes the target language into the system prompt and asks the parts left out as empty lists", () => {
    const system = buildSummarySystem(DEFAULT_PROMPTS.summary, "German", SUMMARY_PARTS)
    expect(system).toContain("Answer in German with ONLY a JSON object")
    expect(system).not.toContain("{{to}}")
    expect(buildSummarySystem("In {{to}}.", "Japanese", ["summary", "actions"])).toBe('In Japanese.\nLeave "questions", "dates" as [].')
  })

  it("gives the message with its sender, date and subject, and the glossary of precise translation", () => {
    const header = { author: 'Anna "QA" <anna@example.com>', date: "2026-10-21T07:12:00.000Z", subject: "Abnahme & Termin" }
    expect(buildSummaryPrompt("Hallo Tom", header)).toBe('<email from="Anna &quot;QA&quot; &lt;anna@example.com>" date="2026-10-21T07:12:00.000Z" subject="Abnahme &amp; Termin">\nHallo Tom\n</email>')
    expect(buildSummaryPrompt("Hi", null, [{ source: "Abnahme", target: "acceptance" }])).toBe("<email>\nHi\n</email>\n\nWrite these names and terms as the translation of the email does:\n- Abnahme → acceptance")
  })
})

describe("the settings of the summary", () => {
  it("default to the AI tier, all four parts, 800 tokens, expanded, without a button above the message", () => {
    const s = createDefaultSettings("en")
    expect(s.summary).toEqual({ provider: null, model: "", inlineButton: false, parts: [...SUMMARY_PARTS], maxOutputTokens: 800, display: "expanded" })
    expect(summaryProvider(s)).toBeNull()
    s.tiers.ai = "openai"
    expect(summaryProvider(s)).toBe("openai")
    s.summary.provider = "anthropic"
    expect(summaryProvider(s)).toBe("openai")
    s.providers.anthropic.enabled = true
    expect(summaryProvider(s)).toBe("anthropic")
  })

  it("are taken from storage within their ranges; settings of earlier versions get the defaults", () => {
    const s = normalizeSettings({ summary: { provider: "google-free", model: " m ", inlineButton: true, parts: ["dates", "x", "summary"], maxOutputTokens: 99999, display: "collapsed" } })
    expect(s.summary).toEqual({ provider: null, model: "m", inlineButton: true, parts: ["summary", "dates"], maxOutputTokens: 4000, display: "collapsed" })
    expect(normalizeSettings({ summary: { provider: "openai", parts: "all" } }).summary).toMatchObject({ provider: "openai", parts: [...SUMMARY_PARTS] })
    expect(normalizeSettings({ uiLanguage: "en" }).summary).toEqual(createDefaultSettings().summary)
  })

  it("tell the content script whether a service is there, how to show it, and which consent it needs", () => {
    const s = createDefaultSettings("en")
    expect(toPublicSettings(s).summary).toEqual({ available: false, inlineButton: false, collapsed: false, consent: null })
    s.tiers.ai = "openai"
    s.summary.inlineButton = true
    s.summary.display = "collapsed"
    expect(toPublicSettings(s).summary).toEqual({ available: true, inlineButton: true, collapsed: true, consent: { id: "openai", host: "api.openai.com" } })
    s.onlineConsent = ["openai@api.openai.com"]
    expect(toPublicSettings(s).summary.consent).toBeNull()
  })
})

describe("the summary request of the translation service", () => {
  const header = { author: "Anna <anna@example.de>", date: "2026-10-21T07:12:00.000Z", subject: "Abnahme" }

  function setup(over: (s: Settings) => void = () => {}, answer = ANSWER) {
    const settings = createDefaultSettings("en")
    settings.tiers.ai = "openai"
    settings.providers.openai.apiKey = "sk-test"
    settings.targetLang = "de"
    over(settings)
    const summarize = vi.fn(async (_prompt: string, _opts: LlmCallOptions) => answer)
    const { service, cache } = createService(settings, { llm: { summarize }, i18n: () => ENGLISH })
    return { service, cache, settings, summarize }
  }

  it("asks the AI tier with the summary prompt, the message and its header, within the token limit, and caches the answer", async () => {
    const { service, summarize, settings } = setup((s) => (s.summary.maxOutputTokens = 600))
    expect(await service.summarize("Hallo Tom, ...", header)).toEqual({ ok: true, service: "OpenAI", summary: SUMMARY, raw: ANSWER })
    const [prompt, opts] = summarize.mock.calls[0]
    expect(prompt).toBe(buildSummaryPrompt("Hallo Tom, ...", header))
    expect(opts).toMatchObject({ systemPrompt: buildSummarySystem(DEFAULT_PROMPTS.summary, "German", SUMMARY_PARTS), targetLanguageName: "German", maxOutputTokens: 600 })
    expect(opts.provider).toMatchObject({ id: "openai", model: "gpt-4.1-mini" })
    // The cache answers the same message; "Regenerate" asks again.
    expect((await service.summarize("Hallo Tom, ...", header)).ok).toBe(true)
    expect(summarize).toHaveBeenCalledTimes(1)
    await service.summarize("Hallo Tom, ...", header, true)
    expect(summarize).toHaveBeenCalledTimes(2)
    // Another prompt or another part list is another summary.
    settings.summary.parts = ["actions"]
    await service.summarize("Hallo Tom, ...", header)
    expect(summarize).toHaveBeenCalledTimes(3)
    expect(summarize.mock.calls[2][1].systemPrompt).toContain('Leave "summary", "questions", "dates" as [].')
  })

  it("uses the service and the model chosen for the summary", async () => {
    const { service, summarize } = setup((s) => {
      s.providers.anthropic = { enabled: true, apiKey: "k", baseURL: "", model: "" }
      s.summary.provider = "anthropic"
      s.summary.model = "claude-sonnet-5-5"
    })
    expect((await service.summarize("Text", null)) as { service: string }).toMatchObject({ ok: true, service: "Anthropic Claude" })
    expect(summarize.mock.calls[0][1].provider).toMatchObject({ id: "anthropic", model: "claude-sonnet-5-5" })
  })

  it("keeps an answer it cannot read out of the cache and hands it over as it is", async () => {
    const { service, summarize } = setup(undefined, "I cannot help with that.")
    expect(await service.summarize("Text", null)).toEqual({ ok: true, service: "OpenAI", summary: null, raw: "I cannot help with that." })
    await service.summarize("Text", null)
    expect(summarize).toHaveBeenCalledTimes(2)
  })

  it("B1: sends nothing when the user took the consent back while the request waited in the queue", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { service, settings, summarize } = setup((s) => (s.batch.concurrency = 1))
    summarize.mockImplementationOnce(async () => {
      await gate
      return ANSWER
    })
    // The first summary holds the only slot of the service.
    const first = service.summarize("First", null)
    await until(() => expect(summarize).toHaveBeenCalledTimes(1))
    const second = service.summarize("Second", null)
    await new Promise((r) => setTimeout(r, 20))
    settings.onlineConsent = []
    release()
    expect(await first).toMatchObject({ ok: true })
    expect(await second).toEqual({ ok: false, service: "OpenAI", error: ENGLISH.t("errConsentRequired", ["OpenAI"]) })
    expect(summarize).toHaveBeenCalledTimes(1)
  })

  it("sends nothing without a service or before the user allowed it, and reports a failed request", async () => {
    const none = setup((s) => (s.tiers.ai = null))
    expect(await none.service.summarize("Text", null)).toEqual({ ok: false, error: ENGLISH.t("errSummaryService") })
    const refused = setup((s) => (s.onlineConsent = []))
    refused.settings.onlineConsent = []
    expect(await refused.service.summarize("Text", null)).toEqual({ ok: false, service: "OpenAI", error: ENGLISH.t("errConsentRequired", ["OpenAI"]) })
    expect(refused.summarize).not.toHaveBeenCalled()
    const failing = setup()
    failing.summarize.mockRejectedValueOnce(Object.assign(new Error("Incorrect API key"), { statusCode: 401, isRetryable: false }))
    expect(await failing.service.summarize("Text", null)).toMatchObject({ ok: false, service: "OpenAI", error: expect.stringContaining("Incorrect API key") })
  })

  it("adds the glossary of the analysis that precise translation made of the message, also from the cache", async () => {
    const paragraphs = ["Hi Anna, thanks for the Acme Cloud offer.", "你好", "The Acme Cloud plan fits our team.", "Best, Tom"]
    const analysis: MailAnalysis = { summary: "Tom thanks Anna.", glossary: [{ source: "Acme Cloud", target: "Acme-Wolke" }], tone: "Friendly." }
    const llm = {
      batch: vi.fn(async (segments: Segment[]) => segments.map((s) => `AI(${s.text})`)),
      single: vi.fn(async (segment: Segment) => `AI(${segment.text})`),
      analyze: vi.fn(async () => analysis),
      summarize: vi.fn(async (_prompt: string, _opts: LlmCallOptions) => ANSWER),
    }
    const settings = createDefaultSettings("en")
    settings.tiers.ai = "openai"
    settings.providers.openai.apiKey = "sk-test"
    settings.precise.enabled = true
    settings.batch.maxCharsPerBatch = 40
    const { service, cache } = createService(settings, { llm })
    const context = createMailContext(paragraphs, [0, 2, 3])
    service.setContext(context)
    await Promise.all([0, 2, 3].map((i) => translateOne(service, { providerId: "openai", text: paragraphs[i], targetLang: "zh-CN", context: { id: context.id, index: i } })))
    expect(llm.analyze).toHaveBeenCalledTimes(1)
    settings.targetLang = "zh-CN"
    await service.summarize(context.text, null)
    expect(llm.summarize.mock.calls[0][0]).toContain("- Acme Cloud → Acme-Wolke")
    // A new background script finds the analysis in the cache.
    const later = createService(settings, { llm, cache }).service
    await later.summarize(context.text, null, true)
    expect(llm.summarize.mock.calls[1][0]).toContain("- Acme Cloud → Acme-Wolke")
    // Without precise translation, or for another message, there is no glossary.
    settings.precise.enabled = false
    await later.summarize(context.text, null, true)
    expect(llm.summarize.mock.calls[2][0]).not.toContain("Acme-Wolke")
    settings.precise.enabled = true
    await later.summarize("Another message", null, true)
    expect(llm.summarize.mock.calls[3][0]).not.toContain("Acme-Wolke")
  })
})

describe("the background script", () => {
  it("reads sender, date and subject of the message on screen", async () => {
    const getDisplayedMessage = vi.fn(async (tabId: number) => (tabId === 1 ? { id: 1, author: "Anna", date: new Date("2026-10-21T07:12:00Z"), subject: "Hi" } : tabId === 2 ? { id: 2, author: "", date: "not a date", subject: "" } : null))
    vi.stubGlobal("browser", { messageDisplay: { getDisplayedMessage } })
    expect(await displayedHeader(1)).toEqual({ author: "Anna", date: "2026-10-21T07:12:00.000Z", subject: "Hi" })
    expect(await displayedHeader(2)).toEqual({ author: "", date: "", subject: "" })
    expect(await displayedHeader(3)).toBeNull()
    vi.unstubAllGlobals()
  })

  it("answers the summary request of a content script with the summary of the message of its tab, and a page with an error", async () => {
    stubBrowser()
    const summarize = vi.fn(async (text: string, tabId: number, fresh: boolean): Promise<SummaryResponse> => ({ ok: true, service: "AI", summary: null, raw: `${text}|${tabId}|${fresh}` }))
    const tabs = createTabRegistry({
      ready: () => Promise.resolve(),
      publicSettings: () => toPublicSettings(createDefaultSettings("en")),
      setContext: vi.fn(),
      translate: vi.fn(async () => {}),
      subject: vi.fn(async () => null),
      summarize,
    })
    const port = backgroundPort(7)
    tabs.connect(port as unknown as browser.runtime.Port)
    port.send({ type: "summary", id: 1, text: "Body" })
    port.send({ type: "summary", id: 2, text: "Body", bypassCache: true })
    await until(() => expect(port.posted.filter((m) => m.type === "summary")).toHaveLength(2))
    expect(port.posted.filter((m) => m.type === "summary")).toEqual([
      { type: "summary", id: 1, result: { ok: true, service: "AI", summary: null, raw: "Body|7|false" } },
      { type: "summary", id: 2, result: { ok: true, service: "AI", summary: null, raw: "Body|7|true" } },
    ])
    const page = backgroundPort(8, undefined, "moz-extension://test/welcome.html")
    tabs.connect(page as unknown as browser.runtime.Port)
    page.send({ type: "summary", id: 3, text: "Sample" })
    summarize.mockImplementationOnce(async () => {
      throw new Error("gone")
    })
    port.send({ type: "summary", id: 4, text: "Body" })
    await until(() => expect(page.posted.filter((m) => m.type === "summary")).toEqual([{ type: "summary", id: 3, result: { ok: false, error: ENGLISH.t("errUnknown") } }]))
    await until(() => expect(port.posted.at(-1)).toEqual({ type: "summary", id: 4, result: { ok: false, error: ENGLISH.t("errUnknown") } }))
    // The page of the setup guide has no message: the request never reached the summary.
    expect(summarize.mock.calls.map(([, tabId]) => tabId)).toEqual([7, 7, 7])
  })

  it("sends the command and the popup button to the content script of the tab", async () => {
    stubBrowser({ activeTabs: [{ id: 5 }] })
    const pushed: [number, PortPush][] = []
    const run = createCommandRunner({ ready: () => Promise.resolve(), postToTab: (tabId, msg) => void pushed.push([tabId, msg]) })
    await run("summarize", { id: 4 } as browser.tabs.Tab)
    await run("summarize")
    expect(pushed).toEqual([
      [4, { type: "summarize" }],
      [5, { type: "summarize" }],
    ])
  })
})

describe("the panel above the message", () => {
  const root = () => document.body
  let request: ReturnType<typeof vi.fn<(fresh: boolean) => Promise<SummaryResponse>>>
  const answer = (result: SummaryResponse) => request.mockResolvedValueOnce(result)
  const panel = () => document.querySelector<HTMLDetailsElement>("details.tt-summary")
  const buttons = () => Array.from(panel()!.querySelectorAll("summary button")) as HTMLButtonElement[]
  const sections = () => Array.from(panel()!.querySelectorAll("h4"), (h4) => [h4.textContent, Array.from(h4.nextElementSibling!.children, (li) => li.textContent)])

  beforeEach(() => {
    document.body.innerHTML = '<div class="tt-subject">Subject</div><p>Body</p>'
    request = vi.fn<(fresh: boolean) => Promise<SummaryResponse>>()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("draws the four parts with DOM nodes under the line with the subject, the reader as Me and each quote as hover text", async () => {
    answer({ ok: true, service: "OpenAI", summary: SUMMARY, raw: ANSWER })
    const summary = new SummaryPanel({ root, request, collapsed: () => false })
    const shown = summary.show()
    expect(panel()!.textContent).toContain(ENGLISH.t("summaryRunning"))
    await shown
    expect(summary.shown).toBe(true)
    expect(document.body.children[1]).toBe(panel())
    expect(panel()!.open).toBe(true)
    expect(panel()!.querySelector("summary strong")!.textContent).toBe(ENGLISH.t("summaryTitleService", ["OpenAI"]))
    expect(sections()).toEqual([
      ["Summary", ["Anna asks to move the acceptance test."]],
      ["To-dos", ["Me: Confirm the new date (due 2026-10-23 · by Thursday)", "Tom: Book the room"]],
      ["Questions to answer", ["Anna: Does Thursday 3 pm work?"]],
      ["Dates and meetings", ["Acceptance test · 2026-10-23 15:00 · Room 4"]],
    ])
    const items = panel()!.querySelectorAll("li")
    expect([items[1].title, items[2].hasAttribute("title")]).toEqual(["Could we move the acceptance to Thursday?", false])
    expect(panel()!.querySelector("summary")!.title).toBe(ENGLISH.t("tipSummaryPanel"))
    // Model text never becomes markup.
    answer({ ok: true, service: "X", summary: { ...SUMMARY, summary: ["<img src=x onerror=alert(1)>"] }, raw: "" })
    await summary.show()
    expect(panel()!.querySelector("img")).toBeNull()
    expect(panel()!.querySelector("li")!.textContent).toBe("<img src=x onerror=alert(1)>")
  })

  it("writes the summary as Markdown, a heading per part that has lines", () => {
    expect(summaryMarkdown(SUMMARY)).toBe(
      [
        "## Summary",
        "- Anna asks to move the acceptance test.",
        "",
        "## To-dos",
        "- **Me**: Confirm the new date (due 2026-10-23 · by Thursday)",
        "- **Tom**: Book the room",
        "",
        "## Questions to answer",
        "- **Anna**: Does Thursday 3 pm work?",
        "",
        "## Dates and meetings",
        "- Acceptance test · 2026-10-23 15:00 · Room 4",
      ].join("\n"),
    )
    expect(summaryMarkdown({ summary: [], actions: [], questions: [], dates: [{ what: "Lunch", when: "", where: "" }] })).toBe("## Dates and meetings\n- Lunch")
  })

  it("copies the Markdown with the Clipboard API, else with the copy command, and no button opens or closes the panel", async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    answer({ ok: true, service: "OpenAI", summary: SUMMARY, raw: ANSWER })
    await new SummaryPanel({ root, request, collapsed: () => false }).show()
    const [copy] = buttons()
    expect(copy.textContent).toBe(ENGLISH.t("summaryCopy"))
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    copy.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    await until(() => expect(copy.textContent).toBe(ENGLISH.t("summaryCopied")))
    expect(writeText).toHaveBeenCalledWith(summaryMarkdown(SUMMARY))
    expect(panel()!.open).toBe(true)

    writeText.mockRejectedValueOnce(new Error("not allowed"))
    const execCommand = vi.fn((command: string) => command === "copy" && document.querySelector("textarea")?.value === summaryMarkdown(SUMMARY))
    document.execCommand = execCommand as typeof document.execCommand
    buttons()[0].click()
    await until(() => expect(execCommand).toHaveReturnedWith(true))
    expect(document.querySelector("textarea")).toBeNull()
  })

  it("shows the text of an answer it could not read, a failure line by line, and nothing found", async () => {
    const summary = new SummaryPanel({ root, request, collapsed: () => true })
    answer({ ok: true, service: "OpenAI", summary: null, raw: "Sorry, no JSON." })
    await summary.show()
    expect(panel()!.open).toBe(false)
    expect(panel()!.querySelector("p")!.textContent).toBe(ENGLISH.t("summaryUnreadable"))
    expect(panel()!.querySelector("pre")!.textContent).toBe("Sorry, no JSON.")
    expect(buttons()[0].disabled).toBe(true)
    buttons()[0].click()
    answer({ ok: false, service: "OpenAI", error: "OpenAI request failed: HTTP 401\nCheck the key." })
    await summary.show()
    expect(Array.from(panel()!.querySelectorAll("p.tt-error"), (p) => p.textContent)).toEqual(["OpenAI request failed: HTTP 401", "Check the key."])
    answer({ ok: false, error: ENGLISH.t("errSummaryService") })
    await summary.show()
    expect(panel()!.querySelector("summary strong")!.textContent).toBe(ENGLISH.t("summaryTitle"))
    answer({ ok: true, service: "OpenAI", summary: { summary: [], actions: [], questions: [], dates: [] }, raw: "{}" })
    await summary.show()
    expect(panel()!.querySelector("p")!.textContent).toBe(ENGLISH.t("summaryEmpty"))
  })

  it("generates the summary again, closes, and draws only the answer of the latest request", async () => {
    const summary = new SummaryPanel({ root, request, collapsed: () => false })
    answer({ ok: true, service: "OpenAI", summary: SUMMARY, raw: ANSWER })
    await summary.show()
    let late!: (result: SummaryResponse) => void
    request.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)))
    buttons()[1].click()
    expect(request).toHaveBeenLastCalledWith(true)
    expect(panel()!.textContent).toContain(ENGLISH.t("summaryRunning"))
    buttons()[2].click()
    expect(panel()).toBeNull()
    expect(summary.shown).toBe(false)
    late({ ok: true, service: "OpenAI", summary: SUMMARY, raw: ANSWER })
    await Promise.resolve()
    expect(panel()).toBeNull()
    // Without a message nothing is asked.
    await new SummaryPanel({ root: () => null, request, collapsed: () => false }).show()
    expect(request).toHaveBeenCalledTimes(2)
    // Without a subject line the panel goes to the top of the body.
    document.body.innerHTML = "<p>Body</p>"
    answer({ ok: true, service: "OpenAI", summary: SUMMARY, raw: ANSWER })
    await summary.show()
    expect(document.body.firstElementChild).toBe(panel())
  })

  it("puts the Summary button above the message and takes it away", () => {
    const onClick = vi.fn()
    const button = new SummaryButton({ root, onClick })
    button.sync(true)
    button.sync(true)
    const bars = document.querySelectorAll(".tt-summary-button")
    expect(bars).toHaveLength(1)
    expect(document.body.children[1]).toBe(bars[0])
    const b = bars[0].querySelector("button")!
    expect([b.textContent, b.title]).toEqual([ENGLISH.t("summaryButton"), ENGLISH.t("tipSummaryButton")])
    b.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    button.sync(false)
    expect(document.querySelector(".tt-summary-button")).toBeNull()
    new SummaryButton({ root: () => null, onClick }).sync(true)
    expect(document.querySelector(".tt-summary-button")).toBeNull()
  })
})

describe("the content script", () => {
  let port: ReturnType<typeof pagePort>
  const sendMessage = vi.fn(async (_req: BackgroundRequest): Promise<unknown> => undefined)

  beforeEach(() => {
    port = pagePort()
    sendMessage.mockReset()
    vi.stubGlobal("browser", {
      runtime: { connect: () => port, sendMessage },
      i18n: { detectLanguage: async () => ({ isReliable: false, languages: [] }) },
    })
    document.body.innerHTML = "<p>Guten Morgen, Tom.</p><p>Können wir die Abnahme verschieben?</p>"
  })

  afterEach(() => vi.unstubAllGlobals())

  const summaryOn = (over: Partial<ReturnType<typeof publicSettings>["summary"]> = {}) => publicSettings({ summary: { available: true, inlineButton: false, collapsed: false, consent: null, ...over } })
  const answerSummary = async (result: SummaryResponse) => {
    await until(() => expect(port.posted("summary")).not.toHaveLength(0))
    port.push({ type: "summary", id: port.posted("summary").at(-1)!.id, result })
  }

  it("asks for the summary of the text of the message on the push of the popup or the command, and shows it", async () => {
    const client = connectContent({ root: () => document.body, contentScript: true })
    port.push({ type: "settings", settings: summaryOn() })
    await client.ready
    port.push({ type: "summarize" })
    await answerSummary({ ok: true, service: "OpenAI", summary: SUMMARY, raw: ANSWER })
    expect(port.posted("summary")[0].text).toBe(createMailContext(["Guten Morgen, Tom.", "Können wir die Abnahme verschieben?"], []).text)
    expect(port.posted("summary")[0].bypassCache).toBeUndefined()
    await until(() => expect(document.querySelectorAll(".tt-summary li")).toHaveLength(5))
    // The text was read without changing the message.
    expect(document.body.querySelectorAll("p")).toHaveLength(2)
    // "Regenerate" passes the cache; an answer to an unknown request is ignored.
    port.push({ type: "summary", id: 999, result: { ok: false, error: "stale" } })
    document.querySelectorAll<HTMLButtonElement>(".tt-summary summary button")[1].click()
    await until(() => expect(port.posted("summary")).toHaveLength(2))
    expect(port.posted("summary")[1].bypassCache).toBe(true)
    // The background went away: the request ends with an error, and so does the next one, which cannot be sent.
    port.disconnect()
    await until(() => expect(document.querySelector(".tt-summary .tt-error")?.textContent).toBe(ENGLISH.t("errUnknown")))
    port.postMessage.mockImplementation(() => {
      throw new Error("Attempt to postMessage on disconnected port")
    })
    document.querySelectorAll<HTMLButtonElement>(".tt-summary summary button")[1].click()
    expect(document.querySelector(".tt-summary .tt-error")).toBeNull()
    await until(() => expect(document.querySelector(".tt-summary .tt-error")?.textContent).toBe(ENGLISH.t("errUnknown")))
  })

  it("sends the text of the paragraphs being translated", async () => {
    const client = connectContent({ root: () => document.body, contentScript: true })
    port.push({ type: "settings", settings: summaryOn() })
    await client.ready
    port.push({ type: "toggle" })
    await until(() => expect(port.posted("translate")).toHaveLength(2))
    port.push({ type: "summarize" })
    await until(() => expect(port.posted("summary")).toHaveLength(1))
    expect(port.posted("summary")[0].text).toBe("Guten Morgen, Tom.\n\nKönnen wir die Abnahme verschieben?")
  })

  it("asks first when the service has not been allowed to receive message text, and asks nothing without a service", async () => {
    const client = connectContent({ root: () => document.body, contentScript: true })
    port.push({ type: "settings", settings: publicSettings() })
    await client.ready
    port.push({ type: "summarize" })
    await new Promise((r) => setTimeout(r, 0))
    expect(port.posted("summary")).toEqual([])
    port.push({ type: "settings", settings: summaryOn({ consent: { id: "openai", host: "api.openai.com" } }) })
    port.push({ type: "summarize" })
    await until(() => expect(document.querySelector(".tt-consent")).not.toBeNull())
    expect(document.querySelector(".tt-consent")!.textContent).toContain(ENGLISH.t("consentBodyPrecise"))
    const [allow, cancel] = Array.from(document.querySelectorAll<HTMLButtonElement>(".tt-consent button"))
    cancel.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(port.posted("summary")).toEqual([])
    port.push({ type: "summarize" })
    await until(() => expect(document.querySelector(".tt-consent")).not.toBeNull())
    document.querySelector<HTMLButtonElement>(".tt-consent button")!.click()
    await until(() => expect(sendMessage).toHaveBeenCalledWith({ type: "grantConsent", ids: ["openai"] }))
    await until(() => expect(port.posted("summary")).toHaveLength(1))
    // Allowed once: the next summary asks no more, also before the new settings arrive.
    port.push({ type: "summarize" })
    await until(() => expect(port.posted("summary")).toHaveLength(2))
    expect(document.querySelector(".tt-consent")).toBeNull()
    expect(allow).toBeDefined()
  })

  it("shows the Summary button while the message is translated, when the settings ask for it", async () => {
    const client = connectContent({ root: () => document.body, contentScript: true })
    port.push({ type: "settings", settings: summaryOn({ inlineButton: true }) })
    await client.ready
    expect(document.querySelector(".tt-summary-button")).toBeNull()
    port.push({ type: "toggle" })
    await until(() => expect(document.querySelector(".tt-summary-button")).not.toBeNull())
    document.querySelector<HTMLButtonElement>(".tt-summary-button button")!.click()
    await until(() => expect(port.posted("summary")).toHaveLength(1))
    port.push({ type: "settings", settings: summaryOn({ inlineButton: false }) })
    await until(() => expect(document.querySelector(".tt-summary-button")).toBeNull())
    port.push({ type: "settings", settings: summaryOn({ inlineButton: true }) })
    await until(() => expect(document.querySelector(".tt-summary-button")).not.toBeNull())
    port.push({ type: "toggle" })
    await until(() => expect(document.querySelector(".tt-summary-button")).toBeNull())
    // Turning the translation off leaves the summary on screen.
    expect(document.querySelector(".tt-summary")).not.toBeNull()
  })

  it("has no summary on the extension pages", async () => {
    const client = connectContent({ root: () => document.body })
    port.push({ type: "settings", settings: summaryOn() })
    await client.ready
    port.push({ type: "summarize" })
    await new Promise((r) => setTimeout(r, 0))
    expect(port.posted("summary")).toEqual([])
  })
})
