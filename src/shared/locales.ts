/**
 * Interface languages of the extension and how a browser/Thunderbird language
 * tag maps onto them. Pure data and functions, no WebExtension APIs.
 *
 * Locale codes use the `_locales` directory spelling (zh_CN, pt_BR).
 */

export const SUPPORTED_LOCALES = ["en", "zh_CN", "zh_TW", "ja", "ko", "fr", "de", "es", "pt_BR", "ru", "tr", "vi"] as const

export type UiLocale = (typeof SUPPORTED_LOCALES)[number]

/** Stored value of the "Interface language" setting. */
export type UiLanguageSetting = "auto" | UiLocale

export const DEFAULT_LOCALE: UiLocale = "en"

/** Each language's name for itself; shown in the interface-language picker. Not translated. */
export const LOCALE_NATIVE_NAMES: Record<UiLocale, string> = {
  en: "English",
  zh_CN: "简体中文",
  zh_TW: "繁體中文",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  pt_BR: "Português (Brasil)",
  ru: "Русский",
  tr: "Türkçe",
  vi: "Tiếng Việt",
}

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "yi", "dv", "ug", "ckb"])

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function normalizeUiLanguageSetting(value: unknown): UiLanguageSetting {
  return isUiLocale(value) ? value : "auto"
}

/**
 * Closest supported locale for a language tag such as the result of
 * i18n.getUILanguage(): "zh-TW"/"zh-HK"/"zh-Hant-*" → zh_TW, other "zh-*" →
 * zh_CN, "pt-*" → pt_BR, otherwise the primary subtag; unknown → en.
 */
export function matchUiLocale(tag: string | null | undefined): UiLocale {
  const parts = String(tag ?? "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase()
    .split("-")
    .filter(Boolean)
  const base = parts[0]
  if (!base) return DEFAULT_LOCALE
  if (base === "zh") {
    return parts.some((p) => p === "tw" || p === "hk" || p === "mo" || p === "hant") ? "zh_TW" : "zh_CN"
  }
  if (base === "pt") return "pt_BR"
  const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === base)
  return exact ?? DEFAULT_LOCALE
}

/** Locale actually used for a setting value, given Thunderbird's UI language. */
export function resolveUiLocale(setting: unknown, uiLanguage: string | null | undefined): UiLocale {
  return isUiLocale(setting) ? setting : matchUiLocale(uiLanguage)
}

/** BCP 47 tag for a locale: zh_CN → zh-CN. Used for <html lang> and Intl. */
export function localeToLanguageTag(locale: UiLocale): string {
  return locale.replace("_", "-")
}

export function textDirection(tag: string): "ltr" | "rtl" {
  const base = tag.toLowerCase().split(/[-_]/)[0]
  return RTL_LANGUAGES.has(base) ? "rtl" : "ltr"
}
