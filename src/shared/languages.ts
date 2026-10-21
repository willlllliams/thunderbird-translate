/**
 * Target languages offered in the UI, with the code each backend expects.
 *
 * - `code`: our own identifier, stored in settings (BCP-47 style).
 * - `google`: code for translate.googleapis.com (`tl` parameter).
 * - `microsoft`: code for the Microsoft translator (`to` parameter).
 * - `deepl`: code for DeepLX (`target_lang`), and the source code of DeepL without its variant.
 * - `deeplTarget`: target code of DeepL, which names the Chinese scripts (English and Portuguese take the variant of the settings).
 * - `baidu`, `youdao`, `caiyun`: codes of Baidu, Youdao and Caiyun; null where the service does not translate the
 *   language. `baiduPremiumOnly`: only the premium edition of Baidu translates it.
 * - `english`: English name used inside LLM prompts.
 * - `native`: name shown in the UI.
 */
export interface LanguageInfo {
  code: string
  google: string
  microsoft: string
  deepl: string
  deeplTarget: string
  baidu: string | null
  baiduPremiumOnly?: true
  youdao: string
  caiyun: string | null
  english: string
  native: string
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "zh-CN", google: "zh-CN", microsoft: "zh-Hans", deepl: "ZH", deeplTarget: "ZH-HANS", baidu: "zh", youdao: "zh-CHS", caiyun: "zh", english: "Simplified Chinese", native: "简体中文" },
  { code: "zh-TW", google: "zh-TW", microsoft: "zh-Hant", deepl: "ZH-HANT", deeplTarget: "ZH-HANT", baidu: "cht", youdao: "zh-CHT", caiyun: "zh-Hant", english: "Traditional Chinese", native: "繁體中文" },
  { code: "en", google: "en", microsoft: "en", deepl: "EN", deeplTarget: "EN", baidu: "en", youdao: "en", caiyun: "en", english: "English", native: "English" },
  { code: "ja", google: "ja", microsoft: "ja", deepl: "JA", deeplTarget: "JA", baidu: "jp", youdao: "ja", caiyun: "ja", english: "Japanese", native: "日本語" },
  { code: "ko", google: "ko", microsoft: "ko", deepl: "KO", deeplTarget: "KO", baidu: "kor", youdao: "ko", caiyun: "ko", english: "Korean", native: "한국어" },
  { code: "fr", google: "fr", microsoft: "fr", deepl: "FR", deeplTarget: "FR", baidu: "fra", youdao: "fr", caiyun: "fr", english: "French", native: "Français" },
  { code: "de", google: "de", microsoft: "de", deepl: "DE", deeplTarget: "DE", baidu: "de", youdao: "de", caiyun: "de", english: "German", native: "Deutsch" },
  { code: "es", google: "es", microsoft: "es", deepl: "ES", deeplTarget: "ES", baidu: "spa", youdao: "es", caiyun: "es", english: "Spanish", native: "Español" },
  { code: "pt", google: "pt", microsoft: "pt", deepl: "PT", deeplTarget: "PT", baidu: "pt", youdao: "pt", caiyun: "pt", english: "Portuguese", native: "Português" },
  { code: "it", google: "it", microsoft: "it", deepl: "IT", deeplTarget: "IT", baidu: "it", youdao: "it", caiyun: "it", english: "Italian", native: "Italiano" },
  { code: "ru", google: "ru", microsoft: "ru", deepl: "RU", deeplTarget: "RU", baidu: "ru", youdao: "ru", caiyun: "ru", english: "Russian", native: "Русский" },
  { code: "uk", google: "uk", microsoft: "uk", deepl: "UK", deeplTarget: "UK", baidu: "ukr", baiduPremiumOnly: true, youdao: "uk", caiyun: null, english: "Ukrainian", native: "Українська" },
  { code: "pl", google: "pl", microsoft: "pl", deepl: "PL", deeplTarget: "PL", baidu: "pl", youdao: "pl", caiyun: null, english: "Polish", native: "Polski" },
  { code: "nl", google: "nl", microsoft: "nl", deepl: "NL", deeplTarget: "NL", baidu: "nl", youdao: "nl", caiyun: null, english: "Dutch", native: "Nederlands" },
  { code: "tr", google: "tr", microsoft: "tr", deepl: "TR", deeplTarget: "TR", baidu: "tr", baiduPremiumOnly: true, youdao: "tr", caiyun: "tr", english: "Turkish", native: "Türkçe" },
  { code: "vi", google: "vi", microsoft: "vi", deepl: "VI", deeplTarget: "VI", baidu: "vie", youdao: "vi", caiyun: "vi", english: "Vietnamese", native: "Tiếng Việt" },
  { code: "th", google: "th", microsoft: "th", deepl: "TH", deeplTarget: "TH", baidu: "th", youdao: "th", caiyun: null, english: "Thai", native: "ไทย" },
  { code: "id", google: "id", microsoft: "id", deepl: "ID", deeplTarget: "ID", baidu: "id", baiduPremiumOnly: true, youdao: "id", caiyun: null, english: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ar", google: "ar", microsoft: "ar", deepl: "AR", deeplTarget: "AR", baidu: "ara", youdao: "ar", caiyun: null, english: "Arabic", native: "العربية" },
  { code: "hi", google: "hi", microsoft: "hi", deepl: "HI", deeplTarget: "HI", baidu: "hi", baiduPremiumOnly: true, youdao: "hi", caiyun: null, english: "Hindi", native: "हिन्दी" },
]

/** The language of `code`; undefined for a code the extension does not offer. */
export function findLanguage(code: string): LanguageInfo | undefined {
  return LANGUAGES.find((l) => l.code === code)
}

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
