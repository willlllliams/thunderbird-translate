/** The calls of the AI SDK, loaded with the first AI request: the background script starts without it (scripts/build.mjs makes it a chunk). */

import type { ImageAnswer, ImageInput, LlmCallOptions } from "./llm"
import type { MailAnalysis, Segment } from "./llm-prompt"

export interface LlmImpl {
  batch: (segments: Segment[], opts: LlmCallOptions) => Promise<string[]>
  single: (segment: Segment, opts: LlmCallOptions) => Promise<string>
  analyze: (text: string, opts: LlmCallOptions) => Promise<MailAnalysis | null>
  summarize: (prompt: string, opts: LlmCallOptions) => Promise<string>
  analyzeAndSummarize: (prompt: string, opts: LlmCallOptions) => Promise<string>
  readImage: (image: ImageInput, text: string, opts: LlmCallOptions) => Promise<ImageAnswer>
}

const loadLlm = () => import("./llm")
export const LAZY_LLM: LlmImpl = {
  batch: async (segments, opts) => (await loadLlm()).llmTranslateBatch(segments, opts),
  single: async (segment, opts) => (await loadLlm()).llmTranslateSingle(segment, opts),
  analyze: async (text, opts) => (await loadLlm()).llmAnalyzeMail(text, opts),
  summarize: async (prompt, opts) => (await loadLlm()).llmSummarize(prompt, opts),
  analyzeAndSummarize: async (prompt, opts) => (await loadLlm()).llmAnalyzeAndSummarize(prompt, opts),
  readImage: async (image, text, opts) => (await loadLlm()).llmReadImage(image, text, opts),
}
