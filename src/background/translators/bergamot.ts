/**
 * Offline translation with the Bergamot engine (src/offline/bergamot/).
 *
 * With source language "auto", the language of every paragraph is detected
 * on its own, with the same thresholds as for the dictionary
 * (detectSourceLanguage(): the browser's detector from 12 letters on and
 * with 60 % of the text, else the script and the English stop words). A
 * paragraph that cannot be placed takes the language found most often in
 * the batch, else English. The paragraphs of each language go to
 * the engine together; a language whose models are missing fails for its
 * paragraphs only. Only the paragraphs whose language was detected report
 * the missing models (for the notice of the content script): for the others
 * the language is a guess.
 */

import { getBergamot } from "../../offline/bergamot"
import { withoutMissing } from "../../shared/errors"
import { detectSourceLanguage, type LanguageDetector } from "../../shared/lang-detect"

/** Language of each text, detected or guessed. */
async function sourceLanguages(texts: string[], detect: LanguageDetector | undefined): Promise<{ lang: string; guessed: boolean }[]> {
  const detected = await Promise.all(texts.map((text) => detectSourceLanguage(text, detect)))
  const counts = new Map<string, number>()
  for (const lang of detected) if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "en"
  return detected.map((lang) => ({ lang: lang ?? common, guessed: !lang }))
}

/** `detect`: the detector of sourceDetector(), for source language "auto". */
export async function bergamotTranslateBatch(texts: string[], sourceLang: string, targetLang: string, detect?: LanguageDetector): Promise<PromiseSettledResult<string>[]> {
  const sources = sourceLang === "auto" ? await sourceLanguages(texts, detect) : texts.map(() => ({ lang: sourceLang, guessed: false }))
  const groups = new Map<string, number[]>()
  sources.forEach(({ lang }, i) => groups.set(lang, [...(groups.get(lang) ?? []), i]))
  const out: PromiseSettledResult<string>[] = []
  await Promise.all(
    [...groups].map(async ([lang, indices]) => {
      try {
        const translated = await getBergamot().translate(indices.map((i) => texts[i]), lang, targetLang)
        indices.forEach((i, k) => (out[i] = { status: "fulfilled", value: translated[k] }))
      } catch (reason) {
        for (const i of indices) out[i] = { status: "rejected", reason: sources[i].guessed ? withoutMissing(reason) : reason }
      }
    }),
  )
  return out
}
