/**
 * What a consent panel asks: the panel above a message before its text goes to online services (to
 * translate it or to summarize it), the panel under an image before images go to a vision service. The panel in the message names the
 * question; the popup of the message, a page of the extension that the message cannot style or cover, shows it again
 * with the buttons that decide, and the background script records the answer.
 */

import { getI18n, type I18n, type MessageKey } from "./i18n"
import { getPreset, providerDisplayName } from "./providers"
import type { ConsentNeed } from "./settings"

/** What the text of a message is sent for: its paragraphs to be translated, the whole message as context of precise translation, or the whole message with sender, date and subject to be summarized. */
export type TextUse = "paragraphs" | "message" | "summary"

/** The uses in the order a panel names them. */
const TEXT_USES: readonly TextUse[] = ["paragraphs", "message", "summary"]

/** The uses of `a` and `b` together, in the order of a panel. */
export function mergeTextUses(a: readonly TextUse[], b: readonly TextUse[]): TextUse[] {
  return TEXT_USES.filter((use) => a.includes(use) || b.includes(use))
}

export type ConsentQuestion =
  /** One consent per service covers every use of the text of the message that are asked for together. */
  | { kind: "text"; needs: ConsentNeed[]; uses: TextUse[] }
  /** `count`: the images mode "On" sends once allowed; `each`: asked for every message; `glossary`: the glossary of the message goes along. */
  | { kind: "image"; need: ConsentNeed; count: number; each: boolean; glossary: boolean; maxLongEdge: number; format: string }

export type ConsentKind = ConsentQuestion["kind"]

/** A question as the background script keeps it for the popup: `id` changes whenever the question does, so an answer names the question the user saw. */
export type AskedQuestion = ConsentQuestion & { id: number }

/** What a panel says about the data policy of a service; the others handle images by their own privacy policy. */
const POLICY_KEYS: Record<string, MessageKey> = { anthropic: "imageConsentPolicyAnthropic", gemini: "imageConsentPolicyGemini", openai: "imageConsentPolicyOpenai" }

const USE_KEYS: Record<TextUse, MessageKey> = { paragraphs: "consentBody", message: "consentBodyPrecise", summary: "consentBodySummary" }

/** The texts of a question: the title, the lines before and after the services with their hosts, and the label of the button that allows. */
export function consentText(q: ConsentQuestion, i18n: I18n = getI18n()): { title: string; before: string[]; services: string[]; after: string[]; allow: string } {
  const name = (id: string) => {
    const preset = getPreset(id)
    return preset ? providerDisplayName(preset, i18n) : id
  }
  const service = ({ id, host }: ConsentNeed) => (host ? i18n.t("consentService", [name(id), host]) : name(id))
  if (q.kind === "text") {
    // The line of the whole message says what the line of the paragraphs says.
    const uses = q.uses.includes("message") ? q.uses.filter((use) => use !== "paragraphs") : q.uses
    return { title: i18n.t("consentTitle"), before: uses.map((use) => i18n.t(USE_KEYS[use])), services: q.needs.map(service), after: [i18n.t("consentKey")], allow: i18n.t("consentAllow") }
  }
  const auto = q.count > 1
  return {
    title: auto ? i18n.t("imageConsentTitleAuto", [q.count, name(q.need.id)]) : i18n.t("imageConsentTitle", [name(q.need.id)]),
    before: [i18n.t("imageConsentWhat", [q.maxLongEdge, q.format]), ...(q.glossary ? [i18n.t("imageConsentGlossary")] : [])],
    services: [service(q.need)],
    after: [i18n.t(POLICY_KEYS[q.need.id] ?? "imageConsentPolicyOther"), i18n.t(q.each ? "imageConsentEach" : "imageConsentOnce")],
    allow: i18n.t(auto ? "imageConsentAllowAuto" : "imageConsentAllow"),
  }
}
