/** Test doubles for the content side: public settings and translate() stand-ins for the TranslationController. */
import { vi } from "vitest"
import type { TranslateRequest, TranslateResponse } from "../../src/shared/messages"
import type { Tier } from "../../src/shared/providers"
import type { PublicImageSettings, PublicSettings } from "../../src/shared/settings"

export type OnTier = (tier: Tier, result: TranslateResponse) => void

/** Machine translation alone, Chinese target, bilingual. */
export const publicSettings = (over: Partial<PublicSettings> = {}): PublicSettings => ({
  uiLanguage: "auto",
  sourceLang: "auto",
  targetLang: "zh-CN",
  mode: "bilingual",
  autoTranslate: false,
  renderMarkdown: true,
  tiers: ["machine"],
  signatures: { machine: "google-free" },
  credentials: 0,
  precise: false,
  style: { preset: "border", color: "#4c8bf5", textColor: "", opacity: 0.85, fontScale: 1 },
  offlineMutedPairs: [],
  consent: [],
  summary: { available: false, inlineButton: false, collapsed: false, consent: null },
  image: imageSettings(),
  ...over,
})

/** The image settings of the content script: "off" unless the test says otherwise, the filters of the defaults. */
export const imageSettings = (over: Partial<PublicImageSettings> = {}): PublicImageSettings => ({
  mode: "off",
  sources: { inline: true, attachments: true },
  maxPerMessage: 5,
  minSide: 100,
  minArea: 40000,
  maxAspect: 8,
  skipSignature: true,
  collapsed: false,
  showUsage: true,
  consent: null,
  confirmEachMessage: false,
  maxLongEdge: 1568,
  format: "image/jpeg",
  glossary: false,
  signature: "sig",
  ...over,
})

/** The given tiers with simple signatures; the AI signature follows the display mode like the real prompt kind. */
export const tieredSettings = (tiers: Tier[], over: Partial<PublicSettings> = {}): PublicSettings => {
  const mode = over.mode ?? "bilingual"
  const all: Record<Tier, string> = { dictionary: "dictionary", machine: "google-free", ai: `openai|${mode}` }
  return publicSettings({ tiers, signatures: Object.fromEntries(tiers.map((tier) => [tier, all[tier]])), ...over })
}

/** translate() that answers every requested tier at once. */
export const answering = (answer: (text: string, tier: Tier) => TranslateResponse) =>
  vi.fn(async (req: TranslateRequest, onTier: OnTier) => {
    for (const tier of req.tiers) onTier(tier, answer(req.text, tier))
  })

/** translate() whose tiers answer when the test says so; requests are keyed by paragraph text (the latest one wins). */
export function manualTranslate() {
  const waiting = new Map<string, { onTier: OnTier; done: () => void }>()
  const translate = vi.fn((req: TranslateRequest, onTier: OnTier) => new Promise<void>((done) => waiting.set(req.text, { onTier, done })))
  return {
    translate,
    answer: (text: string, tier: Tier, result: TranslateResponse) => waiting.get(text)!.onTier(tier, result),
    done: (text: string) => waiting.get(text)!.done(),
  }
}
