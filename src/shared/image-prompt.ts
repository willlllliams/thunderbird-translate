/**
 * The prompts of an image request (background/images.ts). The system
 * prompt is the image prompt of the settings (the built-in one in
 * shared/prompts.ts unless the user wrote their own), then the rules of the
 * output format the settings choose: a table of original and translation, a
 * list of translations, a short summary or both, and what to do with an
 * image without text. Keeping these rules out of the editable prompt means a
 * change of the output format never loses the user's own prompt. The user
 * message holds the image and one line, with the glossary of precise
 * translation when there is one. Pure text: the settings page estimates the
 * tokens of the prompt from it.
 */

import type { ImageSettings } from "./settings"

/** A term of the glossary of precise translation and its translation. */
export interface GlossaryEntry {
  source: string
  target: string
}

/** The answer of the model for an image without text worth translating, when the settings skip such images. */
export const NO_TEXT = "NO_TEXT"

/** The header of the table the model writes; the content script shows it in the interface language. */
export const TABLE_HEADER = ["Original", "Translation"] as const

/** The longest answer of the "summary" output, whatever the settings allow: two sentences need no more. */
export const SUMMARY_MAX_TOKENS = 200

const TABLE_RULE = `Give a table with the header row "| ${TABLE_HEADER[0]} | ${TABLE_HEADER[1]} |" and one row per label, line or cell. For a TEXT image that is a table, give its cells as rows "| original cell | translated cell |" in reading order.`
const LIST_RULE = "Give a list with one translated label, line or cell per item, in reading order."
const SUMMARY = "one or two sentences in {{to}} on what the image contains; for a CHART name its title and what the axes and series measure, without any values or trends."

/** The rules the settings add after the image prompt. */
export function outputRules({ output, noText, showSource }: Pick<ImageSettings, "output" | "noText" | "showSource">): string[] {
  const pairs = showSource ? TABLE_RULE : LIST_RULE
  const rules = output === "summary" ? [`Give ${SUMMARY}`] : output === "both" ? [`Start with one line "**Summary:** " followed by ${SUMMARY}`, `Then, after a blank line: ${pairs}`] : [pairs]
  rules.push(noText === "skip" ? `For an OTHER image answer exactly ${NO_TEXT} and nothing else.` : "For an OTHER image give one sentence in {{to}}, at most 20 words, on what it shows.")
  return rules
}

/** The system prompt: the image prompt, then the rules of the output format, in the target language. */
export function buildImageSystem(template: string, targetLanguage: string, settings: Pick<ImageSettings, "output" | "noText" | "showSource">): string {
  return `${template.trim()}\n\nOutput format (follow exactly):\n${outputRules(settings).map((rule) => `- ${rule}`).join("\n")}`.replaceAll("{{to}}", targetLanguage)
}

/** The text beside the image: its place in the message, the target language, and the glossary of precise translation. */
export function buildImageUserText(index: number, targetLanguage: string, glossary: readonly GlossaryEntry[] = []): string {
  const line = `Image ${index} of the email. Target language: ${targetLanguage}.`
  if (glossary.length === 0) return line
  return `${line}\nGlossary, use these translations:\n${glossary.map((g) => `- ${g.source} → ${g.target}`).join("\n")}`
}

/** The longest answer of a request: the setting, at most SUMMARY_MAX_TOKENS for the "summary" output. */
export function imageOutputTokens({ output, maxOutputTokens }: Pick<ImageSettings, "output" | "maxOutputTokens">): number {
  return output === "summary" ? Math.min(maxOutputTokens, SUMMARY_MAX_TOKENS) : maxOutputTokens
}

/** Characters per token of English text, for the estimate of the settings page. */
const CHARS_PER_TOKEN = 4

/** About how many tokens the prompts of one image take: the system prompt and the user text, without a glossary. */
export function imagePromptTokens(template: string, targetLanguage: string, settings: Pick<ImageSettings, "output" | "noText" | "showSource">): number {
  return Math.round((buildImageSystem(template, targetLanguage, settings).length + buildImageUserText(1, targetLanguage).length) / CHARS_PER_TOKEN)
}
