/**
 * Language tags as used by the Bergamot models in Mozilla Remote Settings.
 *
 * Models exist only between English and another language, so a pair without
 * English (ja → zh-Hans) runs through two models: ja → en, then en → zh-Hans.
 */

import { LocalizedError } from "../../shared/errors"
import { isChinesePair, languageTag } from "../../shared/languages"

/** The language every model has on one side. */
const PIVOT = "en"

/** Direction pair [source, target]. */
export type LanguagePair = [string, string]

/** Old and alternative codes and the tag of the models. */
const ALIASES: Record<string, string> = { iw: "he", no: "nb", in: "id", fil: "tl", ji: "yi" }

/**
 * Remote Settings tag for an application or detector code: languageTag()
 * (zh-CN → zh-Hans, zh-TW → zh-Hant, pt-BR → pt), then iw → he, no → nb,
 * in → id, fil → tl, ji → yi. "auto" stays "auto"; an empty string stays empty.
 */
export function normalizeBergamotLang(code: string): string {
  const tag = languageTag(code)
  return ALIASES[tag] ?? tag
}

/**
 * Model pairs needed to translate `src` → `tgt` (codes are normalized first):
 * none when both are the same language, one when either side is English,
 * otherwise two through English. Simplified and Traditional Chinese are
 * refused: through English their words would come back as glosses.
 */
export function requiredPairs(src: string, tgt: string): LanguagePair[] {
  const s = normalizeBergamotLang(src)
  const t = normalizeBergamotLang(tgt)
  if (!s || !t || s === "auto" || t === "auto") throw new RangeError(`requiredPairs needs two concrete languages, got "${src}" and "${tgt}"`)
  if (s === t) return []
  if (isChinesePair(s, t)) throw new LocalizedError("errChineseVariants")
  if (s === PIVOT || t === PIVOT) return [[s, t]]
  return [
    [s, PIVOT],
    [PIVOT, t],
  ]
}
