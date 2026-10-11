/**
 * Steps of the welcome page and which of them the settings need. A step
 * that the earlier choices make unnecessary (offline downloads without an
 * offline service, AI configuration without the AI tier…) stays in the
 * progress list as skipped, and the navigation passes over it.
 */

import type { MessageKey } from "../shared/i18n"
import { baseLang } from "../shared/languages"
import { getPreset } from "../shared/providers"
import type { Settings } from "../shared/settings"

export const STEP_IDS = ["language", "display", "tiers", "offline", "machine", "ai", "prompts", "finish"] as const
export type StepId = (typeof STEP_IDS)[number]

export const STEP_TITLE_KEYS: Record<StepId, MessageKey> = {
  language: "stepLanguage",
  display: "stepDisplay",
  tiers: "stepTiers",
  offline: "stepOffline",
  machine: "stepMachine",
  ai: "stepAi",
  prompts: "stepPrompts",
  finish: "stepFinish",
}

/** storage.local key of the welcome page's state: { step, finished }. */
export const WELCOME_KEY = "welcome"

export interface WelcomeState {
  /** The step to open: the one shown when the page was left. */
  step: StepId
  /** The user went through the last step. */
  finished?: boolean
}

const kindOf = (id: string | null) => (id ? getPreset(id)?.kind : undefined)

/** Whether the settings need a step. */
export function stepNeeded(step: StepId, settings: Pick<Settings, "tiers">): boolean {
  const { tiers } = settings
  switch (step) {
    case "offline":
      return tiers.dictionary !== null || kindOf(tiers.machine) === "bergamot"
    case "machine":
      return ["google", "microsoft", "deeplx"].includes(kindOf(tiers.machine) ?? "")
    case "ai":
    case "prompts":
      return tiers.ai !== null
    default:
      return true
  }
}

/** The next needed step after `step` in direction `dir`; null at either end. */
export function neighbourStep(step: StepId, settings: Pick<Settings, "tiers">, dir: 1 | -1): StepId | null {
  for (let i = STEP_IDS.indexOf(step) + dir; i >= 0 && i < STEP_IDS.length; i += dir) {
    if (stepNeeded(STEP_IDS[i], settings)) return STEP_IDS[i]
  }
  return null
}

/** The step to open: the stored one, or the next needed step after it; the first step for a new or finished guide. */
export function resumeStep(stored: unknown, settings: Pick<Settings, "tiers">): StepId {
  const state = stored as Partial<WelcomeState> | undefined
  const step = state?.step
  if (state?.finished || !step || !STEP_IDS.includes(step)) return STEP_IDS[0]
  return stepNeeded(step, settings) ? step : (neighbourStep(step, settings, 1) ?? STEP_IDS[0])
}

/** Message of the trial, in English, or in German when the target language is English. */
export const TRY_MAIL: Record<"en" | "de", string[]> = {
  en: [
    "Hi Anna,",
    "Thanks for sending the draft so quickly. I went through it this morning and only have two small comments on the budget section.",
    "Could we move our call to Thursday at 3 pm? On Wednesday I am travelling and will not have a reliable connection.",
    "Best regards,\nTom",
  ],
  de: [
    "Hallo Anna,",
    "danke, dass du den Entwurf so schnell geschickt hast. Ich habe ihn heute Morgen durchgesehen und habe nur zwei kleine Anmerkungen zum Budget.",
    "Können wir unser Telefonat auf Donnerstag um 15 Uhr verschieben? Am Mittwoch bin ich unterwegs und habe keine zuverlässige Verbindung.",
    "Viele Grüße\nTom",
  ],
}

/** The language of the trial message: the fixed source language when there is one, else English unless the target is English. */
export function trialLanguage(s: Pick<Settings, "sourceLang" | "targetLang">): "en" | "de" {
  if (s.sourceLang === "en" || s.sourceLang === "de") return s.sourceLang
  return baseLang(s.targetLang) === "en" ? "de" : "en"
}
