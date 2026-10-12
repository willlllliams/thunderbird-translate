/**
 * What the offline services need to translate a language pair: the
 * dictionary packs or Bergamot models (pair keys such as "en>zh-Hans") the
 * translation uses, those of them not installed, and whether the pair can
 * be served at all. Pure functions over the catalog (dictionary index,
 * Bergamot model list) and the installed set; the background script uses
 * them for the notice about missing data and for the marks in the tier
 * selectors, the setup guide for its recommendations.
 *
 * Routes, for a pair src → tgt:
 * - dictionary: a pair with English uses the direct pack. Between two other
 *   languages the direct pack is used when the catalog has it (or it is
 *   installed), otherwise src → en and en → tgt.
 * - Bergamot: every model has English on one side, so a pair without
 *   English always runs through src → en and en → tgt.
 * A route with an item the catalog does not offer is unsupported, and so
 * are Simplified ↔ Traditional Chinese and languages the service does not
 * know: there is nothing to download.
 */

import { dictLang, isChinesePair, languageTag, normalizeBergamotLang, pairKey } from "./languages"

export type OfflineService = "dictionary" | "bergamot"

export interface PairNeeds {
  /** Packs or models the translation uses; empty when source and target are the same language. */
  required: string[]
  /** Required items that are not installed; empty when unsupported or when the catalog is unknown. */
  missing: string[]
  /** No route in the catalog: nothing to download. */
  unsupported: boolean
}

/** Pair keys the service offers; null while the catalog is unknown (not read yet, or unreadable). */
export type Catalog = ReadonlySet<string> | null

/** Language of the service for a language code ("zh-CN" → "zh-Hans"); null when the service does not have it. */
export function serviceLang(service: OfflineService, code: string): string | null {
  if (service === "dictionary") return dictLang(code)
  const tag = normalizeBergamotLang(code)
  return tag && tag !== "auto" ? tag : null
}

const UNSUPPORTED: PairNeeds = { required: [], missing: [], unsupported: true }

/** What `service` needs for `source` → `target` (language codes; no "auto"). */
export function pairNeeds(service: OfflineService, source: string, target: string, catalog: Catalog, installed: ReadonlySet<string>): PairNeeds {
  const src = serviceLang(service, source)
  const tgt = serviceLang(service, target)
  if (!src || !tgt || isChinesePair(src, tgt)) return UNSUPPORTED
  if (src === tgt) return { required: [], missing: [], unsupported: false }
  const direct = pairKey(src, tgt)
  const pivot = [pairKey(src, "en"), pairKey("en", tgt)]
  const offered = (id: string) => installed.has(id) || !catalog || catalog.has(id)
  let required = [direct]
  if (src !== "en" && tgt !== "en") {
    // Installed packs through English translate as well as a direct pack: then nothing is to download.
    const pivotInstalled = pivot.every((id) => installed.has(id))
    const useDirect = installed.has(direct) || (service === "dictionary" && !pivotInstalled && catalog?.has(direct) === true)
    required = useDirect ? [direct] : pivot
  }
  if (!required.every(offered)) return UNSUPPORTED
  return { required, missing: catalog ? required.filter((id) => !installed.has(id)) : [], unsupported: false }
}

/** State of the selected offline service for the languages of the settings, for the marks in the tier selectors. */
export interface OfflineState {
  /** Items to download; for automatic detection into English, see `anyInto`. */
  missing: string[]
  unsupported: boolean
  /** Automatic detection into this language (English) and no direction into it is installed: any of them would do. */
  anyInto?: string
}

/**
 * With a fixed source language, what the pair needs. With automatic
 * detection, the direction from English into the target language; into
 * English, at least one direction into English.
 */
export function offlineState(service: OfflineService, source: string, target: string, catalog: Catalog, installed: ReadonlySet<string>): OfflineState {
  if (source !== "auto") return pairNeeds(service, source, target, catalog, installed)
  const tgt = serviceLang(service, target)
  if (tgt !== "en") return pairNeeds(service, "en", target, catalog, installed)
  const into = (id: string) => id.endsWith(">en")
  if (!catalog || [...installed].some(into)) return { missing: [], unsupported: false }
  if (![...catalog].some(into)) return { missing: [], unsupported: true }
  return { missing: [], unsupported: false, anyInto: "en" }
}

/** Whether the state asks for a download. */
export const lacksData = (state: OfflineState) => !state.unsupported && (state.missing.length > 0 || state.anyInto !== undefined)

/* ---------- recommended and common languages ---------- */

/** Where a recommended language comes from, most important first: the target and the fixed source language of the settings, the extension's interface language, Thunderbird's, the system's. */
export const LANGUAGE_SOURCES = ["target", "source", "addon", "thunderbird", "system"] as const
export type LanguageSource = (typeof LANGUAGE_SOURCES)[number]

export interface SourcedLanguage {
  /** languageTag() of the code: "zh-TW" → "zh-Hant", "pt-BR" → "pt". */
  tag: string
  /** Every source that names the language, most important first. */
  sources: LanguageSource[]
}

/** The languages the sources name ("auto" and empty codes left out), each once with all its sources. */
export function recommendedLanguages(codes: Partial<Record<LanguageSource, readonly string[]>>): SourcedLanguage[] {
  const found = new Map<string, LanguageSource[]>()
  for (const source of LANGUAGE_SOURCES) {
    for (const code of codes[source] ?? []) {
      const tag = code && code !== "auto" ? languageTag(code) : ""
      if (tag && !found.get(tag)?.includes(source)) found.set(tag, [...(found.get(tag) ?? []), source])
    }
  }
  return [...found].map(([tag, sources]) => ({ tag, sources }))
}

/** Sources of a direction, most important first. A direction with English is recommended with its other language; a direct pack between two other languages when both are recommended and one is the target language. */
export function itemSources(service: OfflineService, id: string, recommended: readonly SourcedLanguage[]): LanguageSource[] {
  const sides = id.split(">").filter((tag) => tag !== "en")
  const per = sides.map((tag) => recommended.find((l) => serviceLang(service, l.tag) === tag)?.sources ?? [])
  if (per.some((s) => s.length === 0) || (per.length === 2 && !per.some((s) => s.includes("target")))) return []
  const sources = new Set(per.flat())
  return LANGUAGE_SOURCES.filter((s) => sources.has(s))
}

/** Order of a list: the directions of recommended languages first, by their most important source; then by name. */
export function orderItems<T extends { id: string }>(items: readonly T[], sources: (item: T) => readonly LanguageSource[], name: (item: T) => string, locale?: string): T[] {
  const collator = new Intl.Collator(locale)
  const rank = (item: T) => Math.min(LANGUAGE_SOURCES.length, ...sources(item).map((s) => LANGUAGE_SOURCES.indexOf(s)))
  return [...items].sort((a, b) => rank(a) - rank(b) || collator.compare(name(a), name(b)))
}

/** Languages that "Download common languages" downloads in both directions, to and from English. */
export const COMMON_LANGUAGES = ["zh-Hans", "es", "fr", "de", "ja", "pt", "ru", "ko"] as const

/** The directions of the common languages that the catalog has. */
export function commonDirections(catalog: Iterable<string>): string[] {
  const offered = new Set(catalog)
  return COMMON_LANGUAGES.flatMap((x) => [pairKey(x, "en"), pairKey("en", x)]).filter((id) => offered.has(id))
}
