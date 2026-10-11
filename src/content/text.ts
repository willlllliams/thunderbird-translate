/** Text-level filters used before a paragraph is sent for translation. */

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const LETTER_RE = /\p{L}/gu

export function countLetters(text: string): number {
  return text.match(LETTER_RE)?.length ?? 0
}

/**
 * True if the text carries something to translate: at least two letters
 * after removing URLs and email addresses. Rejects empty strings, numbers,
 * punctuation, symbols, bare links and bare addresses.
 */
export function hasTranslatableText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const stripped = t.replace(URL_RE, " ").replace(EMAIL_RE, " ")
  return countLetters(stripped) >= 2
}

/**
 * Plain-text mails are often hard-wrapped at ~72 columns. Join wrapped lines
 * so the translator sees whole sentences, but keep short lines (addresses,
 * signatures) and list or quote lines on their own.
 */
export function unwrapPlainText(text: string, wrapThreshold = 50): string {
  const lines = text.split("\n")
  let out = lines[0] ?? ""
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1]
    const line = lines[i]
    const startsList = /^\s*(?:[-*•>]|\d+[.)])\s/.test(line)
    const join = prev.trim().length >= wrapThreshold && line.trim().length > 0 && !startsList
    out += join ? ` ${line.trimStart()}` : `\n${line}`
  }
  return out
}
