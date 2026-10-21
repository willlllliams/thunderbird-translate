// First: zod reads its configuration when the AI SDK below builds its first schema, and ES modules run in import order.
import "./zod-config"
import { generateText, type ModelMessage, type SystemModelMessage } from "ai"
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
  /** Ends the request once no one waits for its answer, the request on its way included. */
  abortSignal?: AbortSignal
}

/** What one request asks: a prompt, or messages with the parts of an image. */
type ModelInput = { prompt: string } | { messages: ModelMessage[] }

async function generate(instructions: SystemModelMessage, input: ModelInput, opts: LlmCallOptions) {
  const { id, model, temperature, thinking } = opts.provider
  const reasoning = thinkingOptions(id, model, thinking)
  const sendTemperature = temperature !== null && !reasoning.dropTemperature && !modelRejectsTemperature(id, model)
  const timeout = opts.timeoutMs ? timeoutSignal(opts.timeoutMs) : undefined
  const signals = [timeout?.signal, opts.abortSignal].filter((signal) => signal !== undefined)
  const abortSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0]
  try {
    return await generateText({
      model: createLanguageModel(opts.provider, opts.fetchFn),
      instructions,
      ...input,
      ...(sendTemperature ? { temperature } : {}),
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      ...(reasoning.providerOptions ? { providerOptions: reasoning.providerOptions } : {}),
      abortSignal,
      // Retries are handled by our RequestQueue.
      maxRetries: 0,
    })
  } catch (error) {
    if (opts.abortSignal?.aborted) throw opts.abortSignal.reason
    if (timeout?.signal.aborted) throw new TimeoutError(getPreset(id)?.name ?? id, opts.timeoutMs!)
    throw error
  } finally {
    timeout?.clear()
  }
}

async function callModel(instructions: SystemModelMessage, prompt: string, opts: LlmCallOptions): Promise<string> {
  return (await generate(instructions, { prompt }, opts)).text
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

/**
 * The summary and to-dos of a message (background/summary.ts): the answer as the model wrote it; `opts.systemPrompt`
 * is the complete system prompt. An answer cut at the output limit is half a JSON object, and fails with errAnswerCutOff.
 */
export async function llmSummarize(prompt: string, opts: LlmCallOptions): Promise<string> {
  const { text: raw, finishReason } = await generate({ role: "system", content: opts.systemPrompt }, { prompt }, opts)
  if (finishReason === "length") throw new LocalizedError("errAnswerCutOff")
  if (!raw.trim()) throw new LocalizedError("errEmptyAnswer")
  return raw
}

/** An image for the model: its bytes and media type, and the provider options of its part (the detail of OpenAI and DeepSeek). */
export interface ImageInput {
  bytes: Uint8Array
  mediaType: string
  providerOptions?: Record<string, Record<string, string>>
}

/** What the model wrote about an image, its tokens, and whether it stopped at the length limit. */
export interface ImageAnswer {
  text: string
  usage?: { input: number; output: number }
  truncated: boolean
}

/**
 * The text of one image (background/images.ts): the image as a file part with its media type, the user text after it;
 * `opts.systemPrompt` is the complete system prompt. ImagePart is deprecated in this version of the AI SDK.
 */
export async function llmReadImage(image: ImageInput, text: string, opts: LlmCallOptions): Promise<ImageAnswer> {
  const file = { type: "file" as const, mediaType: image.mediaType, data: { type: "data" as const, data: image.bytes }, ...(image.providerOptions ? { providerOptions: image.providerOptions } : {}) }
  const result = await generate({ role: "system", content: opts.systemPrompt }, { messages: [{ role: "user", content: [file, { type: "text", text }] }] }, opts)
  if (!result.text.trim()) throw new LocalizedError("errEmptyAnswer")
  const { inputTokens, outputTokens } = result.usage
  return { text: result.text, truncated: result.finishReason === "length", ...(inputTokens !== undefined && outputTokens !== undefined ? { usage: { input: inputTokens, output: outputTokens } } : {}) }
}

/** Precise mode: summary, glossary and tone of the whole message; null when the answer is not usable. */
export async function llmAnalyzeMail(text: string, opts: LlmCallOptions): Promise<MailAnalysis | null> {
  const system = ANALYSIS_SYSTEM_PROMPT.replaceAll("{{to}}", opts.targetLanguageName)
  return parseAnalysis(await callModel({ role: "system", content: system }, buildAnalysisPrompt(text), opts))
}
