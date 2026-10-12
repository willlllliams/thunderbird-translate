/**
 * Target languages offered in the UI, with the code each backend expects.
 *
 * - `code`: our own identifier, stored in settings (BCP-47 style).
 * - `google`: code for translate.googleapis.com (`tl` parameter).
 * - `microsoft`: code for the Microsoft translator (`to` parameter).
 * - `deepl`: code for DeepL / DeepLX (`target_lang`).
 * - `english`: English name used inside LLM prompts.
 * - `native`: name shown in the UI.
 */
export interface LanguageInfo {
  code: string
  google: string
  microsoft: string
  deepl: string
  english: string
  native: string
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "zh-CN", google: "zh-CN", microsoft: "zh-Hans", deepl: "ZH", english: "Simplified Chinese", native: "简体中文" },
  { code: "zh-TW", google: "zh-TW", microsoft: "zh-Hant", deepl: "ZH-HANT", english: "Traditional Chinese", native: "繁體中文" },
  { code: "en", google: "en", microsoft: "en", deepl: "EN", english: "English", native: "English" },
  { code: "ja", google: "ja", microsoft: "ja", deepl: "JA", english: "Japanese", native: "日本語" },
  { code: "ko", google: "ko", microsoft: "ko", deepl: "KO", english: "Korean", native: "한국어" },
  { code: "fr", google: "fr", microsoft: "fr", deepl: "FR", english: "French", native: "Français" },
  { code: "de", google: "de", microsoft: "de", deepl: "DE", english: "German", native: "Deutsch" },
  { code: "es", google: "es", microsoft: "es", deepl: "ES", english: "Spanish", native: "Español" },
  { code: "pt", google: "pt", microsoft: "pt", deepl: "PT", english: "Portuguese", native: "Português" },
  { code: "it", google: "it", microsoft: "it", deepl: "IT", english: "Italian", native: "Italiano" },
  { code: "ru", google: "ru", microsoft: "ru", deepl: "RU", english: "Russian", native: "Русский" },
  { code: "uk", google: "uk", microsoft: "uk", deepl: "UK", english: "Ukrainian", native: "Українська" },
  { code: "pl", google: "pl", microsoft: "pl", deepl: "PL", english: "Polish", native: "Polski" },
  { code: "nl", google: "nl", microsoft: "nl", deepl: "NL", english: "Dutch", native: "Nederlands" },
  { code: "tr", google: "tr", microsoft: "tr", deepl: "TR", english: "Turkish", native: "Türkçe" },
  { code: "vi", google: "vi", microsoft: "vi", deepl: "VI", english: "Vietnamese", native: "Tiếng Việt" },
  { code: "th", google: "th", microsoft: "th", deepl: "TH", english: "Thai", native: "ไทย" },
  { code: "id", google: "id", microsoft: "id", deepl: "ID", english: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ar", google: "ar", microsoft: "ar", deepl: "AR", english: "Arabic", native: "العربية" },
  { code: "hi", google: "hi", microsoft: "hi", deepl: "HI", english: "Hindi", native: "हिन्दी" },
]

export function getLanguage(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]
}

/** Primary subtag in lower case: "zh-CN" -> "zh". */
export function baseLang(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0]
}

/**
 * Language of a code, with Chinese told apart by script: "zh", "zh-CN",
 * "zh-SG" → "zh-Hans"; "zh-TW", "zh-HK", "zh-MO", "zh-Hant" → "zh-Hant";
 * any other code → its primary subtag ("pt-BR" → "pt").
 */
export function languageTag(code: string): string {
  const [base, ...rest] = code.trim().toLowerCase().split(/[-_]/)
  if (base !== "zh") return base
  return rest.some((p) => p === "hant" || p === "tw" || p === "hk" || p === "mo") ? "zh-Hant" : "zh-Hans"
}

/** Simplified and Traditional Chinese, in either direction: the dictionary and the offline models cannot convert between them. */
export function isChinesePair(src: string, tgt: string): boolean {
  return baseLang(src) === "zh" && baseLang(tgt) === "zh" && languageTag(src) !== languageTag(tgt)
}

/** Code of LANGUAGES for a language tag: "zh-Hans" → "zh-CN", "zh-Hant" → "zh-TW". */
export function appLang(tag: string): string {
  if (tag === "zh-Hans") return "zh-CN"
  return tag === "zh-Hant" ? "zh-TW" : tag
}

/** Key of a translation direction, e.g. "en>zh-Hans", for dictionary packs and offline models. */
export function pairKey(src: string, tgt: string): string {
  return `${src}>${tgt}`
}

/** Language codes of the dictionary packs. */
const DICT_LANGS = ["en", "zh-Hans", "zh-Hant", "ja", "ko", "fr", "de", "es", "pt", "ru", "tr", "vi"]

/** Pack language of a language code of the extension ("zh-CN") or of a detector ("zh", "zh-TW", "pt-BR"); null when no pack has it. */
export function dictLang(code: string): string | null {
  const tag = languageTag(code)
  return DICT_LANGS.includes(tag) ? tag : null
}

/**
 * Old and alternative codes and the tag of the Bergamot models in Mozilla
 * Remote Settings. Models exist only between English and another language,
 * so a pair without English (ja → zh-Hans) runs through two models: ja → en,
 * then en → zh-Hans (see shared/offline-needs.ts).
 */
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
