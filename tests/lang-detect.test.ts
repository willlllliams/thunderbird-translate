/** Script-based language guesses, the target-language check before translation, and the browser detector wrapper. */
import { describe, expect, it } from "vitest"
import { browserDetector, candidateLanguages, detectLanguage, isInTargetLanguage, type LanguageDetector } from "../src/shared/lang-detect"
import { createMailContext } from "../src/shared/mail-context"

const says = (lang: string | null): LanguageDetector => async () => lang
const broken: LanguageDetector = async () => {
  throw new Error("detector unavailable")
}

describe("candidateLanguages", () => {
  it.each<[string, string[]]>([
    ["Привет, как дела?", ["ru", "uk", "bg", "sr"]],
    ["مرحبا بالعالم", ["ar", "fa", "ur"]],
    ["שלום עולם", ["he"]],
    ["สวัสดีครับ", ["th"]],
    ["Καλημέρα σας", ["el"]],
    ["नमस्ते दुनिया", ["hi", "mr", "ne"]],
    ["12345 !?", []],
    ["Hello Привет мир друзья", ["ru", "uk", "bg", "sr"]],
  ])("%s → %j", (text, expected) => {
    expect(candidateLanguages(text)).toEqual(expected)
  })
})

describe("isInTargetLanguage", () => {
  it.each<[string, string, string, LanguageDetector | undefined, string, boolean]>([
    ["no letters", "12:30 — 14:00", "en", undefined, "auto", false],
    ["Cyrillic text, Latin target", "Привет, как дела?", "en", undefined, "auto", false],
    ["Cyrillic text, Russian target, no detector", "Привет, как дела?", "ru", undefined, "auto", true],
    ["Cyrillic text, detector says Ukrainian", "Привіт, як справи?", "ru", says("uk"), "auto", false],
    ["Cyrillic text, detector says Russian", "Привет, как дела?", "ru", says("ru"), "auto", true],
    ["Greek text, Greek target", "Καλημέρα σας", "el", undefined, "auto", true],
    ["Latin text, Korean target", "Good morning", "ko", undefined, "auto", false],
    ["detector fails, English stop words decide", "Thank you for the report, it is very useful", "en", broken, "auto", true],
    ["detector unsure, Latin text, non-English target", "Bonjour à tous", "fr", says(null), "auto", false],
    ["detector unsure, chosen source equals target", "Bonjour à tous", "fr", says(null), "fr-CA", true],
    ["detector unsure, chosen source differs", "Thank you for the report", "en", says(null), "de", false],
    ["detector variant against the base target", "Hola a todos", "es", says("es-419"), "auto", true],
  ])("%s", async (_name, text, target, detect, source, expected) => {
    expect(await isInTargetLanguage(text, target, detect, source)).toBe(expected)
  })
})

describe("detectLanguage", () => {
  it.each<[string, string, LanguageDetector | undefined, string | null]>([
    ["no letters", "1234", says("en"), null],
    ["Chinese variant from the detector", "這是一段繁體中文", says("zh-TW"), "zh-TW"],
    ["detector answer that contradicts the script", "这是一段中文", says("ja"), "zh"],
    ["detector fails, single-candidate script", "これは日本語です", broken, "ja"],
    ["several candidates, no detector", "Привет, как дела?", undefined, null],
    ["Latin text, detector answer taken", "Bonjour à tous", says("fr"), "fr"],
    ["Latin text, English stop words", "Thank you for the report, it is very useful", undefined, "en"],
    ["Latin text, unknown language", "Bonjour à tous", says(null), null],
  ])("%s", async (_name, text, detect, expected) => {
    expect(await detectLanguage(text, detect)).toBe(expected)
  })
})

describe("browserDetector", () => {
  type Answer = { isReliable: boolean; languages: { language: string; percentage: number }[] }
  const detector = (answer: Answer) => browserDetector({ detectLanguage: async () => answer })!

  it("is missing without the i18n API or its detectLanguage", () => {
    expect(browserDetector(undefined)).toBeUndefined()
    expect(browserDetector({})).toBeUndefined()
  })

  it.each<[string, Answer, string | null]>([
    ["reliable", { isReliable: true, languages: [{ language: "de", percentage: 97 }] }, "de"],
    ["unreliable", { isReliable: false, languages: [{ language: "de", percentage: 40 }] }, null],
    ["undetermined", { isReliable: true, languages: [{ language: "und", percentage: 100 }] }, null],
    ["without languages", { isReliable: true, languages: [] }, null],
  ])("takes only a reliable answer: %s", async (_name, answer, expected) => {
    expect(await detector(answer)("text")).toBe(expected)
  })
})

describe("createMailContext", () => {
  it("joins the paragraphs and identifies the message by its full text", () => {
    const a = createMailContext(["Hello", "Bye"], [0, 1])
    expect(a.text).toBe("Hello\n\nBye")
    expect(createMailContext(["Hello", "Bye"], [1]).id).toBe(a.id)
    expect(createMailContext(["Hello", "Bye!"], [0, 1]).id).not.toBe(a.id)
  })

  it("cuts a long message and says so, while the id still covers the whole text", () => {
    const long = "x".repeat(20001)
    const ctx = createMailContext([long], [0])
    expect(ctx.text).toBe(`${"x".repeat(20000)}\n[… truncated, the message continues]`)
    expect(createMailContext([`${long}y`], [0]).id).not.toBe(ctx.id)
  })
})

describe("Simplified and Traditional Chinese", () => {
  const SIMPLIFIED = "我们这个月的报告已经发给你了，请查收。"
  const TRADITIONAL = "我們這個月的報告已經發給你了，請查收。"

  it.each<[string, string, string, boolean]>([
    ["Simplified text, Traditional target", SIMPLIFIED, "zh-TW", false],
    ["Traditional text, Simplified target", TRADITIONAL, "zh-CN", false],
    ["Simplified text, Simplified target", SIMPLIFIED, "zh-CN", true],
    ["Traditional text, Traditional target", TRADITIONAL, "zh-TW", true],
    ["only characters both standards share", "你好，我明天下午有空。", "zh-TW", true],
  ])("%s", async (_name, text, target, expected) => {
    expect(await isInTargetLanguage(text, target)).toBe(expected)
    // The script decides even when the browser's detector only says "zh".
    expect(await isInTargetLanguage(text, target, says("zh"))).toBe(expected)
  })

  it("names Traditional text zh-TW for the services that need a source language", async () => {
    expect(await detectLanguage(TRADITIONAL)).toBe("zh-TW")
    expect(await detectLanguage(SIMPLIFIED)).toBe("zh")
  })

  it("uses tables of distinct characters of the same length", async () => {
    const { SIMPLIFIED_ONLY, TRADITIONAL_ONLY } = await import("../src/shared/lang-detect")
    const [hans, hant] = [[...SIMPLIFIED_ONLY], [...TRADITIONAL_ONLY]]
    expect(hans).toHaveLength(hant.length)
    expect(hans.filter((ch) => hant.includes(ch))).toEqual([])
    expect(new Set(hans).size + new Set(hant).size).toBe(hans.length * 2)
  })
})

describe("detector thresholds of the offline tier", () => {
  it("asks the detector only from minLetters letters on", async () => {
    let asked = 0
    const detect: LanguageDetector = async () => (asked++, "de")
    expect(await detectLanguage("Danke!", detect, { minLetters: 12 })).toBeNull()
    expect(asked).toBe(0)
    expect(await detectLanguage("Vielen Dank für die Antwort", detect, { minLetters: 12 })).toBe("de")
    expect(asked).toBe(1)
  })

  it("accepts a browser answer only when it covers minPercentage of the text", async () => {
    const i18n = (percentage: number) => ({ detectLanguage: async () => ({ isReliable: true, languages: [{ language: "fr", percentage }] }) })
    expect(await browserDetector(i18n(40), 60)!("Bonjour à tous")).toBeNull()
    expect(await browserDetector(i18n(80), 60)!("Bonjour à tous")).toBe("fr")
    expect(await browserDetector(i18n(40))!("Bonjour à tous")).toBe("fr")
  })
})
