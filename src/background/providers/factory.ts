/**
 * Builds a Vercel AI SDK LanguageModel for an LLM preset.
 *
 * Presets with an official @ai-sdk/* package use it; the rest go through
 * @ai-sdk/openai-compatible. The base URL is always passed explicitly (user
 * value or preset default), so what the settings page shows is what is called.
 */

import { createAlibaba } from "@ai-sdk/alibaba"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createCerebras } from "@ai-sdk/cerebras"
import { createDeepInfra } from "@ai-sdk/deepinfra"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createFireworks } from "@ai-sdk/fireworks"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { createMistral } from "@ai-sdk/mistral"
import { createMoonshotAI } from "@ai-sdk/moonshotai"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createPerplexity } from "@ai-sdk/perplexity"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createXai } from "@ai-sdk/xai"
import type { LanguageModel } from "ai"
import { LocalizedError } from "../../shared/errors"
import { getPreset, type SdkId } from "../../shared/providers"
import type { ResolvedProvider } from "../../shared/settings"

export interface ProviderSettings {
  sdk: SdkId
  baseURL: string
  apiKey: string
  headers: Record<string, string>
  model: string
}

/** Pure part of the factory: which SDK, which endpoint, which headers. */
export function buildProviderSettings(resolved: ResolvedProvider): ProviderSettings {
  const preset = getPreset(resolved.id)
  if (!preset || preset.kind !== "llm" || !preset.sdk) {
    throw new LocalizedError("errUnknownProvider", [resolved.id])
  }
  if (!resolved.baseURL) throw new LocalizedError("errEndpointRequired", [preset.name])
  if (!resolved.model) throw new LocalizedError("errModelRequired", [preset.name])
  if (preset.requiresKey && !resolved.apiKey) throw new LocalizedError("errApiKeyRequired", [preset.name])

  const headers: Record<string, string> = {}
  if (preset.sdk === "anthropic") {
    // Anthropic refuses requests from browser contexts without this header.
    headers["anthropic-dangerous-direct-browser-access"] = "true"
  }
  if (resolved.id === "openrouter") {
    headers["X-Title"] = "Thunderbird Translate"
  }
  return { sdk: preset.sdk, baseURL: resolved.baseURL, apiKey: resolved.apiKey, headers, model: resolved.model }
}

export function createLanguageModel(resolved: ResolvedProvider, fetchFn?: typeof fetch): LanguageModel {
  const s = buildProviderSettings(resolved)
  const common = {
    baseURL: s.baseURL,
    // Local servers (Ollama, LM Studio) accept any key; SDKs require a string.
    apiKey: s.apiKey || "not-needed",
    headers: s.headers,
    ...(fetchFn ? { fetch: fetchFn } : {}),
  }
  switch (s.sdk) {
    case "openai":
      // Chat Completions works with OpenAI and with OpenAI-style proxies.
      return createOpenAI(common).chat(s.model)
    case "anthropic":
      return createAnthropic(common)(s.model)
    case "google":
      return createGoogleGenerativeAI(common)(s.model)
    case "deepseek":
      return createDeepSeek(common)(s.model)
    case "xai":
      return createXai(common)(s.model)
    case "groq":
      return createGroq(common)(s.model)
    case "mistral":
      return createMistral(common)(s.model)
    case "togetherai":
      return createTogetherAI(common)(s.model)
    case "fireworks":
      return createFireworks(common)(s.model)
    case "deepinfra":
      return createDeepInfra(common)(s.model)
    case "cerebras":
      return createCerebras(common)(s.model)
    case "perplexity":
      return createPerplexity(common)(s.model)
    case "moonshotai":
      return createMoonshotAI(common)(s.model)
    case "alibaba":
      return createAlibaba(common)(s.model)
    case "azure":
      // Model = deployment name. baseURL like https://<resource>.openai.azure.com/openai
      return createAzure(common).chat(s.model)
    case "openai-compatible":
      return createOpenAICompatible({ name: resolved.id, ...common })(s.model)
  }
}
