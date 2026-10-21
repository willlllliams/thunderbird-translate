/**
 * The per-provider "thinking mode" switch, turned into request options.
 *
 * Every provider spells the switch differently, and within one provider only
 * some models accept it. Each entry below names the providerOptions key the
 * @ai-sdk package reads, then rules matched against the model id in order;
 * a rule gives the options for "off" and for "on". A model that matches no
 * rule gets nothing, and so does "off" when a rule has `off: null` (the model
 * cannot stop thinking). Providers without an entry have no thinking control.
 *
 * Pure data and no SDK imports, so the settings page can ask which providers
 * offer the switch. docs/providers.md lists the values with their sources (section "Thinking mode").
 */

import type { JSONValue } from "ai"

type JSONObject = { [key: string]: JSONValue }

interface ThinkingRule {
  models: RegExp
  off: JSONObject | null
  on: JSONObject
}

interface ThinkingControl {
  /** providerOptions namespace: the SDK's provider name, or the preset id for OpenAI-compatible presets. */
  namespace: string
  rules: ThinkingRule[]
}

const effort = (off: string | null, on: string, extra: JSONObject = {}): Pick<ThinkingRule, "off" | "on"> => ({
  off: off === null ? null : { reasoningEffort: off },
  on: { reasoningEffort: on, ...extra },
})

/** OpenAI reasoning models; the Chat Completions API rejects reasoning_effort for the others. */
const OPENAI_RULES: ThinkingRule[] = [
  { models: /^gpt-(?:5\.\d|[6-9])/, ...effort("none", "medium") },
  { models: /^gpt-5(?:-mini|-nano)?(?:-\d{4}|$)/, ...effort("minimal", "medium") },
  { models: /^o\d/, ...effort("low", "medium") },
]

/** Claude models with adaptive thinking; they also reject custom sampling parameters. */
const CLAUDE_ADAPTIVE = /claude-(?:opus|sonnet|haiku|fable|mythos)-[5-9]|claude-opus-4-[78]/

/** Claude 5.x and later reject custom sampling parameters. */
export function modelRejectsTemperature(presetId: string, model: string): boolean {
  return presetId === "anthropic" && CLAUDE_ADAPTIVE.test(model)
}

const CONTROLS: Record<string, ThinkingControl> = {
  openai: { namespace: "openai", rules: OPENAI_RULES },
  // The Azure chat model is the OpenAI chat model and reads the "openai" options.
  azure: { namespace: "openai", rules: OPENAI_RULES },
  anthropic: {
    namespace: "anthropic",
    rules: [
      // Claude 5 thinks unless told otherwise; the SDK adapts "disabled" for models that refuse it.
      { models: CLAUDE_ADAPTIVE, off: { thinking: { type: "disabled" } }, on: { thinking: { type: "adaptive" } } },
      // Claude 3.7 and 4.x think only on request.
      { models: /claude-(?:3-7|(?:opus|sonnet|haiku)-4)/, off: null, on: { thinking: { type: "enabled", budgetTokens: 1024 } } },
    ],
  },
  gemini: {
    namespace: "google",
    rules: [
      // 2.5 Pro cannot turn thinking off; 128 tokens is its smallest budget.
      { models: /gemini-2\.5-pro/, off: { thinkingConfig: { thinkingBudget: 128 } }, on: { thinkingConfig: { thinkingBudget: -1 } } },
      { models: /gemini-2\.5/, off: { thinkingConfig: { thinkingBudget: 0 } }, on: { thinkingConfig: { thinkingBudget: -1 } } },
      // Gemini 3 has levels instead of budgets and no full off.
      { models: /gemini-(?:[3-9]|flash-latest|pro-latest)/, off: { thinkingConfig: { thinkingLevel: "low" } }, on: { thinkingConfig: { thinkingLevel: "high" } } },
    ],
  },
  deepseek: {
    namespace: "deepseek",
    rules: [{ models: /./, off: { thinking: { type: "disabled" } }, on: { thinking: { type: "enabled" } } }],
  },
  xai: {
    namespace: "xai",
    rules: [
      { models: /^grok-4\.3/, ...effort("none", "high") },
      // Grok 4.5 and later always reason; "low" is the lowest effort.
      { models: /^grok-4\.[5-9]/, ...effort("low", "high") },
    ],
  },
  groq: {
    namespace: "groq",
    rules: [
      { models: /qwen3/, ...effort("none", "default", { reasoningFormat: "parsed" }) },
      { models: /gpt-oss/, ...effort("low", "medium") },
    ],
  },
  mistral: {
    // The SDK sends the option only for the models that accept it.
    namespace: "mistral",
    rules: [{ models: /./, ...effort("none", "high") }],
  },
  togetherai: {
    namespace: "togetherai",
    rules: [{ models: /qwen3|glm-[45]|deepseek-v4|kimi-k3|minimax-m3/i, off: { reasoning: { enabled: false } }, on: { reasoning: { enabled: true } } }],
  },
  fireworks: {
    namespace: "fireworks",
    rules: [
      { models: /deepseek-v3p[12]|deepseek-v4|glm-|kimi-k3|qwen3/, ...effort("none", "medium") },
      { models: /gpt-oss/, ...effort("low", "medium") },
    ],
  },
  deepinfra: {
    // DeepInfra ignores the parameter for models without reasoning.
    namespace: "deepinfra",
    rules: [{ models: /./, ...effort("none", "high") }],
  },
  cerebras: {
    namespace: "cerebras",
    rules: [
      { models: /qwen/, ...effort("none", "medium") },
      { models: /gpt-oss/, ...effort("low", "medium") },
    ],
  },
  moonshot: {
    namespace: "moonshotai",
    rules: [
      { models: /^kimi-k2\.[56]/, off: { thinking: { type: "disabled" } }, on: { thinking: { type: "enabled" } } },
      { models: /^kimi-k3/, ...effort("low", "high") },
    ],
  },
  dashscope: {
    namespace: "alibaba",
    rules: [{ models: /qwen3|qwen-plus|qwen-flash|qwen-turbo/, off: { enableThinking: false }, on: { enableThinking: true } }],
  },
  ollama: {
    namespace: "ollama",
    rules: [{ models: /./, ...effort("none", "medium") }],
  },
  openrouter: {
    // OpenRouter ignores the parameter for models without reasoning; models that always reason refuse "off".
    namespace: "openrouter",
    rules: [
      { models: /\/(?:o\d|gpt-5|gpt-oss|grok-4|claude-opus-5|gemini-2\.5-pro|gemini-3)/, off: { reasoning: { effort: "low" } }, on: { reasoning: { enabled: true } } },
      { models: /./, off: { reasoning: { enabled: false } }, on: { reasoning: { enabled: true } } },
    ],
  },
  zhipu: {
    namespace: "zhipu",
    rules: [
      // GLM-5.3 refuses "disabled".
      { models: /glm-5\.3/i, off: null, on: { thinking: { type: "enabled" } } },
      { models: /glm-(?:4\.[5-9]|5)/i, off: { thinking: { type: "disabled" } }, on: { thinking: { type: "enabled" } } },
    ],
  },
  siliconflow: {
    // Passed through as is by the OpenAI-compatible SDK, hence the snake_case key.
    namespace: "siliconflow",
    rules: [{ models: /qwen3|deepseek-v3\.[12]|deepseek-v4|glm-4\.[5-9]|glm-5|hunyuan-a13b|kimi-k2/i, off: { enable_thinking: false }, on: { enable_thinking: true } }],
  },
  doubao: {
    namespace: "doubao",
    rules: [{ models: /seed|thinking/, off: { thinking: { type: "disabled" } }, on: { thinking: { type: "enabled" } } }],
  },
}

/** Whether the provider has a parameter that controls thinking; the settings page disables the switch otherwise. */
export function supportsThinkingControl(presetId: string): boolean {
  return presetId in CONTROLS
}

export interface ThinkingRequest {
  providerOptions?: Record<string, JSONObject>
  /** Thinking is on: leave the temperature out, reasoning models ignore or refuse it. */
  dropTemperature: boolean
}

/** Options of the switch "off" that still let the model reason: a low effort, a small budget, a level. */
const STILL_REASONS = /"reasoningEffort":"(?:minimal|low|medium)"|"thinkingBudget":[1-9]|"thinkingLevel"|"effort":"low"/

/**
 * Whether a request with the switch at `on` makes the model reason before it answers: on for a model the switch
 * applies to, and off for one that cannot stop or only reasons less. Most services count those tokens within the
 * output limit of the request.
 */
export function reasons(presetId: string, model: string, on: boolean): boolean {
  // Claude 5 thinks adaptively; some of these models refuse "disabled", which the SDK then leaves out.
  if (presetId === "anthropic" && CLAUDE_ADAPTIVE.test(model)) return true
  const rule = CONTROLS[presetId]?.rules.find((r) => r.models.test(model))
  if (!rule) return false
  return on || rule.off === null || STILL_REASONS.test(JSON.stringify(rule.off))
}

/** Tokens a request adds to its output limit for a model that reasons first, which most services count within that limit. */
export const REASONING_TOKENS = 4096

/**
 * The output limit of a request whose answer should have `answer` tokens: with room for the reasoning of a model
 * that reasons first, except where the SDK adds the budget itself (Anthropic's thinking with a budget, Claude 3.7 and 4).
 */
export function outputLimit(presetId: string, model: string, on: boolean, answer: number): number {
  const budgeted = presetId === "anthropic" && on && !CLAUDE_ADAPTIVE.test(model) && reasons(presetId, model, on)
  return reasons(presetId, model, on) && !budgeted ? answer + REASONING_TOKENS : answer
}

/** Request options for the thinking switch of one provider and model. */
export function thinkingOptions(presetId: string, model: string, on: boolean): ThinkingRequest {
  const control = CONTROLS[presetId]
  const rule = control?.rules.find((r) => r.models.test(model))
  if (!control || !rule) return { dropTemperature: false }
  const options = on ? rule.on : rule.off
  return { ...(options ? { providerOptions: { [control.namespace]: options } } : {}), dropTemperature: on }
}
