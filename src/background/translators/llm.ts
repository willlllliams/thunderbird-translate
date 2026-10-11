import { generateText } from "ai"
import type { ResolvedProvider } from "../../shared/settings"
import { createLanguageModel } from "../providers/factory"
import {
  buildBatchPrompt,
  buildSinglePrompt,
  buildSystemPrompt,
  cleanSingleOutput,
  modelRejectsTemperature,
  parseBatchOutput,
} from "./llm-prompt"

export interface LlmCallOptions {
  provider: ResolvedProvider
  systemPrompt: string
  targetLanguageName: string
  fetchFn?: typeof fetch
  signal?: AbortSignal
}

/** Thrown when a batched answer cannot be mapped back onto the paragraphs. */
export class BatchParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BatchParseError"
  }
}

async function callModel(prompt: string, opts: LlmCallOptions): Promise<string> {
  const model = createLanguageModel(opts.provider, opts.fetchFn)
  const temperature =
    opts.provider.temperature === null || modelRejectsTemperature(opts.provider.id, opts.provider.model)
      ? undefined
      : opts.provider.temperature
  const result = await generateText({
    model,
    system: buildSystemPrompt(opts.systemPrompt, opts.targetLanguageName),
    prompt,
    ...(temperature !== undefined ? { temperature } : {}),
    // Retries are handled by our RequestQueue.
    maxRetries: 0,
    abortSignal: opts.signal,
  })
  return result.text
}

export async function llmTranslateSingle(text: string, opts: LlmCallOptions): Promise<string> {
  const raw = await callModel(buildSinglePrompt(text, opts.targetLanguageName), opts)
  const out = cleanSingleOutput(raw)
  if (!out) throw new Error("The model returned an empty answer")
  return out
}

/** One request for many paragraphs. Throws BatchParseError when the answer does not line up. */
export async function llmTranslateBatch(texts: string[], opts: LlmCallOptions): Promise<string[]> {
  if (texts.length === 1) return [await llmTranslateSingle(texts[0], opts)]
  const raw = await callModel(buildBatchPrompt(texts, opts.targetLanguageName), opts)
  const parsed = parseBatchOutput(raw, texts.length)
  if (!parsed) throw new BatchParseError(`Could not parse ${texts.length} translations from the model output`)
  return parsed
}
