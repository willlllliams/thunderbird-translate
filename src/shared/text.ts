/** Text-level filters used before a paragraph is sent for translation. */

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const LETTER_RE = /\p{L}/gu

/**
 * True if the text carries something to translate: at least two letters
 * after removing URLs and email addresses. Rejects empty strings, numbers,
 * punctuation, symbols, bare links and bare addresses.
 */
export function hasTranslatableText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const stripped = t.replace(URL_RE, " ").replace(EMAIL_RE, " ")
  return (stripped.match(LETTER_RE)?.length ?? 0) >= 2
}

/** Characters a terminal draws two columns wide (East Asian Wide and Fullwidth): CJK, kana, Hangul, fullwidth forms. */
const WIDE_RE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u
/** Chinese and Japanese, which put no space between words; Korean does, so a break in Korean stands for a space. */
const NO_SPACE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303F\uFF00-\uFFEF]/u

/** The columns `text` takes in a terminal: two for a wide character, one for the others. */
const columns = (text: string) => Array.from(text).reduce((n, ch) => n + (WIDE_RE.test(ch) ? 2 : 1), 0)

/**
 * Plain-text mails are often hard-wrapped at ~72 columns, about 36 Chinese or
 * Japanese characters. Join wrapped lines so the translator sees whole
 * sentences, but keep short lines (addresses, signatures) and list or quote
 * lines on their own. Two lines of Chinese or Japanese join without a space.
 */
export function unwrapPlainText(text: string, wrapThreshold = 50): string {
  const lines = text.split("\n")
  let out = lines[0] ?? ""
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1].trimEnd()
    const line = lines[i]
    const next = line.trimStart()
    const startsList = /^\s*(?:[-*•>]|\d+[.)])\s/.test(line)
    const join = columns(prev.trimStart()) >= wrapThreshold && next.length > 0 && !startsList
    if (!join) out += `\n${line}`
    else if (NO_SPACE_RE.test(prev.at(-1) ?? "") && NO_SPACE_RE.test(next[0])) out = `${out.trimEnd()}${next}`
    else out += ` ${next}`
  }
  return out
}
