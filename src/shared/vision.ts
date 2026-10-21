/**
 * Which AI models can read images, what an image costs them in tokens, and
 * which upload formats a service accepts. No API tells whether a model takes
 * images, so the table below matches model names, as shared/thinking.ts
 * does for the thinking switch; docs/providers.md lists the entries with
 * their sources (section "Image translation").
 *
 * A model is "yes" (sent without a word), "no" (nothing is sent: the
 * settings page and the popup name a model that reads images) or "unknown"
 * (sent; "Test image" on the settings page tells). Only models checked
 * against the documentation of their service are "no", so an unknown name
 * is never blocked.
 *
 * Pure data and no SDK imports: the settings page and the popup read it.
 */

export type VisionSupport = "yes" | "no" | "unknown"

interface VisionRule {
  /** Matched against the model name. */
  models: RegExp
  vision: Exclude<VisionSupport, "unknown">
}

/** Model families that read images, whichever service serves them (OpenRouter, Azure, LM Studio and the custom service included). */
const ANY_SERVICE: VisionRule[] = [
  { models: /gpt-4o|gpt-4\.1|gpt-5|(?:^|\/)o[34](?:-|$)|claude-|gemini-|grok-4|pixtral|-vl|vl-|vision|llava|qwen3\.7-flash|glm-4\.[56]v|kimi-k3|kimi-k2\.6|doubao-seed|llama-4|gemma-?3/i, vision: "yes" },
]

/** Rules of one service, before ANY_SERVICE: the defaults of the presets and the models their documentation names. */
const BY_SERVICE: Record<string, VisionRule[]> = {
  deepseek: [
    { models: /^deepseek-v4-pro/, vision: "no" },
    { models: /^deepseek-flash/, vision: "yes" },
  ],
  mistral: [{ models: /^mistral-(?:small|medium)/, vision: "yes" }],
  // GLM-4V-Flash takes no base64 image, the only form the extension sends.
  zhipu: [{ models: /^glm-4v-flash$|^glm-4-(?:flash|air|plus)|^glm-4\.5-air/i, vision: "no" }],
  siliconflow: [{ models: /^Qwen\/Qwen2\.5-\d+B-Instruct$|^deepseek-ai\/DeepSeek-V3$|^THUDM\/glm-4-9b-chat$/, vision: "no" }],
  ollama: [{ models: /^(?:qwen2\.5|qwen3|llama3\.1):/, vision: "no" }],
  groq: [
    { models: /^llama-3\.[13]-|^openai\/gpt-oss/, vision: "no" },
    { models: /^qwen\/qwen3\.8/, vision: "yes" },
  ],
  togetherai: [{ models: /Llama-3\.3-70B-Instruct-Turbo$|Qwen2\.5-72B-Instruct-Turbo$|DeepSeek-V3$/, vision: "no" }],
  fireworks: [{ models: /llama-v3p3-70b-instruct$|deepseek-v3$|qwen2p5-72b-instruct$/, vision: "no" }],
  deepinfra: [{ models: /Llama-3\.3-70B-Instruct-Turbo$|Qwen2\.5-72B-Instruct$|DeepSeek-V3$/, vision: "no" }],
  cerebras: [{ models: /^(?:gpt-oss-120b|llama3\.1-8b|qwen-3-32b)$/, vision: "no" }],
  moonshot: [{ models: /^moonshot-v1-\d+k$/, vision: "no" }],
}

/** A model that reads images, for the services whose default model does not or may not. */
export const SUGGESTED_VISION_MODELS: Record<string, string> = {
  zhipu: "glm-4.6v-flash",
  dashscope: "qwen3-vl-plus",
  siliconflow: "Qwen/Qwen2.5-VL-72B-Instruct",
  moonshot: "kimi-k3",
  ollama: "qwen3-vl:8b",
  groq: "qwen/qwen3.8-27b",
}

/** Whether `model` of the service `presetId` reads images. */
export function visionSupport(presetId: string, model: string): VisionSupport {
  const rule = [...(BY_SERVICE[presetId] ?? []), ...ANY_SERVICE].find((r) => r.models.test(model))
  return rule?.vision ?? "unknown"
}

/** The upload formats of the extension, as media types. */
export type UploadFormat = "image/jpeg" | "image/webp" | "image/png"

/** Services that take only some of the formats: xAI and Zhipu read JPEG and PNG only. */
const FORMATS: Record<string, readonly UploadFormat[]> = {
  xai: ["image/jpeg", "image/png"],
  zhipu: ["image/jpeg", "image/png"],
}

/** The format to upload in: the one of the settings, or JPEG, which every service takes, when the service refuses it. */
export function uploadFormat(presetId: string, wanted: UploadFormat): UploadFormat {
  const accepted = FORMATS[presetId]
  return !accepted || accepted.includes(wanted) ? wanted : "image/jpeg"
}

/**
 * The provider options of the image part that carry the "detail" setting: only the SDK packages that put it into the
 * image of the request read one (OpenAI and DeepSeek); null for the others and for "auto", which sends nothing.
 */
export function imageDetailOptions(presetId: string, detail: "auto" | "low" | "high"): Record<string, { imageDetail: "low" | "high" }> | null {
  if (detail === "auto") return null
  if (presetId === "openai") return { openai: { imageDetail: detail } }
  if (presetId === "deepseek") return { deepseek: { imageDetail: detail } }
  return null
}

/** The input tokens of an image of width × height for each model family, by the formula its service publishes. */
const TOKEN_RULES: { presets: readonly string[] | null; models: RegExp; tokens: (w: number, h: number, detail: string) => number }[] = [
  // OpenAI patch models: 32 px patches times a factor of the model.
  ...(
    [
      [/gpt-4\.1-mini/, 1.62],
      [/gpt-4\.1-nano/, 2.46],
      [/gpt-5-mini/, 1.2],
      [/gpt-5-nano/, 1.5],
    ] as const
  ).map(([models, factor]) => ({ presets: null, models, tokens: (w: number, h: number) => Math.ceil(Math.ceil(w / 32) * Math.ceil(h / 32) * factor) })),
  // OpenAI tile models: a base plus every 512 px tile of the image scaled to fit 2048 × 2048 with its short side at most 768.
  { presets: null, models: /gpt-4o-mini/, tokens: (w, h, detail) => (detail === "low" ? 2833 : 2833 + 5667 * tiles(w, h)) },
  { presets: null, models: /gpt-4o|gpt-4\.1/, tokens: (w, h, detail) => (detail === "low" ? 85 : 85 + 170 * tiles(w, h)) },
  // Anthropic: 28 px patches, at most 1568 at the standard resolution.
  { presets: null, models: /claude-/, tokens: (w, h) => Math.min(1568, Math.ceil(w / 28) * Math.ceil(h / 28)) },
  // Gemini 2.5: 258 for a small image, else 258 per 768 px tile.
  { presets: null, models: /gemini-/, tokens: (w, h) => (w <= 384 && h <= 384 ? 258 : 258 * Math.ceil(w / 768) * Math.ceil(h / 768)) },
  // Qwen3 (Alibaba Cloud Model Studio): one token per 32 × 32 pixels, plus two.
  { presets: ["dashscope"], models: /qwen3/, tokens: (w, h) => Math.ceil(w / 32) * Math.ceil(h / 32) + 2 },
  // Doubao seed 2.0: 1280 per image with detail "high", else one token per 1764 pixels.
  { presets: ["doubao"], models: /seed/, tokens: (w, h, detail) => (detail === "high" ? 1280 : Math.round((w * h) / 1764)) },
  // Mistral Small 3.2 and later: about one token per 784 pixels.
  { presets: ["mistral"], models: /mistral-(?:small|medium)/, tokens: (w, h) => Math.round((w * h) / 784) },
]

/** The 512 px tiles of OpenAI's tile models. */
function tiles(w: number, h: number): number {
  const fit = Math.min(1, 2048 / Math.max(w, h))
  const short = Math.min(1, 768 / (Math.min(w, h) * fit))
  return Math.ceil((w * fit * short) / 512) * Math.ceil((h * fit * short) / 512)
}

/** The input tokens of an image of width × height for `model` of `presetId`; null when its service publishes no formula the table knows. */
export function imageTokens(presetId: string, model: string, w: number, h: number, detail: "auto" | "low" | "high" = "auto"): number | null {
  // OpenRouter names the model as "<vendor>/<model>".
  const name = presetId === "openrouter" ? model.slice(model.indexOf("/") + 1) : model
  const rule = TOKEN_RULES.find((r) => (!r.presets || r.presets.includes(presetId)) && r.models.test(name))
  return rule ? rule.tokens(w, h, detail) : null
}

/** The price pages of the services the token estimate links to. */
export const PRICE_PAGES: Record<string, string> = {
  openai: "https://developers.openai.com/api/docs/pricing",
  anthropic: "https://claude.com/pricing",
  gemini: "https://ai.google.dev/gemini-api/docs/pricing",
}
