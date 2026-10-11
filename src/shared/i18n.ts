/**
 * The extension's own i18n runtime.
 *
 * browser.i18n.getMessage() is bound to Thunderbird's UI language and cannot
 * switch at run time, so the popup, the settings page, the content script and
 * the background use this instead. Messages come from the extension's own
 * `_locales/<locale>/messages.json` (generated from locales/*.json at build
 * time); English is bundled and serves as the fallback for missing keys.
 */

import enSource from "../../locales/en.json"
import { DEFAULT_LOCALE, localeToLanguageTag, resolveUiLocale, textDirection, type UiLocale } from "./locales"

export type MessageKey = keyof typeof enSource
/** key → template; `$1`…`$9` are substitutions, `$$` is a literal dollar sign. */
export type MessageTable = Partial<Record<string, string>>
export type Substitution = string | number

export const EN_MESSAGES: MessageTable = enSource

export function formatMessage(template: string, subs: readonly string[] = []): string {
  return template.replace(/\$(\$|[1-9])/g, (_, g: string) => (g === "$" ? "$" : (subs[Number(g) - 1] ?? "")))
}

/**
 * Convert a WebExtension messages.json object (named placeholders such as
 * `$COUNT$` with `{ "count": { "content": "$1" } }`) into key → template.
 */
export function compileMessagesJson(json: unknown): MessageTable {
  const out: MessageTable = {}
  if (!json || typeof json !== "object") return out
  for (const [key, entry] of Object.entries(json as Record<string, unknown>)) {
    const e = entry as { message?: unknown; placeholders?: Record<string, { content?: unknown }> } | null
    if (typeof e?.message !== "string") continue
    const named = new Map<string, string>()
    for (const [name, ph] of Object.entries(e.placeholders ?? {})) {
      if (typeof ph?.content === "string") named.set(name.toLowerCase(), ph.content)
    }
    out[key] = e.message.replace(/\$\$|\$([A-Za-z0-9_@]+)\$/g, (m: string, name?: string) =>
      name === undefined ? m : (named.get(name.toLowerCase()) ?? m),
    )
  }
  return out
}

/** Codes that Intl.DisplayNames names better with a script subtag. */
const DISPLAY_CODES: Record<string, string> = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" }

export class I18n {
  /** BCP 47 tag, e.g. "zh-CN". */
  readonly lang: string
  readonly dir: "ltr" | "rtl"
  private numberFormat: Intl.NumberFormat | null = null
  private displayNames: Intl.DisplayNames | null | undefined

  constructor(
    readonly locale: UiLocale,
    readonly messages: MessageTable,
  ) {
    this.lang = localeToLanguageTag(locale)
    this.dir = textDirection(this.lang)
  }

  /** Message for `key`; falls back to English, then to the key itself. Numbers are formatted for the locale. */
  t(key: MessageKey, subs?: Substitution | readonly Substitution[]): string {
    const template = this.messages[key] || EN_MESSAGES[key]
    if (!template) return key
    const list: readonly Substitution[] = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs as Substitution]
    return formatMessage(
      template,
      list.map((s) => (typeof s === "number" ? this.number(s) : s)),
    )
  }

  private number(n: number): string {
    try {
      this.numberFormat ??= new Intl.NumberFormat(this.lang)
      return this.numberFormat.format(n)
    } catch {
      return String(n)
    }
  }

  /**
   * Name of a language in the interface language, followed by its own name:
   * "Japanese (日本語)". Only the native name when both are the same.
   */
  languageName(code: string, native: string): string {
    if (this.displayNames === undefined) {
      try {
        this.displayNames = new Intl.DisplayNames([this.lang, "en"], { type: "language" })
      } catch {
        this.displayNames = null
      }
    }
    let local: string | undefined
    try {
      local = this.displayNames?.of(DISPLAY_CODES[code] ?? code)
    } catch {
      local = undefined
    }
    if (!local || local === code) return native
    local = local.charAt(0).toLocaleUpperCase(this.lang) + local.slice(1)
    if (local.toLocaleLowerCase(this.lang) === native.toLocaleLowerCase(this.lang)) return native
    return this.t("languageNameFormat", [local, native])
  }
}

export const ENGLISH = new I18n(DEFAULT_LOCALE, EN_MESSAGES)

/** Returns the raw messages.json object of a locale. */
export type FetchMessages = (locale: UiLocale) => Promise<unknown>

/**
 * Resolve the interface-language setting ("auto" or a locale) against
 * Thunderbird's UI language and load that locale's messages. Any failure
 * yields English.
 */
export async function loadI18n(setting: unknown, uiLanguage: string | null | undefined, fetchMessages: FetchMessages): Promise<I18n> {
  const locale = resolveUiLocale(setting, uiLanguage)
  if (locale === DEFAULT_LOCALE) return ENGLISH
  try {
    const messages = compileMessagesJson(await fetchMessages(locale))
    if (Object.keys(messages).length > 0) return new I18n(locale, messages)
  } catch {
    // Missing or unreadable file: English below.
  }
  return ENGLISH
}

/* ---------- the instance used by the current page or script ---------- */

let current: I18n = ENGLISH

export function getI18n(): I18n {
  return current
}

export function setI18n(i18n: I18n): void {
  current = i18n
}

export function t(key: MessageKey, subs?: Substitution | readonly Substitution[]): string {
  return current.t(key, subs)
}
