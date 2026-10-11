import { t } from "./ext"

/** Fill data-i18n / data-i18n-placeholder / data-i18n-title attributes from _locales. */
export function localizeDocument(root: ParentNode = document): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    el.textContent = t(el.dataset.i18n!)
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]"))) {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder!))
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n-title]"))) {
    el.title = t(el.dataset.i18nTitle!)
  }
  document.documentElement.lang = t("@@ui_locale").replace("_", "-") || "en"
}
