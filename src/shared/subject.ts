/**
 * Subjects of messages as the extension translates them: the reply and
 * forward prefixes stay as they are, and only the rest is translated. "Re:
 * Budget" and "Budget" therefore share one translation, in the message, on
 * the page of translated subjects and in the cache.
 */

import { isInTargetLanguage, type LanguageDetector } from "./lang-detect"
import { hasTranslatableText } from "./text"

/**
 * Reply and forward prefixes of common mail programs, followed by a colon (ASCII or full width) and
 * optionally a counter such as "Re[2]:": English, German (AW, WG), Scandinavian (SV, VS, VB), Dutch (Antw, Doorst),
 * Italian (Rif, R, I), French (TR), Spanish (RV), Portuguese (Res, Enc), Polish (Odp, PD), Turkish (YNT, İLT),
 * Chinese, Japanese and Korean.
 */
const PREFIX =
  /^(?:\s*(?:re|fwd?|aw|wg|sv|vs|vb|antw|doorst|rif|r|i|tr|rv|res|enc|odp|pd|ynt|ilt|İlt|回复|回覆|答复|答覆|转发|轉發|转寄|轉寄|返信|転送|답장|전달)\s*(?:\[\d+\]|\(\d+\))?\s*[:：]\s*)+/iu

/** A subject split into its reply and forward prefixes and the text to translate. */
export interface SubjectParts {
  /** The prefixes as written, with the space after them; empty when there are none. */
  prefix: string
  /** The rest of the subject, trimmed. */
  text: string
}

export function splitSubject(subject: string): SubjectParts {
  const match = PREFIX.exec(subject)
  const prefix = match?.[0] ?? ""
  return { prefix, text: subject.slice(prefix.length).trim() }
}

/** The parts of `subject` to translate; null when it has nothing to translate or is in the target language already. */
export async function subjectToTranslate(subject: string, s: { targetLang: string; sourceLang: string }, detect?: LanguageDetector): Promise<SubjectParts | null> {
  const parts = splitSubject(subject)
  if (!hasTranslatableText(parts.text)) return null
  return (await isInTargetLanguage(parts.text, s.targetLang, detect, s.sourceLang)) ? null : parts
}
