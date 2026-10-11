/**
 * Library of ready-made prompts the user can apply to one of the three
 * prompts (dialects, difficult words, word explanations, writing styles).
 * The entries and the interface that offers them come with the welcome page.
 */

import type { PromptKind } from "./prompts"

export interface PromptPreset {
  id: string
  /** Prompts the preset may replace. */
  kinds: PromptKind[]
  /** Prompt text; `{{to}}` stands for the target language. */
  prompt: string
}

export const PROMPT_PRESETS: PromptPreset[] = []
