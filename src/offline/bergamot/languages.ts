/**
 * Language tags as used by the Bergamot models in Mozilla Remote Settings.
 *
 * Models exist only between English and another language, so a pair without
 * English (ja → zh-Hans) runs through two models: ja → en, then en → zh-Hans
 * (see shared/offline-needs.ts).
 */

import { languageTag } from "../../shared/languages"

/** Old and alternative codes and the tag of the models. */
const ALIASES: Record<string, string> = { iw: "he", no: "nb", in: "id", fil: "tl", ji: "yi" }

/**
 * Remote Settings tag for an application or detector code: languageTag()
 * (zh-CN → zh-Hans, zh-TW → zh-Hant, pt-BR → pt), then iw → he, no → nb,
 * in → id, fil → tl, ji → yi. "auto" stays "auto"; an empty string stays empty.
 */
export function normalizeBergamotLang(code: string): string {
  const tag = languageTag(code)
  return ALIASES[tag] ?? tag
}
