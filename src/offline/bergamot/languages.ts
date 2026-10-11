/**
 * Language tags as used by the Bergamot models in Mozilla Remote Settings.
 *
 * Models exist only between English and another language, so a pair without
 * English (ja → zh-Hans) runs through two models: ja → en, then en → zh-Hans.
 */

/** The language every model has on one side. */
export const PIVOT = "en"

/** Direction pair [source, target]. */
export type LanguagePair = [string, string]

/**
 * Remote Settings tag for an application or detector code:
 * zh, zh-CN, zh-SG → zh-Hans; zh-TW, zh-HK, zh-MO → zh-Hant; iw → he;
 * no → nb; in → id; fil → tl; other tags keep their primary subtag (pt-BR → pt).
 * "auto" stays "auto"; an empty string stays empty.
 */
export function normalizeBergamotLang(code: string): string {
  const tag = code.trim().replace(/_/g, "-")
  if (!tag) return ""
  const parts = tag.toLowerCase().split("-")
  const base = parts[0]
  if (base === "auto") return "auto"
  if (base === "zh") {
    const traditional = parts.slice(1).some((p) => p === "hant" || p === "tw" || p === "hk" || p === "mo")
    return traditional ? "zh-Hant" : "zh-Hans"
  }
  const ALIASES: Record<string, string> = { iw: "he", no: "nb", in: "id", fil: "tl", ji: "yi" }
  return ALIASES[base] ?? base
}

/** Storage and engine key of a direction pair, e.g. "en>zh-Hans". */
export function pairKey(src: string, tgt: string): string {
  return `${src}>${tgt}`
}

/**
 * Model pairs needed to translate `src` → `tgt` (codes are normalized first):
 * none when both are the same language, one when either side is English,
 * otherwise two through English.
 */
export function requiredPairs(src: string, tgt: string): LanguagePair[] {
  const s = normalizeBergamotLang(src)
  const t = normalizeBergamotLang(tgt)
  if (!s || !t || s === "auto" || t === "auto") throw new RangeError(`requiredPairs needs two concrete languages, got "${src}" and "${tgt}"`)
  if (s === t) return []
  if (s === PIVOT || t === PIVOT) return [[s, t]]
  return [
    [s, PIVOT],
    [PIVOT, t],
  ]
}
