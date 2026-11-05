// @vitest-environment jsdom
/** Popup: translation state of the message, the toggle and retranslate buttons, every switch, the links and the interface language. */
import { readLocaleSources } from "../scripts/locales.mjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ENGLISH } from "../src/shared/i18n"
import { IDLE_TAB_STATE, type TabState } from "../src/shared/messages"
import { createDefaultSettings } from "../src/shared/settings"
import { REFRESH_AFTER_ACTION_MS, REFRESH_INTERVAL_MS } from "../src/popup/timing"
import { nextTask, openPage, until, useFakeTimers } from "./helpers"

// Fake timers in every test: a page left open by a test cannot fire its timers into the next one.
beforeEach(() => useFakeTimers())

afterEach(() => vi.useRealTimers())

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const tabState = (over: Partial<TabState>): TabState => ({ ...IDLE_TAB_STATE, connected: true, ...over })
/** How often the popup asked for the state of the tab. */
const asked = (page: { sendMessage: { mock: { calls: [{ type: string }][] } } }) => page.sendMessage.mock.calls.filter(([req]) => req.type === "getTabState").length

/** The popup over a message tab whose content script reports `state`. */
async function popup(state: TabState | (() => TabState), settings = createDefaultSettings("en"), uiLanguage?: string) {
  const current = typeof state === "function" ? state : () => state
  const page = await openPage("popup", settings, {
    activeTab: { id: 3 },
    uiLanguage,
    respond: (req) => (req.type === "getTabState" ? current() : undefined),
  })
  await until(() => expect($("status").textContent).not.toBe(""))
  return page
}

describe("translation state", () => {
  it.each([
    ["no content script", IDLE_TAB_STATE, ENGLISH.t("popupNotConnected"), true],
    ["not translated", tabState({}), ENGLISH.t("popupIdle"), false],
    ["nothing to translate", tabState({ active: true }), ENGLISH.t("popupNothing"), false],
    ["in progress", tabState({ active: true, total: 12, done: 3 }), ENGLISH.t("popupProgress", [3, 12]), false],
    ["with provisional paragraphs", tabState({ active: true, total: 9, done: 7, provisional: 2 }), ENGLISH.t("popupProgressProvisional", [7, 9, 2]), false],
    ["with failures", tabState({ active: true, total: 9, done: 7, failed: 2 }), `${ENGLISH.t("popupProgress", [7, 9])} · ${ENGLISH.t("popupFailed", [2])}`, false],
  ])("%s", async (_name, state, status, disabled) => {
    await popup(state)
    await until(() => expect($("status").textContent).toBe(status))
    expect($<HTMLButtonElement>("toggle").disabled).toBe(disabled)
    expect($("toggle").classList.contains("active")).toBe(state.active)
    expect($("toggle").textContent).toBe(ENGLISH.t(state.active ? "popupShowOriginal" : "popupTranslate"))
    // Retranslating is offered only beside "Show original".
    expect($("retranslate").hidden).toBe(!state.active)
    expect($("lastError").hidden).toBe(true)
  })

  it("S1: shows the questions of the consent panels of the message, answers them, and takes the focus on them, not on a button", async () => {
    const text = { kind: "text" as const, needs: [{ id: "google-free", host: "translate.googleapis.com" }], uses: ["paragraphs" as const, "summary" as const], id: 11 }
    const image = { id: 12, kind: "image" as const, need: { id: "openai", host: "api.openai.com" }, count: 3, each: false, glossary: true, maxLongEdge: 1568, format: "JPEG" }
    let questions = [text, image]
    const page = await popup(() => tabState({ consent: questions }))
    await until(() => expect($("consentAsk").hidden).toBe(false))
    const groups = Array.from($("consentAsk").querySelectorAll<HTMLElement>("[role=group]"))
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([ENGLISH.t("consentTitle"), ENGLISH.t("imageConsentTitleAuto", [3, "OpenAI"])])
    expect(groups[0].querySelector("li")!.textContent).toBe(ENGLISH.t("consentService", ["Google Translate (free)", "translate.googleapis.com"]))
    // What is sent: the paragraphs to translate and the message with sender, date and subject to summarize; one neutral button.
    expect(groups[0].textContent).toContain(ENGLISH.t("consentBody"))
    expect(groups[0].textContent).toContain(ENGLISH.t("consentBodySummary"))
    expect(groups[0].querySelector("button")!.textContent).toBe(ENGLISH.t("consentAllow"))
    expect(groups[1].textContent).toContain(ENGLISH.t("imageConsentGlossary"))
    expect(Array.from(groups[1].querySelectorAll("button"), (b) => [b.textContent, b.title])).toEqual([
      [ENGLISH.t("imageConsentAllowAuto"), ENGLISH.t("tipImageConsentAllow")],
      [ENGLISH.t("consentCancel"), ENGLISH.t("tipImageConsentCancel")],
    ])
    expect(document.activeElement).toBe($("consentAsk"))
    questions = [image]
    groups[0].querySelector<HTMLButtonElement>("button")!.click()
    await until(() => expect(page.sendMessage).toHaveBeenCalledWith({ type: "answerConsent", tabId: 3, kind: "text", id: 11, allowed: true }))
    await until(() => expect($("consentAsk").querySelectorAll("[role=group]")).toHaveLength(1))
    questions = []
    $("consentAsk").querySelectorAll<HTMLButtonElement>("button")[1].click()
    await until(() => expect(page.sendMessage).toHaveBeenCalledWith({ type: "answerConsent", tabId: 3, kind: "image", id: 12, allowed: false }))
    await until(() => expect($("consentAsk").hidden).toBe(true))
  })

  it("shows the first line of the most recent failure, shortened, with the full text as tooltip", async () => {
    const lastError = `OpenAI: HTTP 429 Too Many Requests ${"x".repeat(120)}\nTry again later.`
    await popup(tabState({ active: true, total: 2, done: 1, failed: 1, lastError }))
    await until(() => expect($("lastError").hidden).toBe(false))
    const shown = `OpenAI: HTTP 429 Too Many Requests ${"x".repeat(90 - 36)}…`
    expect(shown).toHaveLength(90)
    expect($("lastError").textContent).toBe(ENGLISH.t("popupLastError", [shown]))
    expect($("lastError").title).toBe(lastError)
  })

  it("hides an old error once no paragraph is failed", async () => {
    await popup(tabState({ active: true, total: 2, done: 2, failed: 0, lastError: "old" }))
    expect($("lastError").hidden).toBe(true)
    expect($("lastError").textContent).toBe("")
  })

  it("follows the state of the message every half second", async () => {
    let state = tabState({ active: true, total: 4, done: 1 })
    await popup(() => state)
    expect($("status").textContent).toBe(ENGLISH.t("popupProgress", [1, 4]))
    state = tabState({ active: true, total: 4, done: 4 })
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS)
    expect($("status").textContent).toBe(ENGLISH.t("popupProgress", [4, 4]))
  })

  it("asks no state and keeps the button disabled without a message tab", async () => {
    const { sendMessage } = await openPage("popup", createDefaultSettings("en"))
    await until(() => expect($("status").textContent).toBe(ENGLISH.t("popupNotConnected")))
    $("toggle").click()
    await nextTask()
    expect(sendMessage.mock.calls.map(([req]) => req.type)).not.toContain("toggleTab")
    $("retranslate").click()
    await vi.advanceTimersByTimeAsync(REFRESH_AFTER_ACTION_MS + REFRESH_INTERVAL_MS)
    expect(sendMessage.mock.calls.map(([req]) => req.type)).not.toContain("retranslateTab")
    expect(sendMessage.mock.calls.map(([req]) => req.type)).not.toContain("getTabState")
  })
})

describe("controls", () => {
  it("toggles the translation of the tab and shows the new state", async () => {
    let state = tabState({})
    const page = await popup(() => state)
    page.sendMessage.mockImplementation(async (req) => {
      if (req.type === "toggleTab") state = tabState({ active: true, total: 3, done: 3 })
      return req.type === "getTabState" ? state : undefined
    })
    $("toggle").click()
    expect(page.sendMessage).toHaveBeenCalledWith({ type: "toggleTab", tabId: 3 })
    await nextTask()
    const before = asked(page)
    // The state is asked again a moment after the click, before the next regular refresh.
    await vi.advanceTimersByTimeAsync(REFRESH_AFTER_ACTION_MS)
    expect(asked(page)).toBe(before + 1)
    expect($("toggle").textContent).toBe(ENGLISH.t("popupShowOriginal"))
  })

  it("retranslates a translated message and keeps offering it", async () => {
    const page = await popup(tabState({ active: true, total: 3, done: 3 }))
    expect($("retranslate").textContent).toBe(ENGLISH.t("popupRetranslate"))
    expect($("retranslate").title).toBe(ENGLISH.t("popupRetranslateHint"))
    $("retranslate").click()
    expect(page.sendMessage).toHaveBeenCalledWith({ type: "retranslateTab", tabId: 3 })
    expect(page.sendMessage).not.toHaveBeenCalledWith({ type: "toggleTab", tabId: 3 })
    await nextTask()
    const before = asked(page)
    await vi.advanceTimersByTimeAsync(REFRESH_AFTER_ACTION_MS)
    expect(asked(page)).toBe(before + 1)
    expect($("retranslate").hidden).toBe(false)
  })

  it("hides the retranslate button once the original is shown again", async () => {
    let state = tabState({ active: true, total: 3, done: 3 })
    const page = await popup(() => state)
    page.sendMessage.mockImplementation(async (req) => {
      if (req.type === "toggleTab") state = tabState({})
      return req.type === "getTabState" ? state : undefined
    })
    $("toggle").click()
    await until(() => expect($("retranslate").hidden).toBe(true))
  })

  it("saves the display mode, automatic translation and the target language", async () => {
    const page = await popup(tabState({}))
    const only = document.querySelector<HTMLInputElement>('input[name="mode"][value="translation-only"]')!
    only.checked = true
    only.dispatchEvent(new Event("change"))
    await until(() => expect(page.stored().mode).toBe("translation-only"))
    // A radio button that is being unchecked does not save.
    const bilingual = document.querySelector<HTMLInputElement>('input[name="mode"][value="bilingual"]')!
    bilingual.dispatchEvent(new Event("change"))
    $<HTMLInputElement>("autoTranslate").click()
    await until(() => expect(page.stored().autoTranslate).toBe(true))
    expect(page.stored().mode).toBe("translation-only")
    const target = $<HTMLSelectElement>("targetLang")
    target.value = "ko"
    target.dispatchEvent(new Event("change"))
    await until(() => expect(page.stored().targetLang).toBe("ko"))
  })

  it("shows the stored switches", async () => {
    const s = createDefaultSettings("en")
    Object.assign(s, { mode: "translation-only", autoTranslate: true, sourceLang: "ja", targetLang: "ja" })
    s.tiers.ai = "openai"
    s.precise.enabled = true
    await popup(tabState({}), s)
    expect(document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value).toBe("translation-only")
    expect($<HTMLInputElement>("autoTranslate").checked).toBe(true)
    expect($<HTMLInputElement>("preciseEnabled").checked).toBe(true)
    expect($("preciseRow").hidden).toBe(false)
    expect($("sameLanguage").hidden).toBe(false)
    expect($<HTMLSelectElement>("tier-ai").value).toBe("openai")
  })

  it("opens the settings page and closes", async () => {
    const page = await popup(tabState({}))
    const click = new MouseEvent("click", { cancelable: true })
    $("openOptions").dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(page.openOptionsPage).toHaveBeenCalledTimes(1)
    expect(page.close).toHaveBeenCalledTimes(1)
  })

  it("names the keyboard shortcuts", async () => {
    await popup(tabState({}))
    expect(document.querySelector("footer .hint")!.textContent).toBe(ENGLISH.t("popupShortcuts"))
  })
})

describe("interface language", () => {
  const de = readLocaleSources().de

  it("follows Thunderbird's language", async () => {
    await popup(tabState({}), createDefaultSettings("de"), "de-DE")
    expect(document.documentElement.lang).toBe("de")
    expect($("toggle").textContent).toBe(de.popupTranslate)
    expect($("status").textContent).toBe(de.popupIdle)
  })

  it("switches at once when the settings page changes it, and redraws the state", async () => {
    const page = await popup(tabState({ active: true, total: 1000, done: 1000 }))
    page.external((s) => (s.uiLanguage = "de"))
    await until(() => expect(document.documentElement.lang).toBe("de"))
    expect($("status").textContent).toBe(de.popupProgress.replace("$1", "1.000").replace("$2", "1.000"))
    expect($("openOptions").textContent).toBe(de.popupSettings)
    expect($("tierLabel-machine").textContent).toContain(de.tierMachine)
  })

  it("ignores changes of other storage areas and other keys", async () => {
    const page = await popup(tabState({}))
    page.emitChange({ settings: { newValue: { ...createDefaultSettings("en"), autoTranslate: true } } }, "sync")
    page.emitChange({ welcome: { newValue: { step: "ai" } } }, "local")
    expect($<HTMLInputElement>("autoTranslate").checked).toBe(false)
  })
})

describe("summary and to-dos", () => {
  it("asks the content script for the summary, with an AI service of its own or of the AI tier", async () => {
    await popup(tabState({}))
    const summarize = $<HTMLButtonElement>("summarize")
    expect([summarize.disabled, summarize.title]).toEqual([true, ENGLISH.t("tipSummarizeNone")])
    const settings = createDefaultSettings("en")
    settings.tiers.ai = "openai"
    const ready = await popup(tabState({}), settings)
    await until(() => expect($<HTMLButtonElement>("summarize").disabled).toBe(false))
    expect($("summarize").title).toBe(ENGLISH.t("tipSummarize"))
    $("summarize").click()
    await until(() => expect(ready.sendMessage).toHaveBeenCalledWith({ type: "summarizeTab", tabId: 3 }))
  })

  it("is disabled without a content script", async () => {
    const settings = createDefaultSettings("en")
    settings.tiers.ai = "openai"
    await popup(IDLE_TAB_STATE, settings)
    expect($<HTMLButtonElement>("summarize").disabled).toBe(true)
  })
})
