/**
 * Text preparation around the engine, following Firefox's translations
 * worker: leading and trailing whitespace is kept outside the engine, soft
 * hyphens are removed, and for Chinese, Japanese and Korean a space is put
 * between full-width sentence punctuation and an opening quote so the
 * sentence splitter keeps the quote with its sentence. Empty and
 * whitespace-only texts never reach the engine (they break it).
 */

import { normalizeBergamotLang } from "./languages"

const WHITESPACE = /^(\s*)(.*?)(\s*)$/s
const FULL_WIDTH_QUOTE = /([。！？])“/g
const FULL_WIDTH_LANGUAGES = new Set(["ja", "ko", "zh"])

export interface PreparedTexts {
  /** Cleaned non-empty texts to send to the engine. */
  inputs: string[]
  /** Put the engine output back together with the skipped texts and the outer whitespace. */
  rebuild(outputs: readonly string[]): string[]
}

export function prepareTexts(texts: readonly string[], sourceLang: string): PreparedTexts {
  const base = normalizeBergamotLang(sourceLang).split("-")[0] ?? ""
  const inputs: string[] = []
  const slots: Array<{ index: number; before: string; after: string } | null> = []
  for (const text of texts) {
    const m = WHITESPACE.exec(text)
    let core = m?.[2] ?? ""
    core = core.replaceAll("\u00AD", "")
    if (FULL_WIDTH_LANGUAGES.has(base)) core = core.replace(FULL_WIDTH_QUOTE, "$1 “")
    if (!core.trim()) {
      slots.push(null)
      continue
    }
    slots.push({ index: inputs.length, before: m?.[1] ?? "", after: m?.[3] ?? "" })
    inputs.push(core)
  }
  return {
    inputs,
    rebuild(outputs) {
      return texts.map((text, i) => {
        const slot = slots[i]
        return slot ? slot.before + (outputs[slot.index] ?? "") + slot.after : text
      })
    },
  }
}
