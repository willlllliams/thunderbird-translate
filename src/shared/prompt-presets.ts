/**
 * Library of ready-made additions to the three prompts: regional variety,
 * difficult words kept in the original, short explanations of difficult
 * words, and writing style. A preset is a block of English rules appended
 * to a prompt, after a blank line and under its own heading:
 *
 *   <prompt>
 *
 *   Style (this rule takes precedence over the rules above):
 *   - Use a formal business register: …
 *
 * Applying a preset again, with the same or another option, replaces its
 * block, so the blocks of different presets add up and one preset never
 * appears twice. The first entry of the list, "Plain" (NO_PRESET), removes
 * every preset block and keeps what the user wrote. Every block keeps one translation per paragraph, so the
 * batch format (JSON array, numbered segments) stays the same.
 */

import type { MessageKey } from "./i18n"

type PresetId = "dialect" | "keepTerms" | "explainTerms" | "style"

export interface PresetOption {
  id: string
  nameKey: MessageKey
  /** Target languages (codes of LANGUAGES) the option suits; absent = every target language. */
  targets?: string[]
  /** English rule that takes the place of `{{option}}`. */
  rule: string
  /** Source text and expected translation; absent = the localized example of the option. */
  example?: [string, string]
  /** Localized expected translation of PRESET_EXAMPLE_SOURCE, when `example` is absent. */
  exampleKey?: MessageKey
}

export interface PromptPreset {
  id: PresetId
  nameKey: MessageKey
  hintKey: MessageKey
  /** First line of the block; finds the block again when the preset is applied once more. */
  heading: string
  /** English rules, one per line; `{{option}}` is the rule of the chosen option, `{{to}}` the target language. */
  rules: string
  options?: PresetOption[]
  /** Localized expected translation of PRESET_EXAMPLE_SOURCE, for presets without options. */
  exampleKey?: MessageKey
}

/** Source sentence of the localized examples. */
export const PRESET_EXAMPLE_SOURCE = "We will finish the due diligence before we sign the term sheet."

const PRECEDENCE = "(this rule takes precedence over the rules above)"

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "dialect",
    nameKey: "presetDialect",
    hintKey: "presetDialectHint",
    heading: `Regional variety ${PRECEDENCE}:`,
    rules: "- {{option}}",
    options: [
      {
        id: "yue-HK",
        nameKey: "presetDialectYueHK",
        targets: ["zh-CN", "zh-TW"],
        rule: "Write in written Cantonese as used in Hong Kong, in Traditional Chinese characters, with Cantonese words and particles (係, 唔, 嘅, 咗, 喺) instead of Standard Written Chinese.",
        example: ["Could you check the software settings on your phone before Friday?", "你可唔可以喺星期五之前用手機檢查吓個軟件設定？"],
      },
      {
        id: "zh-TW",
        nameKey: "presetDialectZhTW",
        targets: ["zh-TW"],
        rule: "Use Traditional Chinese as written in Taiwan, with the vocabulary and usage of Taiwan (軟體, 網路, 資訊, 影片) instead of mainland terms.",
        example: ["Could you check the software settings on your phone before Friday?", "你可以在星期五前用手機檢查一下軟體設定嗎？"],
      },
      {
        id: "sichuan",
        nameKey: "presetDialectSichuan",
        targets: ["zh-CN"],
        rule: "Write in Sichuanese (Sichuan dialect) in Simplified Chinese characters, with its typical words and particles (啥子, 莫得, 要得, 巴适), and keep the text easy to read.",
        example: ["Could you check the software settings on your phone before Friday?", "你星期五之前拿手机把软件设置看一哈，要得不？"],
      },
      {
        id: "en-GB",
        nameKey: "presetDialectEnGB",
        targets: ["en"],
        rule: "Use British English spelling, vocabulary and conventions (colour, organise, mobile phone, flat; dates as 31 March 2026).",
        example: ["Kannst du vor Freitag die Softwareeinstellungen auf deinem Handy prüfen?", "Could you check the software settings on your mobile before Friday?"],
      },
      {
        id: "en-US",
        nameKey: "presetDialectEnUS",
        targets: ["en"],
        rule: "Use American English spelling, vocabulary and conventions (color, organize, cell phone, apartment; dates as March 31, 2026).",
        example: ["Kannst du vor Freitag die Softwareeinstellungen auf deinem Handy prüfen?", "Could you check the software settings on your cell phone before Friday?"],
      },
      {
        id: "pt-BR",
        nameKey: "presetDialectPtBR",
        targets: ["pt"],
        rule: "Use Brazilian Portuguese: Brazilian spelling and vocabulary (celular, ônibus, tela) and \"você\" as the usual form of address.",
        example: ["Could you check the software settings on your phone before Friday?", "Você pode verificar as configurações do software no celular antes de sexta?"],
      },
      {
        id: "pt-PT",
        nameKey: "presetDialectPtPT",
        targets: ["pt"],
        rule: "Use European Portuguese: European spelling and vocabulary (telemóvel, autocarro, ecrã), \"tu\" or \"o senhor\"/\"a senhora\" as forms of address, and \"estar a\" + infinitive instead of the gerund.",
        example: ["Could you check the software settings on your phone before Friday?", "Pode verificar as definições do software no telemóvel antes de sexta-feira?"],
      },
      {
        id: "es-MX",
        nameKey: "presetDialectEsMX",
        targets: ["es"],
        rule: "Use Mexican Spanish: Mexican vocabulary (celular, computadora, carro) and \"ustedes\" for the plural you, never \"vosotros\".",
        example: ["Could you check the software settings on your phone before Friday?", "¿Puedes revisar la configuración del software en tu celular antes del viernes?"],
      },
      {
        id: "es-ES",
        nameKey: "presetDialectEsES",
        targets: ["es"],
        rule: "Use the Spanish of Spain: peninsular vocabulary (móvil, ordenador, coche) and \"vosotros\" for the informal plural you.",
        example: ["Could you check the software settings on your phone before Friday?", "¿Puedes revisar la configuración del software en tu móvil antes del viernes?"],
      },
      {
        id: "fr-CA",
        nameKey: "presetDialectFrCA",
        targets: ["fr"],
        rule: "Use Canadian French as written in Quebec, with Quebec vocabulary (courriel, cellulaire, fin de semaine, magasiner).",
        example: ["Could you check the software settings on your phone before Friday?", "Peux-tu vérifier les paramètres du logiciel sur ton cellulaire avant vendredi?"],
      },
      {
        id: "de-CH",
        nameKey: "presetDialectDeCH",
        targets: ["de"],
        rule: "Use Swiss Standard German: write \"ss\" instead of \"ß\" and use Swiss vocabulary (Natel, Velo, parkieren).",
        example: ["Could you check the software settings on your phone before Friday?", "Könntest du bis Freitag die Softwareeinstellungen auf deinem Natel überprüfen? Das wäre grossartig."],
      },
    ],
  },
  {
    id: "keepTerms",
    nameKey: "presetKeepTerms",
    hintKey: "presetKeepTermsHint",
    heading: `Difficult words ${PRECEDENCE}:`,
    rules: [
      "- Translate normally. After the translation of each difficult word, technical term or abbreviation, add the original term in parentheses, for example \"尽职调查（due diligence）\" in Chinese or \"Due-Diligence-Prüfung (due diligence)\" in German. Use the parentheses that {{to}} uses.",
      "- Add the original once per paragraph, at the first occurrence of the term. Common words get no parentheses.",
    ].join("\n"),
    exampleKey: "presetKeepTermsExample",
  },
  {
    id: "explainTerms",
    nameKey: "presetExplainTerms",
    hintKey: "presetExplainTermsHint",
    heading: `Explanations of difficult words ${PRECEDENCE}:`,
    rules: [
      "- Translate the paragraph, then explain each difficult word or technical term of that paragraph briefly in {{to}}.",
      "- Put all explanations of a paragraph at the end of its translation, in one bracket: 〔Note: term: explanation; term: explanation〕, with \"Note\" written in {{to}}. Leave the bracket out when the paragraph has no difficult words.",
      "- The explanations belong to the translation of their paragraph: never output them as a separate paragraph, segment, list item or array element.",
    ].join("\n"),
    exampleKey: "presetExplainTermsExample",
  },
  {
    id: "style",
    nameKey: "presetStyle",
    hintKey: "presetStyleHint",
    heading: `Style ${PRECEDENCE}:`,
    rules: "- {{option}}\n- Keep the complete meaning: the style changes only the wording.",
    options: [
      {
        id: "formal",
        nameKey: "presetStyleFormal",
        rule: "Use a formal business register: polite forms of address, complete sentences, no slang and no contractions.",
        exampleKey: "presetStyleFormalExample",
      },
      {
        id: "casual",
        nameKey: "presetStyleCasual",
        rule: "Use a relaxed, conversational register, as between colleagues who know each other well; contractions and everyday words are welcome.",
        exampleKey: "presetStyleCasualExample",
      },
      {
        id: "plain",
        nameKey: "presetStylePlain",
        rule: "Write plain, simple {{to}} for a language learner: short sentences and common words; render idioms and jargon by their plain meaning.",
        exampleKey: "presetStylePlainExample",
      },
      {
        id: "literary",
        nameKey: "presetStyleLiterary",
        rule: "Use a polished, literary style: varied sentence rhythm and precise, expressive words, without adding content.",
        exampleKey: "presetStyleLiteraryExample",
      },
    ],
  },
]

export function getPromptPreset(id: string): PromptPreset | undefined {
  return PROMPT_PRESETS.find((p) => p.id === id)
}

/** Options of a preset that suit the target language. */
export function presetOptions(preset: PromptPreset, targetLang: string): PresetOption[] {
  return (preset.options ?? []).filter((o) => !o.targets || o.targets.includes(targetLang))
}

/** Presets that can be used with the target language: those without options, and those with at least one suitable option. */
export function availablePresets(targetLang: string): PromptPreset[] {
  return PROMPT_PRESETS.filter((p) => !p.options || presetOptions(p, targetLang).length > 0)
}

/** The block a preset adds to a prompt. */
export function presetBlock(preset: PromptPreset, option?: PresetOption): string {
  return `${preset.heading}\n${preset.rules.replace("{{option}}", () => option?.rule ?? "")}`
}

/** Blocks of a prompt: the paragraphs between blank lines. */
const blocks = (prompt: string) => prompt.split(/\n[ \t]*\n/)

/** First line of a block, which names the preset that added it. */
const headingOf = (block: string) => block.trimStart().split("\n")[0].trim()

/** The prompt with the block of a preset at the end; an earlier block of the same preset is replaced. */
export function applyPreset(prompt: string, preset: PromptPreset, option?: PresetOption): string {
  const kept = blocks(prompt.trim()).filter((block) => headingOf(block) !== preset.heading)
  return [...kept, presetBlock(preset, option)].join("\n\n")
}

/** Value of the first entry of the preset list, "Plain": no preset. */
export const NO_PRESET = "none"

/** The prompt without the blocks that presets added; the blocks the user wrote stay. */
export function removePresets(prompt: string): string {
  const headings = new Set(PROMPT_PRESETS.map((p) => p.heading))
  return blocks(prompt.trim())
    .filter((block) => !headings.has(headingOf(block)))
    .join("\n\n")
}
