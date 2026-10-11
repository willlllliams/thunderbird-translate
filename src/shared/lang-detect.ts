/**
 * Decide whether a paragraph is already in the target language.
 *
 * Step 1 counts characters per writing system. Non-Latin scripts identify
 * the language (or a small set of candidates) directly: kana means Japanese,
 * Hangul means Korean, Han without kana means Chinese. Chinese text is told
 * apart as Simplified or Traditional by characters that exist in one form
 * only (们/們, 这/這…).
 * Step 2, for Latin and Cyrillic text, asks the browser's language detector
 * (i18n.detectLanguage, CLD) when available. Without a reliable answer, a
 * source language chosen by the user decides; otherwise a stop-word ratio
 * recognises English.
 *
 * detectSourceLanguage() uses the same steps to name the language of a text,
 * for the services that need a source language (dictionary, offline models),
 * with the detector of sourceDetector().
 */

import { baseLang, languageTag } from "./languages"

type ScriptGroup = "han" | "kana" | "hangul" | "cyrillic" | "arabic" | "hebrew" | "thai" | "greek" | "devanagari" | "latin"

const SCRIPT_TESTS: [ScriptGroup, RegExp][] = [
  ["kana", /[぀-ヿㇰ-ㇿ]/u],
  ["han", /\p{Script=Han}/u],
  ["hangul", /\p{Script=Hangul}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["hebrew", /\p{Script=Hebrew}/u],
  ["thai", /\p{Script=Thai}/u],
  ["greek", /\p{Script=Greek}/u],
  ["devanagari", /\p{Script=Devanagari}/u],
  ["latin", /\p{Script=Latin}/u],
]

function scriptCounts(text: string): Map<ScriptGroup, number> {
  const counts = new Map<ScriptGroup, number>()
  for (const ch of text) {
    for (const [group, re] of SCRIPT_TESTS) {
      if (re.test(ch)) {
        counts.set(group, (counts.get(group) ?? 0) + 1)
        break
      }
    }
  }
  return counts
}

/** Languages a text may be in, judged by its dominant script. */
export function candidateLanguages(text: string): string[] {
  const counts = scriptCounts(text)
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return []
  const share = (g: ScriptGroup) => (counts.get(g) ?? 0) / total
  const cjk = share("han") + share("kana")
  if (share("kana") > 0.05 && cjk >= 0.3) return ["ja"]
  if (share("hangul") >= 0.3) return ["ko"]
  if (share("han") >= 0.3) return ["zh"]
  let best: ScriptGroup = "latin"
  for (const [g, n] of counts) if (n > (counts.get(best) ?? 0)) best = g
  switch (best) {
    case "cyrillic":
      return ["ru", "uk", "bg", "sr"]
    case "arabic":
      return ["ar", "fa", "ur"]
    case "hebrew":
      return ["he"]
    case "thai":
      return ["th"]
    case "greek":
      return ["el"]
    case "devanagari":
      return ["hi", "mr", "ne"]
    default:
      return ["latin"]
  }
}

/**
 * Frequent characters written differently in Simplified and Traditional
 * Chinese, position by position. Characters that both standards use (后, 里,
 * 系, 只…) are left out.
 */
export const SIMPLIFIED_ONLY = "们这说为发会国对时个来过还进动现经问题开关长门见东车书学写读请谢认识让给无实从应该样点电话号业务产处办网络邮报际间买卖钱银计设达运难爱头体气万与将当总结决议论场区级联"
export const TRADITIONAL_ONLY = "們這說為發會國對時個來過還進動現經問題開關長門見東車書學寫讀請謝認識讓給無實從應該樣點電話號業務產處辦網絡郵報際間買賣錢銀計設達運難愛頭體氣萬與將當總結決議論場區級聯"

/** "zh-Hans" or "zh-Hant" when the characters of one standard outnumber the other's; null when the text has none of them. */
function chineseScript(text: string): "zh-Hans" | "zh-Hant" | null {
  let hans = 0
  let hant = 0
  for (const ch of text) {
    if (SIMPLIFIED_ONLY.includes(ch)) hans++
    else if (TRADITIONAL_ONLY.includes(ch)) hant++
  }
  if (hans === hant) return null
  return hans > hant ? "zh-Hans" : "zh-Hant"
}

const EN_STOPWORDS = new Set(
  "the a an and or but of to in on at for with from by is are was were be been it this that these those you your we our i me my he she they them his her their not no do does did have has had will would can could should please thanks thank regards hi hello dear as if so about".split(
    " ",
  ),
)

export function englishScore(text: string): number {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? []
  if (words.length === 0) return 0
  return words.filter((w) => EN_STOPWORDS.has(w)).length / words.length
}

/** Returns the detected language (primary subtag) or null when unsure. */
export type LanguageDetector = (text: string) => Promise<string | null>

/**
 * Whether a paragraph is already in the target language. `sourceLang` is the
 * user's choice ("auto" or a code): paragraphs the detectors cannot place are
 * taken to be in that language. For a Chinese target, the paragraph must also
 * be written in the target's standard; text without characters that tell the
 * two apart reads the same in both.
 */
export async function isInTargetLanguage(text: string, targetLang: string, detect?: LanguageDetector, sourceLang = "auto"): Promise<boolean> {
  const target = baseLang(targetLang)
  const candidates = candidateLanguages(text)
  if (candidates.length === 0) return false
  if (candidates[0] !== "latin") {
    if (!candidates.includes(target)) return false
    if (target === "zh") return (chineseScript(text) ?? languageTag(targetLang)) === languageTag(targetLang)
    if (candidates.length === 1) return true
  } else if (["zh", "ja", "ko", "ru", "uk", "ar", "he", "th", "el", "hi"].includes(target)) {
    // Target uses a non-Latin script, text is Latin.
    return false
  }
  if (detect) {
    try {
      const detected = await detect(text)
      if (detected) return baseLang(detected) === target
    } catch {
      // fall through to the heuristic
    }
  }
  if (sourceLang !== "auto") return baseLang(sourceLang) === target
  if (target === "en") return englishScore(text) >= 0.12
  // Non-Latin candidates without a detector: the script already matched.
  return candidates[0] !== "latin"
}

const letterCount = (text: string) => text.replace(/[\s\p{N}\p{P}\p{S}]/gu, "").length

/**
 * Thresholds for naming the source language of a paragraph: the detector is
 * asked from 12 letters on, and its answer counts when it covers 60 % of the
 * text. Below that its answers are guesses.
 */
const MIN_DETECT_LETTERS = 12
const MIN_DETECT_PERCENTAGE = 60

/**
 * Source language of a paragraph for the dictionary and the offline models,
 * as the detector of sourceDetector() names it ("en", "zh", "zh-TW"…), or
 * null when neither the script, the detector nor the English stop words tell.
 */
export async function detectSourceLanguage(text: string, detect?: LanguageDetector): Promise<string | null> {
  const candidates = candidateLanguages(text)
  if (candidates.length === 0) return null
  if (detect && letterCount(text) >= MIN_DETECT_LETTERS) {
    try {
      const detected = await detect(text)
      // The detector also tells Chinese variants apart.
      if (detected && (candidates[0] === "latin" || candidates.includes(baseLang(detected)))) return detected
    } catch {
      // fall through to the script
    }
  }
  if (candidates[0] === "zh") return chineseScript(text) === "zh-Hant" ? "zh-TW" : "zh"
  if (candidates[0] !== "latin") return candidates.length === 1 ? candidates[0] : null
  return englishScore(text) >= 0.12 ? "en" : null
}

/** The browser's detector with the thresholds of detectSourceLanguage(). */
export function sourceDetector(i18n: BrowserI18n | undefined): LanguageDetector | undefined {
  return browserDetector(i18n, MIN_DETECT_PERCENTAGE)
}

type BrowserI18n = { detectLanguage?: (t: string) => Promise<{ isReliable: boolean; languages: { language: string; percentage: number }[] }> }

/** Wrap browser.i18n.detectLanguage, accepting only reliable answers whose top language covers at least `minPercentage` of the text. */
export function browserDetector(i18n: BrowserI18n | undefined, minPercentage = 0): LanguageDetector | undefined {
  if (!i18n?.detectLanguage) return undefined
  return async (text) => {
    const r = await i18n.detectLanguage!(text)
    const top = r?.languages?.[0]
    if (!r?.isReliable || !top || top.language === "und" || top.percentage < minPercentage) return null
    return top.language
  }
}
