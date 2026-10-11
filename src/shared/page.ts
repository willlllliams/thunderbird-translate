/** Helpers shared by the popup, the settings page and the welcome page. */

import { describeError, firstLine } from "./errors"
import { ext } from "./ext"
import { getI18n, type I18n, t } from "./i18n"
import { thunderbirdUiLanguage } from "./i18n-ext"
import { LANGUAGES } from "./languages"
import { LOCALE_NATIVE_NAMES, localeToLanguageTag, matchUiLocale, SUPPORTED_LOCALES } from "./locales"
import type { BackgroundRequest } from "./messages"
import { PROVIDER_PRESETS, providerDisplayName, type Tier, TIER_NAME_KEYS, TIERS, tierOf } from "./providers"
import { addedProviders, type Settings, type TierSettings, tiersValid } from "./settings"

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export function send<T>(req: BackgroundRequest): Promise<T> {
  return ext.runtime.sendMessage(req) as Promise<T>
}

/** Replace a select's options, keeping the selected value. */
export function fillSelect(select: HTMLSelectElement, options: HTMLOptionElement[], value: string): void {
  select.replaceChildren(...options)
  select.value = value
}

/** The target languages, named in the interface language. */
export function languageOptions(i18n: I18n = getI18n()): HTMLOptionElement[] {
  return LANGUAGES.map((l) => new Option(i18n.languageName(l.code, l.native), l.code))
}

/** "Detect automatically", then the languages. */
export function sourceLanguageOptions(i18n: I18n = getI18n()): HTMLOptionElement[] {
  return [new Option(i18n.t("sourceLangAuto"), "auto"), ...languageOptions(i18n)]
}

/** "Follow Thunderbird (<language>)", then every interface language in its own name. */
export function uiLanguageOptions(i18n: I18n = getI18n()): HTMLOptionElement[] {
  const follow = new Option(i18n.t("uiLanguageAuto", [LOCALE_NATIVE_NAMES[matchUiLocale(thunderbirdUiLanguage())]]), "auto")
  const locales = SUPPORTED_LOCALES.map((l) => {
    const o = new Option(LOCALE_NATIVE_NAMES[l], l)
    o.lang = localeToLanguageTag(l)
    return o
  })
  return [follow, ...locales]
}

/** "Not used", then the added services of the tier; with `all`, every service of the tier. */
export function tierOptions(settings: Settings, tier: Tier, i18n: I18n = getI18n(), all = false): HTMLOptionElement[] {
  const services = (all ? PROVIDER_PRESETS : addedProviders(settings)).filter((p) => tierOf(p) === tier)
  return [new Option(i18n.t("tierNotUsed"), ""), ...services.map((p) => new Option(providerDisplayName(p, i18n), p.id))]
}

/** The tier selectors of a page ("tier-<tier>" with label "tierLabel-<tier>"); with `all`, every service of each tier. */
export function fillTierSelects(settings: Settings, all = false): void {
  TIERS.forEach((tier, i) => {
    $(`tierLabel-${tier}`).textContent = t("tierLabel", [i + 1, t(TIER_NAME_KEYS[tier])])
    fillSelect($<HTMLSelectElement>(`tier-${tier}`), tierOptions(settings, tier, getI18n(), all), settings.tiers[tier] ?? "")
  })
}

/**
 * Follow the tier selectors. A choice that would leave every tier empty is
 * refused: the select shows the current value again and the "tiersEmpty"
 * note appears.
 */
export function onTierChange(tiers: () => TierSettings, apply: (tier: Tier, value: string | null) => void): void {
  for (const tier of TIERS) {
    const select = $<HTMLSelectElement>(`tier-${tier}`)
    select.addEventListener("change", () => {
      const value = select.value || null
      const valid = tiersValid({ ...tiers(), [tier]: value })
      $("tiersEmpty").hidden = valid
      if (valid) apply(tier, value)
      else select.value = tiers()[tier] ?? ""
    })
  }
}

/** Flash the "Saved" note of a settings page. */
export function showSaved(): void {
  const saved = $("saved")
  saved.textContent = t("saved")
  saved.title = ""
  saved.classList.remove("error")
  saved.classList.add("show")
  setTimeout(() => saved.classList.contains("error") || saved.classList.remove("show"), 1200)
}

/** Show in place of the "Saved" note that saving failed, until a save succeeds. */
export function showSaveError(error: unknown): void {
  const saved = $("saved")
  const description = describeError(error, getI18n())
  saved.textContent = t("errSaveFailed", [firstLine(description)])
  saved.title = description
  saved.classList.add("show", "error")
}
