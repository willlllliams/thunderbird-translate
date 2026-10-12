import { setTitle } from "./dom"
import { getI18n, type I18n, type MessageKey } from "./i18n"

/**
 * Fill data-i18n / data-i18n-placeholder / data-i18n-title / data-i18n-aria-label
 * attributes and set <html lang dir>. A title on a <label> also goes to its
 * control (setTitle()). Safe to call again after a language change.
 */
export function localizeDocument(i18n: I18n = getI18n(), doc: Document = document): void {
  const tr = (key: string | undefined) => i18n.t((key ?? "") as MessageKey)
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    el.textContent = tr(el.dataset.i18n)
  }
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-i18n-placeholder]"))) {
    el.setAttribute("placeholder", tr(el.dataset.i18nPlaceholder))
  }
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-i18n-title]"))) {
    setTitle(el, tr(el.dataset.i18nTitle))
  }
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-i18n-aria-label]"))) {
    el.setAttribute("aria-label", tr(el.dataset.i18nAriaLabel))
  }
  doc.documentElement.lang = i18n.lang
  doc.documentElement.dir = i18n.dir
}
