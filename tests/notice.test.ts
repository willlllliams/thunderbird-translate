// @vitest-environment jsdom
/** The notice above a message whose paragraphs an offline tier could not translate for lack of a pack or model (src/content/notice.ts). */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TranslationController } from "../src/content/controller"
import { MissingNotice } from "../src/content/notice"
import type { MissingData } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest, TranslateResponse } from "../src/shared/messages"
import type { Tier } from "../src/shared/providers"
import { answering, manualTranslate, tieredSettings } from "./fixtures/content"
import { nextTask, until } from "./helpers"

const DICT: MissingData = { service: "dictionary", pair: "ja>zh-Hans", models: ["ja>en", "en>zh-Hans"] }
const BERGAMOT: MissingData = { service: "bergamot", pair: "ja>zh-Hans", models: ["ja>en"] }

const missing = (data: MissingData): TranslateResponse => ({ ok: false, error: "not installed", missing: data })
const ok = (text: string): TranslateResponse => ({ ok: true, text })

/** A message of two paragraphs, a controller with a notice, and what the notice sent to the background script. */
function mount(muted: string[] = []) {
  document.body.innerHTML = "<p>Thank you for the report about the budget.</p><p>See you on Friday at the office.</p>"
  const sent: BackgroundRequest[] = []
  const notice = new MissingNotice({ root: () => document.body, muted: () => muted, send: (req) => void sent.push(req) })
  const answers: Partial<Record<Tier, TranslateResponse>> = {}
  const translate = answering((_text, tier) => answers[tier] ?? ok("译文"))
  const controller = new TranslationController({ root: () => document.body, translate, notice })
  return { notice, sent, answers, controller, muted }
}

const panel = () => document.querySelector<HTMLElement>(".tt-notice")
const lines = () => Array.from(panel()?.querySelectorAll("li") ?? [], (li) => li.textContent)
const click = (text: string) => Array.from(panel()!.querySelectorAll("button")).find((b) => b.textContent === text)!.click()
const DICT_LINE = ENGLISH.t("noticeMissingDictionary", ["Japanese (日本語) → Simplified Chinese (简体中文)", "Japanese (日本語) → English and English → Simplified Chinese (简体中文)"])
const BERGAMOT_LINE = ENGLISH.t("noticeMissingBergamot", ["Japanese (日本語) → Simplified Chinese (简体中文)", "Japanese (日本語) → English"])

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("offline tiers in use", () => {
  it.each<[string, Tier[], Partial<Record<Tier, TranslateResponse>>, string[]]>([
    ["only the dictionary", ["dictionary", "machine"], { dictionary: missing(DICT) }, [DICT_LINE]],
    ["only Bergamot", ["machine"], { machine: missing(BERGAMOT) }, [BERGAMOT_LINE]],
    ["dictionary and Bergamot", ["dictionary", "machine"], { dictionary: missing(DICT), machine: missing(BERGAMOT) }, [DICT_LINE, BERGAMOT_LINE]],
    ["neither: Google and AI fail without missing data", ["machine", "ai"], { machine: { ok: false, error: "HTTP 500" }, ai: { ok: false, error: "NetworkError" } }, []],
  ])("%s", async (_name, tiers, answers, expected) => {
    const m = mount()
    Object.assign(m.answers, answers)
    await m.controller.updateSettings(tieredSettings(tiers))
    await m.controller.start()
    expect(lines()).toEqual(expected)
    if (expected.length === 0) expect(panel()).toBeNull()
    else expect(document.body.firstElementChild).toBe(panel())
  })
})

describe("notice", () => {
  it("appears when the first round of the message is complete, above the message, once per message", async () => {
    const m = mount()
    const manual = manualTranslate()
    const held = new TranslationController({ root: () => document.body, translate: manual.translate, notice: m.notice })
    await held.updateSettings(tieredSettings(["dictionary"]))
    const start = held.start()
    const [first, second] = ["Thank you for the report about the budget.", "See you on Friday at the office."]
    await until(() => expect(manual.translate).toHaveBeenCalledTimes(2))
    manual.answer(first, "dictionary", missing(DICT))
    manual.done(first)
    // One paragraph is still on its way: nothing shows yet.
    await nextTask()
    expect(panel()).toBeNull()
    manual.answer(second, "dictionary", missing(DICT))
    manual.done(second)
    await start
    expect(lines()).toEqual([DICT_LINE])
    expect(document.body.firstElementChild).toBe(panel())
    expect(panel()!.getAttribute("aria-label")).toBe(ENGLISH.t("noticeMissingTitle"))
    expect(panel()!.textContent).toContain(ENGLISH.t("noticeMissingHint"))
    // The paragraphs are failed (only the dictionary is in use) and say so.
    expect(document.querySelectorAll(".tt-error")).toHaveLength(2)

    // Showing the original removes it; translating again, even with another controller, does not bring it back.
    held.stop()
    expect(panel()).toBeNull()
    m.answers.dictionary = missing(DICT)
    await m.controller.updateSettings(tieredSettings(["dictionary"]))
    await m.controller.start()
    expect(panel()).toBeNull()
    expect(m.notice.lastRound).toEqual([DICT])
  })

  it("L4: comes back after a retranslation while it is on screen, and stays away once closed", async () => {
    const m = mount()
    m.answers.dictionary = missing(DICT)
    await m.controller.updateSettings(tieredSettings(["dictionary", "machine"]))
    await m.controller.start()
    expect(lines()).toEqual([DICT_LINE])
    await m.controller.retranslate()
    expect(lines()).toEqual([DICT_LINE])
    expect(document.body.firstElementChild).toBe(panel())
    expect(document.querySelectorAll(".tt-notice")).toHaveLength(1)
    click(ENGLISH.t("noticeClose"))
    await m.controller.retranslate()
    expect(panel()).toBeNull()
    // Show original and translate again: the once-per-message rule holds.
    await m.controller.toggle()
    await m.controller.toggle()
    expect(panel()).toBeNull()
  })

  it("L4: stays away after a retranslation once the data is there", async () => {
    const m = mount()
    m.answers.dictionary = missing(DICT)
    await m.controller.updateSettings(tieredSettings(["dictionary", "machine"]))
    await m.controller.start()
    delete m.answers.dictionary
    await m.controller.retranslate()
    expect(panel()).toBeNull()
    expect(m.notice.lastRound).toEqual([])
  })

  it("merges the reports of a service and pair, and leaves out muted entries", async () => {
    const m = mount(["bergamot:ja>zh-Hans"])
    m.notice.begin()
    m.notice.add({ ...DICT, models: ["ja>en"] })
    m.notice.add({ ...DICT, models: ["en>zh-Hans"] })
    m.notice.add(BERGAMOT)
    m.notice.end()
    expect(lines()).toEqual([DICT_LINE])
    expect(m.notice.lastRound).toEqual([DICT])
    // Reports outside a round are ignored.
    m.notice.add({ ...DICT, pair: "fr>zh-Hans" })
    expect(m.notice.lastRound).toEqual([DICT])
  })

  it("shows nothing when every entry is muted, and does not come back later in the message", async () => {
    const m = mount(["dictionary:ja>zh-Hans"])
    m.notice.begin()
    m.notice.add(DICT)
    m.notice.end()
    expect(panel()).toBeNull()
    m.muted.length = 0
    m.notice.begin()
    m.notice.add(DICT)
    m.notice.end()
    expect(panel()).toBeNull()
    expect(m.notice.lastRound).toEqual([DICT])
  })

  it("opens the settings page with both lists filtered, mutes the listed entries and closes", async () => {
    const m = mount()
    m.notice.begin()
    m.notice.add(DICT)
    m.notice.add(BERGAMOT)
    m.notice.end()
    click(ENGLISH.t("noticeOpenSettings"))
    expect(m.sent).toEqual([{ type: "openOptions", place: { section: "dictionaries", dictionaries: ["ja>en", "en>zh-Hans"], bergamot: ["ja>en"] } }])
    const box = panel()!.querySelector<HTMLInputElement>("input[type=checkbox]")!
    expect(box.closest("label")!.textContent).toBe(ENGLISH.t("noticeMute"))
    box.click()
    box.click()
    expect(m.sent.slice(1)).toEqual([
      { type: "muteOfflinePairs", pairs: ["dictionary:ja>zh-Hans", "bergamot:ja>zh-Hans"], muted: true },
      { type: "muteOfflinePairs", pairs: ["dictionary:ja>zh-Hans", "bergamot:ja>zh-Hans"], muted: false },
    ])
    click(ENGLISH.t("noticeClose"))
    expect(panel()).toBeNull()
  })

  it("opens the offline models when only Bergamot lacks data", () => {
    const m = mount()
    m.notice.begin()
    m.notice.add(BERGAMOT)
    m.notice.end()
    click(ENGLISH.t("noticeOpenSettings"))
    expect(m.sent).toEqual([{ type: "openOptions", place: { section: "bergamot", dictionaries: [], bergamot: ["ja>en"] } }])
  })

  it("is not taken for a paragraph of the message", async () => {
    const m = mount()
    m.answers.dictionary = missing(DICT)
    await m.controller.updateSettings(tieredSettings(["dictionary", "machine"]))
    await m.controller.start()
    expect(panel()).not.toBeNull()
    const translate = vi.fn(answering(() => ok("译文")))
    const again = new TranslationController({ root: () => document.body, translate })
    await again.updateSettings(tieredSettings(["machine"]))
    await again.start()
    expect(translate.mock.calls.map(([req]) => req.text)).toEqual(["Thank you for the report about the budget.", "See you on Friday at the office."])
  })
})
