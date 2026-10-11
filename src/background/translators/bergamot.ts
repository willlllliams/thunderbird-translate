/**
 * Offline translation with the Bergamot engine (src/offline/bergamot/).
 *
 * The engine takes "auto" or a language code of the extension as source.
 * With "auto" it detects the language of the batch with the browser's
 * detector; when that answer is not reliable, for example on short texts, it
 * uses the fallback given here: the language the script and the English stop
 * words point to, else English.
 */

import { getBergamot } from "../../offline/bergamot"
import { detectLanguage } from "../../shared/lang-detect"

export async function bergamotTranslateBatch(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
  if (sourceLang !== "auto") return getBergamot().translate(texts, sourceLang, targetLang)
  const fallbackSource = (await detectLanguage(texts.join("\n"))) ?? "en"
  return getBergamot().translate(texts, "auto", targetLang, { fallbackSource })
}
