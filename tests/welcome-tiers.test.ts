// @vitest-environment jsdom
/** Welcome page: the style controls of the display step, the demo and the tour of the tiers step. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ENGLISH } from "../src/shared/i18n"
import { createDefaultSettings, type Settings } from "../src/shared/settings"
import { DEMO_TIMES, TierDemo } from "../src/welcome/demo"
import { WELCOME_KEY } from "../src/welcome/steps"
import { flushSave } from "./fixtures/pages"
import { openPage, until, useFakeTimers } from "./helpers"

// Fake timers in every test: a page left open by a test cannot fire its timers into the next one.
beforeEach(() => useFakeTimers())

afterEach(() => vi.useRealTimers())

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function settings(change: (s: Settings) => void = () => {}): Settings {
  const s = createDefaultSettings("en")
  s.targetLang = "zh-CN"
  change(s)
  return s
}

const all = { dictionary: "dictionary", machine: "bergamot", ai: "deepseek" }

/** The translation the demo shows: its text, the label of a provisional result, and whether it is provisional. */
function shown(box = "tierDemo") {
  const node = document.querySelector(`#${box} .tt-translation`)
  if (!node) return document.querySelector(`#${box} .tt-loading`) ? "loading" : null
  return { text: node.firstChild!.textContent, tag: node.querySelector(".tt-tag")?.textContent ?? null, provisional: node.classList.contains("tt-provisional") }
}

/** The system asks for less motion. */
const lessMotion = () => vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }))

describe("tier demo", () => {
  function setup(tiers: Partial<Settings["tiers"]>) {
    document.body.innerHTML = '<div id="tierDemo"></div><span id="demoStatus"></span>'
    const s = settings((s) => (s.tiers = { dictionary: null, machine: null, ai: null, ...tiers }))
    return { demo: new TierDemo($("tierDemo"), $("demoStatus")), s, status: () => $("demoStatus").textContent }
  }

  it("shows the dictionary at once, machine translation after 0.3 s and AI translation 1.5 s later, the lower results marked with their tier", () => {
    const { demo, s, status } = setup(all)
    demo.play(s)
    expect($("tierDemo").querySelector("p")!.firstChild!.textContent).toBe(ENGLISH.t("demoSource"))
    expect(shown()).toBe("loading")
    expect(status()).toBe(ENGLISH.t("statusTranslating"))
    vi.advanceTimersByTime(0)
    expect(shown()).toEqual({ text: ENGLISH.t("demoDictionary"), tag: "Dictionary", provisional: true })
    expect(status()).toBe("Tier 1: Dictionary · Dictionary (offline)")
    vi.advanceTimersByTime(299)
    expect(shown()).toMatchObject({ text: ENGLISH.t("demoDictionary") })
    vi.advanceTimersByTime(1)
    expect(shown()).toEqual({ text: ENGLISH.t("demoMachine"), tag: "Machine translation", provisional: true })
    expect(status()).toBe("Tier 2: Machine translation · Bergamot (offline)")
    vi.advanceTimersByTime(1499)
    expect(shown()).toMatchObject({ text: ENGLISH.t("demoMachine") })
    vi.advanceTimersByTime(1)
    expect(shown()).toEqual({ text: ENGLISH.t("demoAi"), tag: null, provisional: false })
    expect(status()).toBe("Tier 3: AI translation · DeepSeek")
    expect(DEMO_TIMES).toEqual({ dictionary: 0, machine: 300, ai: 1800 })
    // The style and the display mode of the settings.
    expect($("tierDemo").querySelector(".tt-translation")!.className).toBe("tt-translation tt-bilingual tt-style-border tt-flow")
    expect($("tierDemo").style.getPropertyValue("--tt-color")).toBe("#4c8bf5")
  })

  it.each([
    ["two tiers", { machine: "google-free", ai: "openai" }, [["machine", "Machine translation", true], ["ai", null, false]], "Tier 3: AI translation · OpenAI"],
    ["dictionary and machine translation", { dictionary: "dictionary", machine: "bergamot" }, [["dictionary", "Dictionary", true], ["machine", null, false]], "Tier 2: Machine translation · Bergamot (offline)"],
    ["one tier", { machine: "microsoft-free" }, [["machine", null, false]], "Tier 2: Machine translation · Microsoft Translator (free)"],
    ["AI only", { ai: "deepseek" }, [["ai", null, false]], "Tier 3: AI translation · DeepSeek"],
  ] as const)("plays only the tiers in use: %s", (_, tiers, steps, last) => {
    const { demo: d, s, status } = setup(tiers)
    d.play(s)
    const texts = { dictionary: "demoDictionary", machine: "demoMachine", ai: "demoAi" } as const
    const seen: unknown[] = []
    let at = 0
    for (const [tier] of steps) {
      vi.advanceTimersByTime(DEMO_TIMES[tier] - at)
      at = DEMO_TIMES[tier]
      seen.push(shown())
    }
    expect(seen).toEqual(steps.map(([tier, tag, provisional]) => ({ text: ENGLISH.t(texts[tier]), tag, provisional })))
    expect(status()).toBe(last)
    // Nothing comes after the highest tier.
    expect(vi.getTimerCount()).toBe(0)
  })

  it("says that a tier needs a service when every tier is empty", () => {
    const { demo: d, s, status } = setup({})
    d.play(s)
    expect(status()).toBe(ENGLISH.t("tiersEmpty"))
    expect(shown()).toBeNull()
    expect($("tierDemo").textContent).toBe(ENGLISH.t("demoSource"))
  })

  it("shows the final state at once when the system asks for less motion", () => {
    lessMotion()
    const { demo: d, s, status } = setup(all)
    d.play(s)
    expect(shown()).toEqual({ text: ENGLISH.t("demoAi"), tag: null, provisional: false })
    expect(status()).toBe("Tier 3: AI translation · DeepSeek")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("draws translation-only and the chosen style, and stops without leaving timers", () => {
    const { demo: d, s } = setup(all)
    s.mode = "translation-only"
    s.style = { preset: "highlight", color: "#ff0000", textColor: "#202124", opacity: 0.6, fontScale: 1.2 }
    d.play(s)
    vi.advanceTimersByTime(0)
    expect($("tierDemo").querySelector(".tt-translation")!.className).toBe("tt-translation tt-only tt-style-highlight tt-flow tt-provisional")
    expect($("tierDemo").style.getPropertyValue("--tt-text-color")).toBe("#202124")
    expect(vi.getTimerCount()).toBe(2)
    d.stop()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(5000)
    expect(shown()).toMatchObject({ text: ENGLISH.t("demoDictionary") })
    // A replay starts from the beginning.
    d.play(s)
    expect(shown()).toBe("loading")
    expect(vi.getTimerCount()).toBe(3)
  })
})

describe("welcome page: display and tiers steps", () => {
  const current = () => document.querySelector<HTMLElement>("section.step:not([hidden])")?.dataset.step
  const choose = (id: string, value: string, event = "change") => {
    const el = $<HTMLSelectElement>(id)
    el.value = value
    el.dispatchEvent(new Event(event))
  }
  const spot = () => document.querySelector(".spotlight select")?.id
  /** Press a key; false when the page cancelled its default action. */
  const key = (k: string, target: EventTarget = document.body) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }))

  it("offers the style controls of the settings page on the display step, previewed in the sample message", async () => {
    const page = await openPage("welcome", settings(), { stored: { [WELCOME_KEY]: { step: "display" } } })
    await until(() => expect(current()).toBe("display"))
    const controls = Array.from($("styleControls").querySelectorAll("select, input"), (el) => el.id)
    expect(controls).toEqual(["stylePreset", "styleColor", "styleTextColor", "styleOpacity", "styleFontScale"])
    expect($<HTMLSelectElement>("stylePreset").options[2].textContent).toBe(ENGLISH.t("styleHighlight"))
    choose("stylePreset", "highlight")
    choose("styleColor", "#ff0000", "input")
    choose("styleTextColor", "#202124", "input")
    choose("styleOpacity", "0.5", "input")
    choose("styleFontScale", "1.2", "input")
    const preview = $("modePreview")
    expect(Array.from(preview.querySelectorAll(".tt-translation"), (el) => el.classList.contains("tt-style-highlight"))).toEqual([true, true])
    expect(["--tt-color", "--tt-text-color", "--tt-opacity", "--tt-scale"].map((v) => preview.style.getPropertyValue(v))).toEqual(["#ff0000", "#202124", "0.5", "1.2"])
    await flushSave()
    expect(page.stored().style).toEqual({ preset: "highlight", color: "#ff0000", textColor: "#202124", opacity: 0.5, fontScale: 1.2 })
    $("styleTextColorReset").click()
    expect(preview.style.getPropertyValue("--tt-text-color")).toBe("")
    await flushSave()
    expect(page.stored().style.textColor).toBe("")
  })

  it("replays the demo after each choice, with the services chosen", async () => {
    lessMotion()
    const page = await openPage("welcome", settings((s) => (s.tiers = { ...all })), { stored: { [WELCOME_KEY]: { step: "tiers", toured: true } } })
    await until(() => expect(current()).toBe("tiers"))
    expect(spot()).toBeUndefined()
    expect(shown()).toEqual({ text: ENGLISH.t("demoAi"), tag: null, provisional: false })
    expect($("demoStatus").textContent).toBe("Tier 3: AI translation · DeepSeek")
    choose("tier-ai", "")
    expect(shown()).toEqual({ text: ENGLISH.t("demoMachine"), tag: null, provisional: false })
    expect($("demoStatus").textContent).toBe("Tier 2: Machine translation · Bergamot (offline)")
    choose("tier-machine", "google-free")
    expect($("demoStatus").textContent).toBe("Tier 2: Machine translation · Google Translate (free)")
    choose("tier-machine", "")
    expect(shown()).toEqual({ text: ENGLISH.t("demoDictionary"), tag: null, provisional: false })
    // The last tier cannot be emptied; the demo stays.
    choose("tier-dictionary", "")
    expect($("tiersEmpty").hidden).toBe(false)
    expect(shown()).toMatchObject({ text: ENGLISH.t("demoDictionary") })
    $("demoReplay").click()
    expect(shown()).toMatchObject({ text: ENGLISH.t("demoDictionary") })
    await flushSave()
    expect(page.stored().tiers).toEqual({ dictionary: "dictionary", machine: null, ai: null })
  })

  it("tours the selectors once: Next, a choice and Enter go on, the last step closes it, the link shows it again and Esc skips", async () => {
    lessMotion()
    const page = await openPage("welcome", settings(), { stored: { [WELCOME_KEY]: { step: "display" } } })
    await until(() => expect(current()).toBe("display"))
    expect(spot()).toBeUndefined()
    $("nextStep").click()
    await until(() => expect(current()).toBe("tiers"))
    const tip = $("tourTip")
    expect([spot(), tip.hidden, $("tourText").textContent]).toEqual(["tier-dictionary", false, ENGLISH.t("spotlightDictionary")])
    expect(tip.getAttribute("role")).toBe("dialog")
    expect(document.activeElement).toBe($("tourNext"))
    expect($("tourNext").textContent).toBe(ENGLISH.t("buttonNext"))
    $("tourNext").click()
    expect([spot(), $("tourText").textContent]).toEqual(["tier-machine", ENGLISH.t("spotlightMachine")])
    // Choosing a service in the selector shown goes on; a choice in another one does not.
    choose("tier-dictionary", "dictionary")
    expect(spot()).toBe("tier-machine")
    choose("tier-machine", "bergamot")
    expect([spot(), $("tourText").textContent, $("tourNext").textContent]).toEqual(["tier-ai", ENGLISH.t("spotlightAi"), ENGLISH.t("noticeClose")])
    // Enter on a control does what the control does; elsewhere it goes on.
    expect(key("Enter", $("tier-ai"))).toBe(true)
    expect(spot()).toBe("tier-ai")
    // The key press is cancelled, so it does not also click "Next", which has the focus by then.
    expect(key("Enter")).toBe(false)
    expect([spot(), tip.hidden]).toEqual([undefined, true])
    await until(() => expect(page.local(WELCOME_KEY)).toEqual({ step: "tiers", toured: true }))

    // Back and again: it does not open by itself.
    $("prevStep").click()
    await until(() => expect(current()).toBe("display"))
    $("nextStep").click()
    await until(() => expect(current()).toBe("tiers"))
    expect(spot()).toBeUndefined()
    await until(() => expect(page.local(WELCOME_KEY)).toEqual({ step: "tiers", toured: true }))

    // The link starts it again; Esc skips it and gives the focus back.
    $("tourAgain").focus()
    $("tourAgain").click()
    expect([spot(), document.activeElement]).toEqual(["tier-dictionary", $("tourNext")])
    key("Escape")
    expect([spot(), tip.hidden, document.activeElement]).toEqual([undefined, true, $("tourAgain")])
    $("tourAgain").click()
    $("tourSkip").click()
    expect(spot()).toBeUndefined()
  })

  it("stops the demo and ends the tour when the user leaves the step, and only stops them when the page goes away", async () => {
    const page = await openPage("welcome", settings((s) => (s.tiers.ai = "deepseek")), { stored: { [WELCOME_KEY]: { step: "tiers" } } })
    await until(() => expect(current()).toBe("tiers"))
    expect(spot()).toBe("tier-dictionary")
    expect(shown()).toBe("loading")
    // The page goes away: timers and listeners end, the tour has not been closed by the user.
    dispatchEvent(new Event("pagehide"))
    expect(spot()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(DEMO_TIMES.ai)
    expect(shown()).toBe("loading")
    expect(page.local(WELCOME_KEY)).toEqual({ step: "tiers" })

    $("tourAgain").click()
    $("demoReplay").click()
    $("nextStep").click()
    await until(() => expect(current()).toBe("machine"))
    expect(spot()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(DEMO_TIMES.ai)
    expect(shown()).toBe("loading")
    await until(() => expect(page.local(WELCOME_KEY)).toEqual({ step: "machine", toured: true }))
  })
})
