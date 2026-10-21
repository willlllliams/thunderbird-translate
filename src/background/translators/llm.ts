// First: zod reads its configuration when the AI SDK below builds its first schema, and ES modules run in import order.
import "./zod-config"
import { generateText, type SystemModelMessage } from "ai"
import { LocalizedError, TimeoutError } from "../../shared/errors"
import { timeoutSignal } from "../../shared/http"
import { getPreset } from "../../shared/providers"
import type { ResolvedProvider } from "../../shared/settings"
import { createLanguageModel } from "../providers/factory"
import { modelRejectsTemperature, thinkingOptions } from "../../shared/thinking"
import {
  ANALYSIS_SYSTEM_PROMPT,
  BatchParseError,
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
  /** System prompt template; {{to}} is replaced by the target language. */
  systemPrompt: string
  targetLanguageName: string
  /** English name of the source language; absent = the model detects it. */
  sourceLanguageName?: string
  /** Precise mode: message context appended to the system prompt, identical for every request of one message. */
  contextPrefix?: string
  fetchFn?: typeof fetch
  /** A request without an answer after this long fails with TimeoutError. */
  timeoutMs?: number
  /** Upper bound of the answer, sent as maxOutputTokens; none when absent. */
  maxOutputTokens?: number
}

async function callModel(instructions: SystemModelMessage, prompt: string, opts: LlmCallOptions): Promise<string> {
  const { id, model, temperature, thinking } = opts.provider
  const reasoning = thinkingOptions(id, model, thinking)
  const sendTemperature = temperature !== null && !reasoning.dropTemperature && !modelRejectsTemperature(id, model)
  const timeout = opts.timeoutMs ? timeoutSignal(opts.timeoutMs) : undefined
  const abortSignal = timeout?.signal
  try {
    const result = await generateText({
      model: createLanguageModel(opts.provider, opts.fetchFn),
      instructions,
      prompt,
      ...(sendTemperature ? { temperature } : {}),
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      ...(reasoning.providerOptions ? { providerOptions: reasoning.providerOptions } : {}),
      abortSignal,
      // Retries are handled by our RequestQueue.
      maxRetries: 0,
    })
    return result.text
  } catch (error) {
    if (abortSignal?.aborted) throw new TimeoutError(getPreset(id)?.name ?? id, opts.timeoutMs!)
    throw error
  } finally {
    timeout?.clear()
  }
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

const languages = (opts: LlmCallOptions) => ({ source: opts.sourceLanguageName, target: opts.targetLanguageName })

export async function llmTranslateSingle(segment: Segment, opts: LlmCallOptions): Promise<string> {
  const raw = await callModel(translationInstructions(opts), buildSinglePrompt(segment, languages(opts)), opts)
  const out = cleanSingleOutput(raw)
  if (!out) throw new LocalizedError("errEmptyAnswer")
  return out
}

/** One request for many paragraphs. Throws BatchParseError when the answer does not line up. */
export async function llmTranslateBatch(segments: Segment[], opts: LlmCallOptions): Promise<string[]> {
  if (segments.length === 1) return [await llmTranslateSingle(segments[0], opts)]
  const raw = await callModel(translationInstructions(opts), buildBatchPrompt(segments, languages(opts)), opts)
  const parsed = parseBatchOutput(raw, segments.length, segments.map((s) => s.text))
  if (!parsed) throw new BatchParseError(`Could not parse ${segments.length} translations from the model output`)
  return parsed
}

/** The summary and to-dos of a message (background/summary.ts): the answer as the model wrote it; `opts.systemPrompt` is the complete system prompt. */
export async function llmSummarize(prompt: string, opts: LlmCallOptions): Promise<string> {
  const raw = await callModel({ role: "system", content: opts.systemPrompt }, prompt, opts)
  if (!raw.trim()) throw new LocalizedError("errEmptyAnswer")
  return raw
}

/** Precise mode: summary, glossary and tone of the whole message; null when the answer is not usable. */
export async function llmAnalyzeMail(text: string, opts: LlmCallOptions): Promise<MailAnalysis | null> {
  const system = ANALYSIS_SYSTEM_PROMPT.replaceAll("{{to}}", opts.targetLanguageName)
  return parseAnalysis(await callModel({ role: "system", content: system }, buildAnalysisPrompt(text), opts))
}
