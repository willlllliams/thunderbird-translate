/** Helpers shared by the popup and the settings page. */

import { ext } from "./ext"
import { getI18n, type I18n } from "./i18n"
import { LANGUAGES } from "./languages"
import type { BackgroundRequest } from "./messages"
import { providerDisplayName, type Tier, tierOf } from "./providers"
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

/** "Not used", then the added services of the tier. */
export function tierOptions(settings: Settings, tier: Tier, i18n: I18n = getI18n()): HTMLOptionElement[] {
  const services = addedProviders(settings).filter((p) => tierOf(p) === tier)
  return [new Option(i18n.t("tierNotUsed"), ""), ...services.map((p) => new Option(providerDisplayName(p, i18n), p.id))]
}

/**
 * Value of a tier select after a change, or undefined when it would leave
 * every tier empty; the select then shows the current value again.
 */
export function tierChoice(select: HTMLSelectElement, tiers: TierSettings, tier: Tier): string | null | undefined {
  const value = select.value || null
  if (tiersValid({ ...tiers, [tier]: value })) return value
  select.value = tiers[tier] ?? ""
  return undefined
}
