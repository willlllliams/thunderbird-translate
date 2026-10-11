import { generateText, type SystemModelMessage } from "ai"
import { LocalizedError } from "../../shared/errors"
import { getPreset } from "../../shared/providers"
import type { ResolvedProvider } from "../../shared/settings"
import { createLanguageModel } from "../providers/factory"
import { modelRejectsTemperature, thinkingOptions } from "../providers/thinking"
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildBatchPrompt,
  buildSinglePrompt,
  buildSystemPrompt,
  cleanSingleOutput,
  type MailAnalysis,
  parseAnalysis,
  parseBatchOutput,
  type Segment,
} from "./llm-prompt"

export interface LlmCallOptions {
  provider: ResolvedProvider
  systemPrompt: string
  targetLanguageName: string
  /** Precise mode: message context appended to the system prompt, identical for every request of one message. */
  contextPrefix?: string
  fetchFn?: typeof fetch
}

/** Thrown when a batched answer cannot be mapped back onto the paragraphs. */
export class BatchParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BatchParseError"
  }
}

async function callModel(instructions: SystemModelMessage, prompt: string, opts: LlmCallOptions): Promise<string> {
  const { id, model, temperature, thinking } = opts.provider
  const reasoning = thinkingOptions(id, model, thinking)
  const sendTemperature = temperature !== null && !reasoning.dropTemperature && !modelRejectsTemperature(id, model)
  const result = await generateText({
    model: createLanguageModel(opts.provider, opts.fetchFn),
    instructions,
    prompt,
    ...(sendTemperature ? { temperature } : {}),
    ...(reasoning.providerOptions ? { providerOptions: reasoning.providerOptions } : {}),
    // Retries are handled by our RequestQueue.
    maxRetries: 0,
  })
  return result.text
}

/** System message of a translation request: the system prompt, then the message context in precise mode. */
function translationInstructions(opts: LlmCallOptions): SystemModelMessage {
  const base = buildSystemPrompt(opts.systemPrompt, opts.targetLanguageName)
  if (!opts.contextPrefix) return { role: "system", content: base }
  const content = `${base}\n\n${opts.contextPrefix}`
  // Other providers cache a repeated prefix on their own; Anthropic caches only marked blocks.
  return getPreset(opts.provider.id)?.sdk === "anthropic"
    ? { role: "system", content, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }
    : { role: "system", content }
}

export async function llmTranslateSingle(segment: Segment, opts: LlmCallOptions): Promise<string> {
  const raw = await callModel(translationInstructions(opts), buildSinglePrompt(segment, opts.targetLanguageName), opts)
  const out = cleanSingleOutput(raw)
  if (!out) throw new LocalizedError("errEmptyAnswer")
  return out
}

/** One request for many paragraphs. Throws BatchParseError when the answer does not line up. */
export async function llmTranslateBatch(segments: Segment[], opts: LlmCallOptions): Promise<string[]> {
  if (segments.length === 1) return [await llmTranslateSingle(segments[0], opts)]
  const raw = await callModel(translationInstructions(opts), buildBatchPrompt(segments, opts.targetLanguageName), opts)
  const parsed = parseBatchOutput(raw, segments.length)
  if (!parsed) throw new BatchParseError(`Could not parse ${segments.length} translations from the model output`)
  return parsed
}

/** Precise mode: summary, glossary and tone of the whole message; null when the answer is not usable. */
export async function llmAnalyzeMail(text: string, opts: LlmCallOptions): Promise<MailAnalysis | null> {
  const system = ANALYSIS_SYSTEM_PROMPT.replaceAll("{{to}}", opts.targetLanguageName)
  return parseAnalysis(await callModel({ role: "system", content: system }, buildAnalysisPrompt(text), opts))
}
