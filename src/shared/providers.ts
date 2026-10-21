/**
 * Provider presets. Pure data: shared by background, popup and options page.
 * The SDK wiring lives in src/background/providers/factory.ts.
 */

import { getI18n, type I18n, type MessageKey } from "./i18n"

export type ProviderKind = "dictionary" | "bergamot" | "google" | "microsoft" | "deeplx" | "deepl" | "baidu" | "youdao" | "caiyun" | "llm"

/**
 * The three tiers of the translation pipeline, lowest first. Every paragraph
 * goes to the service of each enabled tier at the same time; the highest
 * tier that has answered is shown.
 */
export type Tier = "dictionary" | "machine" | "ai"
export const TIERS: readonly Tier[] = ["dictionary", "machine", "ai"]

/** Name of each tier in the interface. */
export const TIER_NAME_KEYS: Record<Tier, MessageKey> = { dictionary: "tierDictionary", machine: "tierMachine", ai: "tierAi" }

/** Which Vercel AI SDK package builds the model for an LLM preset. */
export type SdkId =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "xai"
  | "groq"
  | "mistral"
  | "togetherai"
  | "fireworks"
  | "deepinfra"
  | "cerebras"
  | "perplexity"
  | "moonshotai"
  | "alibaba"
  | "azure"
  | "openai-compatible"

export interface ProviderPreset {
  id: string
  /** Product name, never translated. */
  name: string
  /** Message that wraps or replaces the name in the UI, e.g. "$1 (free)". */
  nameKey?: "providerFree" | "providerLocal" | "providerCustom" | "providerOffline" | "providerDictionary"
  kind: ProviderKind
  sdk?: SdkId
  /** Default endpoint. Empty means the user must fill it in. */
  defaultBaseURL: string
  defaultModel: string
  /** Suggestions for the model field; the user can type anything. */
  models: string[]
  /** Whether an API key is required for the preset to work. */
  requiresKey: boolean
  /** Whether a custom endpoint must be provided (no usable default). */
  requiresBaseURL?: boolean
  /** Default temperature; null means "do not send". */
  defaultTemperature: number | null
  /** Where to get a key / read the docs. */
  docsUrl?: string
  /**
   * Hosts of the provider's web console, documentation or chat app. They
   * serve web pages, not the API, and are a common mistake in the endpoint field.
   */
  webHosts?: string[]
}

const T = 0.3

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "dictionary",
    name: "Dictionary",
    nameKey: "providerDictionary",
    kind: "dictionary",
    defaultBaseURL: "",
    defaultModel: "",
    models: [],
    requiresKey: false,
    defaultTemperature: null,
  },
  {
    id: "bergamot",
    name: "Bergamot",
    nameKey: "providerOffline",
    kind: "bergamot",
    defaultBaseURL: "",
    defaultModel: "",
    models: [],
    requiresKey: false,
    defaultTemperature: null,
  },
  {
    id: "google-free",
    name: "Google Translate",
    nameKey: "providerFree",
    kind: "google",
    defaultBaseURL: "https://translate.googleapis.com",
    defaultModel: "",
    models: [],
    requiresKey: false,
    defaultTemperature: null,
  },
  {
    id: "microsoft-free",
    name: "Microsoft Translator",
    nameKey: "providerFree",
    kind: "microsoft",
    // The free route has no editable endpoint; this is the default of "use my key" mode (Azure Translator v3 translate method).
    defaultBaseURL: "https://api.cognitive.microsofttranslator.com/translate",
    defaultModel: "",
    models: [],
    requiresKey: false,
    defaultTemperature: null,
    docsUrl: "https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/authentication",
  },
  {
    id: "deeplx",
    name: "DeepLX",
    kind: "deeplx",
    defaultBaseURL: "",
    defaultModel: "",
    models: [],
    requiresKey: false,
    requiresBaseURL: true,
    defaultTemperature: null,
    docsUrl: "https://deeplx.owo.network/",
  },
  {
    id: "deepl",
    name: "DeepL API",
    kind: "deepl",
    // A free key (ending in ":fx") goes to https://api-free.deepl.com instead, see resolveProviderConfig().
    defaultBaseURL: "https://api.deepl.com",
    defaultModel: "",
    models: [],
    requiresKey: true,
    defaultTemperature: null,
    docsUrl: "https://www.deepl.com/your-account/keys",
    webHosts: ["www.deepl.com", "deepl.com", "developers.deepl.com"],
  },
  {
    id: "baidu",
    name: "百度翻译 (Baidu Translate)",
    kind: "baidu",
    defaultBaseURL: "https://fanyi-api.baidu.com/api/trans/vip/translate",
    defaultModel: "",
    models: [],
    requiresKey: true,
    defaultTemperature: null,
    docsUrl: "https://fanyi-api.baidu.com/manage/developer",
    webHosts: ["fanyi.baidu.com"],
  },
  {
    id: "youdao",
    name: "有道智云 (Youdao)",
    kind: "youdao",
    defaultBaseURL: "https://openapi.youdao.com/v2/api",
    defaultModel: "",
    models: [],
    requiresKey: true,
    defaultTemperature: null,
    docsUrl: "https://ai.youdao.com/",
    webHosts: ["ai.youdao.com", "fanyi.youdao.com"],
  },
  {
    id: "caiyun",
    name: "彩云小译 (Caiyun)",
    kind: "caiyun",
    defaultBaseURL: "https://api.interpreter.caiyunai.com/v1/translator",
    defaultModel: "",
    models: [],
    requiresKey: true,
    defaultTemperature: null,
    docsUrl: "https://docs.caiyunapp.com/lingocloud-api/index.html",
    webHosts: ["docs.caiyunapp.com", "fanyi.caiyunapp.com", "dashboard.caiyunapp.com"],
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "llm",
    sdk: "openai",
    defaultBaseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4.1", "gpt-4o-mini", "gpt-4o", "gpt-5-mini", "gpt-5-nano"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://platform.openai.com/api-keys",
    webHosts: ["platform.openai.com", "chatgpt.com", "chat.openai.com", "openai.com", "help.openai.com"],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    kind: "llm",
    sdk: "anthropic",
    defaultBaseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-5-5",
    models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5"],
    requiresKey: true,
    // Claude 5.x models reject non-default sampling parameters.
    defaultTemperature: null,
    docsUrl: "https://console.anthropic.com/settings/keys",
    webHosts: ["console.anthropic.com", "platform.claude.com", "docs.anthropic.com", "docs.claude.com", "claude.ai", "www.anthropic.com", "anthropic.com"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "llm",
    sdk: "google",
    defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash-lite",
    models: ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://aistudio.google.com/apikey",
    webHosts: ["aistudio.google.com", "ai.google.dev", "gemini.google.com"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "llm",
    sdk: "deepseek",
    defaultBaseURL: "https://api.deepseek.com",
    // deepseek-chat and deepseek-reasoner were retired on 2026-07-24 (api-docs.deepseek.com/news/news260424).
    defaultModel: "deepseek-flash",
    models: ["deepseek-flash", "deepseek-v4-pro"],
    requiresKey: true,
    defaultTemperature: 1.3,
    docsUrl: "https://platform.deepseek.com/api_keys",
    webHosts: ["platform.deepseek.com", "api-docs.deepseek.com", "chat.deepseek.com", "www.deepseek.com", "deepseek.com"],
  },
  {
    id: "xai",
    name: "xAI Grok",
    kind: "llm",
    sdk: "xai",
    defaultBaseURL: "https://api.x.ai/v1",
    defaultModel: "grok-4.3",
    models: ["grok-4.3", "grok-4.5", "grok-4.6", "grok-4.7", "grok-4.20-0309-non-reasoning"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://console.x.ai/",
    webHosts: ["console.x.ai", "docs.x.ai", "x.ai", "grok.com"],
  },
  {
    id: "groq",
    name: "Groq",
    kind: "llm",
    sdk: "groq",
    defaultBaseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "openai/gpt-oss-20b"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://console.groq.com/keys",
    webHosts: ["console.groq.com", "groq.com"],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    kind: "llm",
    sdk: "mistral",
    defaultBaseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://console.mistral.ai/api-keys",
    webHosts: ["console.mistral.ai", "docs.mistral.ai", "chat.mistral.ai", "mistral.ai"],
  },
  {
    id: "ollama",
    name: "Ollama",
    nameKey: "providerLocal",
    kind: "llm",
    sdk: "openai-compatible",
    defaultBaseURL: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:7b",
    models: ["qwen2.5:7b", "qwen3:8b", "llama3.1:8b", "gemma3:12b"],
    requiresKey: false,
    defaultTemperature: T,
    docsUrl: "https://ollama.com/",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "llm",
    sdk: "openai-compatible",
    defaultBaseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    models: ["openai/gpt-4.1-mini", "google/gemini-2.5-flash", "deepseek/deepseek-chat", "anthropic/claude-haiku-4.5"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    id: "togetherai",
    name: "Together AI",
    kind: "llm",
    sdk: "togetherai",
    defaultBaseURL: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://api.together.ai/settings/api-keys",
    webHosts: ["docs.together.ai", "www.together.ai", "together.ai"],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    kind: "llm",
    sdk: "fireworks",
    defaultBaseURL: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    models: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/deepseek-v3", "accounts/fireworks/models/qwen2p5-72b-instruct"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://fireworks.ai/account/api-keys",
    webHosts: ["fireworks.ai", "docs.fireworks.ai"],
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    kind: "llm",
    sdk: "deepinfra",
    defaultBaseURL: "https://api.deepinfra.com/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://deepinfra.com/dash/api_keys",
    webHosts: ["deepinfra.com"],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    kind: "llm",
    sdk: "cerebras",
    defaultBaseURL: "https://api.cerebras.ai/v1",
    defaultModel: "gpt-oss-120b",
    models: ["gpt-oss-120b", "llama3.1-8b", "qwen-3-32b"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://cloud.cerebras.ai/",
    webHosts: ["cloud.cerebras.ai", "inference-docs.cerebras.ai", "cerebras.ai"],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    kind: "llm",
    sdk: "perplexity",
    defaultBaseURL: "https://api.perplexity.ai",
    defaultModel: "perplexity/sonar",
    models: ["perplexity/sonar"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://www.perplexity.ai/settings/api",
    webHosts: ["www.perplexity.ai", "perplexity.ai", "docs.perplexity.ai"],
  },
  {
    id: "moonshot",
    name: "Moonshot / Kimi",
    kind: "llm",
    sdk: "moonshotai",
    defaultBaseURL: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k2-turbo-preview",
    models: ["kimi-k2-turbo-preview", "kimi-k2-0905-preview", "moonshot-v1-8k", "moonshot-v1-32k"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
    webHosts: ["platform.moonshot.cn", "platform.moonshot.ai", "kimi.moonshot.cn", "www.kimi.com", "kimi.com"],
  },
  {
    id: "zhipu",
    name: "智谱 GLM (Zhipu)",
    kind: "llm",
    sdk: "openai-compatible",
    defaultBaseURL: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    models: ["glm-4-flash", "glm-4-air", "glm-4.5-air", "glm-4-plus"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    webHosts: ["bigmodel.cn", "www.bigmodel.cn", "chatglm.cn"],
  },
  {
    id: "dashscope",
    name: "通义千问 / 阿里云百炼 (DashScope)",
    kind: "llm",
    sdk: "alibaba",
    defaultBaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-flash"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://bailian.console.aliyun.com/",
    webHosts: ["bailian.console.aliyun.com", "dashscope.console.aliyun.com", "help.aliyun.com", "tongyi.aliyun.com"],
  },
  {
    id: "siliconflow",
    name: "硅基流动 SiliconFlow",
    kind: "llm",
    sdk: "openai-compatible",
    defaultBaseURL: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    models: ["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3", "THUDM/glm-4-9b-chat"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://cloud.siliconflow.cn/account/ak",
    webHosts: ["cloud.siliconflow.cn", "docs.siliconflow.cn", "siliconflow.cn"],
  },
  {
    id: "doubao",
    name: "火山引擎豆包 (Volcengine Ark)",
    kind: "llm",
    sdk: "openai-compatible",
    defaultBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-2-0-mini-260428",
    models: ["doubao-seed-2-0-mini-260428", "doubao-seed-2-0-lite-260428", "doubao-seed-2-1-lite-260915", "doubao-seed-2-1-turbo-260628", "doubao-seed-2-1-pro-260915"],
    requiresKey: true,
    defaultTemperature: T,
    docsUrl: "https://console.volcengine.com/ark",
    webHosts: ["console.volcengine.com", "www.volcengine.com", "www.doubao.com"],
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    kind: "llm",
    sdk: "azure",
    defaultBaseURL: "",
    defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4o-mini"],
    requiresKey: true,
    requiresBaseURL: true,
    defaultTemperature: T,
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/",
    webHosts: ["portal.azure.com", "ai.azure.com", "oai.azure.com", "learn.microsoft.com"],
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    nameKey: "providerLocal",
    kind: "llm",
    sdk: "openai-compatible",
    defaultBaseURL: "http://localhost:1234/v1",
    defaultModel: "qwen2.5-7b-instruct",
    models: ["qwen2.5-7b-instruct"],
    requiresKey: false,
    defaultTemperature: T,
    docsUrl: "https://lmstudio.ai/",
  },
  {
    id: "custom",
    name: "OpenAI-compatible",
    nameKey: "providerCustom",
    kind: "llm",
    sdk: "openai-compatible",
    defaultBaseURL: "",
    defaultModel: "",
    models: [],
    requiresKey: false,
    requiresBaseURL: true,
    defaultTemperature: T,
  },
]

export const DEFAULT_PROVIDER_ID = "google-free"

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}

export function isAiProvider(preset: ProviderPreset | undefined): boolean {
  return preset?.kind === "llm"
}

/** The tier of a service: the dictionary, a machine translator or an AI service. */
export function tierOf(preset: ProviderPreset): Tier {
  if (preset.kind === "dictionary") return "dictionary"
  return preset.kind === "llm" ? "ai" : "machine"
}

/** Name shown in the interface: brand names stay as they are, "(free)" and similar are translated. */
export function providerDisplayName(preset: ProviderPreset, i18n: I18n = getI18n()): string {
  return preset.nameKey ? i18n.t(preset.nameKey, [preset.name]) : preset.name
}

/** Hosts of every preset's web console, documentation or chat app. */
const KNOWN_WEB_HOSTS = new Set(PROVIDER_PRESETS.flatMap((p) => p.webHosts ?? []))

export function isKnownWebHost(host: string): boolean {
  return KNOWN_WEB_HOSTS.has(host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, ""))
}

/** Host of a URL (DeepLX {{apiKey}} placeholders allowed), or "" when it cannot be parsed. */
export function urlHost(value: string | undefined): string {
  if (!value) return ""
  try {
    return new URL(value.replaceAll("{{apiKey}}", "key")).host
  } catch {
    return ""
  }
}

export type BaseUrlIssue = { kind: "invalid" } | { kind: "webPage"; host: string }

/**
 * Light check of an endpoint typed by the user. Empty means "preset default"
 * and passes. Flags malformed URLs and hosts that are known to serve a web
 * console or documentation instead of the API.
 */
export function checkBaseURL(value: string): BaseUrlIssue | null {
  const v = value.trim()
  if (!v) return null
  let url: URL
  try {
    url = new URL(v.replaceAll("{{apiKey}}", "key"))
  } catch {
    return { kind: "invalid" }
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname) return { kind: "invalid" }
  if (isKnownWebHost(url.hostname)) return { kind: "webPage", host: url.hostname }
  return null
}

/** Endpoints are the same when they differ only in host case or trailing slashes. */
export function sameEndpoint(a: string, b: string): boolean {
  const norm = (value: string) => {
    const t = value.trim().replace(/\/+$/, "")
    try {
      const u = new URL(t)
      return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}${u.search}`
    } catch {
      return t
    }
  }
  return norm(a) === norm(b)
}
