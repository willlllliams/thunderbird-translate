/**
 * Source language for "auto": browser.i18n.detectLanguage (CLD) on a sample
 * of the texts. Short samples and unreliable answers fall back to the
 * language the caller supplied.
 */

import { normalizeBergamotLang } from "./languages"

export interface DetectionResult {
  isReliable: boolean
  languages: Array<{ language: string; percentage: number }>
}
export type LanguageDetector = (text: string) => Promise<DetectionResult>

/** Letters needed before the detector is asked (punctuation, digits and spaces do not count). */
export const MIN_DETECT_LETTERS = 12
/** Share of the text the top language must cover. */
export const MIN_DETECT_PERCENTAGE = 60
const SAMPLE_CHARS = 4000

/** CLD code → Remote Settings tag; undefined for "und" and empty answers. */
export function mapDetectedLanguage(code: string | undefined): string | undefined {
  if (!code || code === "und" || code === "unknown") return undefined
  return normalizeBergamotLang(code)
}

function letterCount(text: string): number {
  return text.replace(/[\s\p{N}\p{P}\p{S}]/gu, "").length
}

/**
 * Detected language, or `fallback` when the sample is short, the answer is
 * unreliable or the detector is missing or fails. `fallback` is returned
 * normalized; the result is undefined only when there is no fallback.
 */
export async function detectSourceLanguage(texts: readonly string[], detector: LanguageDetector | undefined, fallback?: string): Promise<string | undefined> {
  const fb = fallback && normalizeBergamotLang(fallback) !== "auto" ? normalizeBergamotLang(fallback) || undefined : undefined
  const sample = texts.join("\n").slice(0, SAMPLE_CHARS)
  if (!detector || letterCount(sample) < MIN_DETECT_LETTERS) return fb
  try {
    const result = await detector(sample)
    const top = result?.languages?.[0]
    const lang = mapDetectedLanguage(top?.language)
    if (!result.isReliable || !lang || (top?.percentage ?? 0) < MIN_DETECT_PERCENTAGE) return fb
    return lang
  } catch {
    return fb
  }
}

/** browser.i18n.detectLanguage when the API exists. */
export function browserDetector(): LanguageDetector | undefined {
  const api = (globalThis as { browser?: { i18n?: { detectLanguage?: (t: string) => Promise<DetectionResult> } } }).browser?.i18n
  const detect = api?.detectLanguage
  return detect ? (text) => detect.call(api, text) : undefined
}
