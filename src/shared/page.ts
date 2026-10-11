/** Helpers shared by the popup, the settings page and the welcome page. */

import { describeError, firstLine } from "./errors"
import { ext } from "./ext"
import { getI18n, type I18n, t } from "./i18n"
import { thunderbirdUiLanguage } from "./i18n-ext"
import { LANGUAGES } from "./languages"
import { LOCALE_NATIVE_NAMES, localeToLanguageTag, matchUiLocale, SUPPORTED_LOCALES } from "./locales"
import type { BackgroundRequest, OfflineStatus, OptionsPlace } from "./messages"
import { lacksData, type OfflineService } from "./offline-needs"
import { getPreset, PROVIDER_PRESETS, providerDisplayName, type Tier, TIER_NAME_KEYS, TIERS, tierOf } from "./providers"
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

/** Value of the last entry of a tier selector, "+ Add translation service…": it opens the service list instead of choosing. */
export const ADD_SERVICE = "+add"

/** "Not used", then the added services of the tier and "+ Add translation service…"; with `all`, every service of the tier. */
export function tierOptions(settings: Settings, tier: Tier, i18n: I18n = getI18n(), all = false): HTMLOptionElement[] {
  const services = (all ? PROVIDER_PRESETS : addedProviders(settings)).filter((p) => tierOf(p) === tier)
  const options = [new Option(i18n.t("tierNotUsed"), ""), ...services.map((p) => new Option(providerDisplayName(p, i18n), p.id))]
  return all ? options : [...options, new Option(i18n.t("tierAddService"), ADD_SERVICE)]
}

/** The offline service a tier uses, if any. */
export function offlineServiceOf(id: string | null): OfflineService | undefined {
  const kind = id ? getPreset(id)?.kind : undefined
  return kind === "dictionary" || kind === "bergamot" ? kind : undefined
}

/** Short name of an offline service: "Dictionary", "Bergamot". */
const offlineName = (service: OfflineService) => (service === "dictionary" ? t("tierDictionary") : "Bergamot")

/**
 * The tier selectors of a page ("tier-<tier>" with label "tierLabel-<tier>"); with `all`, every service of each tier.
 * A selected offline service that lacks data for the languages (`offline`) is marked in words and in red.
 */
export function fillTierSelects(settings: Settings, all = false, offline: OfflineStatus = {}): void {
  TIERS.forEach((tier, i) => {
    $(`tierLabel-${tier}`).textContent = t("tierLabel", [i + 1, t(TIER_NAME_KEYS[tier])])
    const select = $<HTMLSelectElement>(`tier-${tier}`)
    const options = tierOptions(settings, tier, getI18n(), all)
    const service = offlineServiceOf(settings.tiers[tier])
    const state = service && offline[service]
    const marked = Boolean(state && lacksData(state))
    if (marked) {
      const option = options.find((o) => o.value === settings.tiers[tier])!
      option.text = t("tierModelMissing", [offlineName(service!)])
      option.className = "missing"
    }
    fillSelect(select, options, settings.tiers[tier] ?? "")
    select.classList.toggle("missing", marked)
  })
}

/**
 * The line under the tier selectors about the selected offline services:
 * what they lack for the languages, with a link to the downloads, or that
 * they do not support the language pair. Hidden when there is nothing to say.
 */
export function showOfflineHint(el: HTMLElement, settings: Settings, offline: OfflineStatus, download: (place: OptionsPlace) => void): void {
  const services = TIERS.map((tier) => offlineServiceOf(settings.tiers[tier])).filter((s): s is OfflineService => s !== undefined && offline[s] !== undefined)
  const lacking = services.filter((s) => lacksData(offline[s]!))
  const lines = services.flatMap((s) => {
    const state = offline[s]!
    if (state.unsupported) return [t("offlineUnsupported", [offlineName(s)])]
    if (state.anyInto) return [t("offlineMissingAnyInto", [offlineName(s), getI18n().tagName(state.anyInto)])]
    return state.missing.length > 0 ? [t("offlineMissing", [offlineName(s), state.missing.map((m) => getI18n().pairName(m)).join(", ")])] : []
  })
  el.hidden = lines.length === 0
  el.classList.toggle("missing", lacking.length > 0)
  el.replaceChildren(lines.join(" "))
  if (lacking.length === 0) return
  /** Filter terms of a list: the missing items, or every direction into the language. */
  const terms = (s: OfflineService) => (offline[s] && lacksData(offline[s]) ? (offline[s].anyInto ? [`>${offline[s].anyInto}`] : offline[s].missing) : undefined)
  const link = document.createElement("a")
  link.href = "#"
  link.textContent = t("offlineDownload")
  link.addEventListener("click", (e) => {
    e.preventDefault()
    download({ section: lacking[0] === "dictionary" ? "dictionaries" : "bergamot", dictionaries: terms("dictionary"), bergamot: terms("bergamot") })
  })
  el.append(" ", link)
}

/** Ask the background script what the selected offline services lack for the languages of the settings; nothing when it cannot tell. */
export async function offlineStatus(settings: Settings): Promise<OfflineStatus> {
  if (!TIERS.some((tier) => offlineServiceOf(settings.tiers[tier]))) return {}
  const status = await send<OfflineStatus | undefined>({ type: "offlineStatus", sourceLang: settings.sourceLang, targetLang: settings.targetLang, tiers: settings.tiers }).catch(() => undefined)
  return status ?? {}
}

/**
 * Follow the tier selectors. A choice that would leave every tier empty is
 * refused: the select shows the current value again and the "tiersEmpty"
 * note appears. "+ Add translation service…" runs `add` and the select
 * shows the current value again.
 */
export function onTierChange(tiers: () => TierSettings, apply: (tier: Tier, value: string | null) => void, add?: (tier: Tier) => void): void {
  for (const tier of TIERS) {
    const select = $<HTMLSelectElement>(`tier-${tier}`)
    select.addEventListener("change", () => {
      if (select.value === ADD_SERVICE) {
        select.value = tiers()[tier] ?? ""
        return add?.(tier)
      }
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
