import { setTitle } from "./dom"
import { getI18n, type I18n, type MessageKey } from "./i18n"

/** A link in the text of a message: what it shows, the same in every language, and where it leads. */
export interface MessageLink {
  name: string
  href: string
}

/** Messages whose substitutions `$1`, `$2`… are links, in that order. */
export const MESSAGE_LINKS: Partial<Record<MessageKey, readonly MessageLink[]>> = {
  dictionaryAttribution: [
    { name: "CC BY-SA 4.0", href: "https://creativecommons.org/licenses/by-sa/4.0/" },
    { name: "MIT", href: "https://github.com/skywind3000/ECDICT/blob/master/LICENSE" },
  ],
}

/** Marks a substitution in the text of a message; no message contains the character. */
const MARK = "\u0000"

/**
 * The text of message `key` as DOM nodes, its substitutions replaced by
 * `links`: text nodes and <a> elements built one by one, so the text of a
 * message never becomes markup.
 */
export function linkedText(key: MessageKey, links: readonly MessageLink[], i18n: I18n = getI18n(), doc: Document = document): Node[] {
  const text = i18n.t(key, links.map((_, i) => `${MARK}${i}${MARK}`))
  return text
    .split(new RegExp(`${MARK}(\\d+)${MARK}`))
    .map((part, i) => {
      if (i % 2 === 0) return part ? doc.createTextNode(part) : null
      const { name, href } = links[Number(part)]
      const link = doc.createElement("a")
      link.href = href
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      link.textContent = name
      link.title = i18n.t("tipLicenseText")
      return link
    })
    .filter((node): node is Text | HTMLAnchorElement => node !== null)
}

/**
 * Fill data-i18n / data-i18n-placeholder / data-i18n-title / data-i18n-aria-label
 * attributes and set <html lang dir>. A title on a <label> also goes to its
 * control (setTitle()). A message of MESSAGE_LINKS gets its links. Safe to
 * call again after a language change.
 */
export function localizeDocument(i18n: I18n = getI18n(), doc: Document = document): void {
  const tr = (key: string | undefined) => i18n.t((key ?? "") as MessageKey)
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    const key = (el.dataset.i18n ?? "") as MessageKey
    const links = Object.hasOwn(MESSAGE_LINKS, key) ? MESSAGE_LINKS[key] : undefined
    if (links) el.replaceChildren(...linkedText(key, links, i18n, doc))
    else el.textContent = tr(key)
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
