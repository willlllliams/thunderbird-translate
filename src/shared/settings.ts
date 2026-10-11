import { LocalizedError } from "./errors"
import { hashText } from "./hash"
import { baseLang, LANGUAGES } from "./languages"
import { normalizeUiLanguageSetting, type UiLanguageSetting } from "./locales"
import { DEFAULT_PROVIDER_ID, getPreset, PROVIDER_PRESETS } from "./providers"

export type DisplayMode = "bilingual" | "translation-only"
export type StylePreset = "border" | "dashed" | "highlight" | "plain"

/** Per-provider user configuration. Empty strings fall back to preset defaults. */
export interface ProviderConfig {
  apiKey: string
  baseURL: string
  model: string
  /** null = do not send a temperature. undefined = use preset default. */
  temperature?: number | null
}

export interface BatchSettings {
  /** Window for collecting paragraphs into one request (ms). */
  batchDelayMs: number
  /** Upper bound on characters per merged request. */
  maxCharsPerBatch: number
  /** Upper bound on paragraphs per merged request. */
  maxItemsPerBatch: number
  /** Concurrent requests to the provider. */
  concurrency: number
  /** Retries for retryable failures (429, 5xx, network). */
  maxRetries: number
  /** Merge paragraphs into one LLM call. Off = one call per paragraph. */
  llmBatchEnabled: boolean
}

export interface StyleSettings {
  preset: StylePreset
  /** CSS color for border / highlight. */
  color: string
  /** 0.3 – 1, opacity of the translated text. */
  opacity: number
  /** Font size relative to original, e.g. 0.95. */
  fontScale: number
}

export interface Settings {
  /** Interface language: "auto" follows Thunderbird. */
  uiLanguage: UiLanguageSetting
  targetLang: string
  mode: DisplayMode
  autoTranslate: boolean
  activeProviderId: string
  providers: Record<string, ProviderConfig>
  /** Custom system prompt; empty = built-in. `{{to}}` is the target language. */
  systemPrompt: string
  batch: BatchSettings
  cache: { enabled: boolean; maxEntries: number }
  style: StyleSettings
}

export const SETTINGS_KEY = "settings"

export const DEFAULT_BATCH: BatchSettings = {
  batchDelayMs: 50,
  maxCharsPerBatch: 3000,
  maxItemsPerBatch: 30,
  concurrency: 4,
  maxRetries: 3,
  llmBatchEnabled: true,
}

export const DEFAULT_STYLE: StyleSettings = {
  preset: "border",
  color: "#4c8bf5",
  opacity: 0.85,
  fontScale: 1,
}

/** Target language for a fresh installation: the interface language when it is a target language, else English. */
export function defaultTargetLang(uiLang?: string): string {
  const lang = (uiLang ?? "").replace(/_/g, "-").toLowerCase()
  const base = baseLang(lang)
  if (base === "zh") {
    return lang.split("-").some((p) => p === "tw" || p === "hk" || p === "mo" || p === "hant") ? "zh-TW" : "zh-CN"
  }
  return LANGUAGES.find((l) => l.code === base)?.code ?? "en"
}

export function createDefaultSettings(uiLang?: string): Settings {
  const providers: Record<string, ProviderConfig> = {}
  for (const p of PROVIDER_PRESETS) {
    providers[p.id] = { apiKey: "", baseURL: "", model: "" }
  }
  return {
    uiLanguage: "auto",
    targetLang: defaultTargetLang(uiLang),
    mode: "bilingual",
    autoTranslate: false,
    activeProviderId: DEFAULT_PROVIDER_ID,
    providers,
    systemPrompt: "",
    batch: { ...DEFAULT_BATCH },
    cache: { enabled: true, maxEntries: 5000 },
    style: { ...DEFAULT_STYLE },
  }
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Merge stored (possibly partial or outdated) settings over defaults and clamp values. */
export function normalizeSettings(stored: unknown, uiLang?: string): Settings {
  const d = createDefaultSettings(uiLang)
  if (!stored || typeof stored !== "object") return d
  const s = stored as Partial<Settings>
  const providers = { ...d.providers }
  for (const [id, cfg] of Object.entries(s.providers ?? {})) {
    if (!cfg || typeof cfg !== "object") continue
    providers[id] = {
      apiKey: typeof cfg.apiKey === "string" ? cfg.apiKey : "",
      baseURL: typeof cfg.baseURL === "string" ? cfg.baseURL : "",
      model: typeof cfg.model === "string" ? cfg.model : "",
      ...(cfg.temperature === null || typeof cfg.temperature === "number"
        ? { temperature: cfg.temperature }
        : {}),
    }
  }
  const b = (s.batch ?? {}) as Partial<BatchSettings>
  const st = (s.style ?? {}) as Partial<StyleSettings>
  return {
    uiLanguage: normalizeUiLanguageSetting(s.uiLanguage),
    targetLang: typeof s.targetLang === "string" && s.targetLang ? s.targetLang : d.targetLang,
    mode: s.mode === "translation-only" ? "translation-only" : "bilingual",
    autoTranslate: s.autoTranslate === true,
    activeProviderId:
      typeof s.activeProviderId === "string" && getPreset(s.activeProviderId)
        ? s.activeProviderId
        : d.activeProviderId,
    providers,
    systemPrompt: typeof s.systemPrompt === "string" ? s.systemPrompt : "",
    batch: {
      batchDelayMs: num(b.batchDelayMs, DEFAULT_BATCH.batchDelayMs, 0, 2000),
      maxCharsPerBatch: num(b.maxCharsPerBatch, DEFAULT_BATCH.maxCharsPerBatch, 200, 50000),
      maxItemsPerBatch: num(b.maxItemsPerBatch, DEFAULT_BATCH.maxItemsPerBatch, 1, 200),
      concurrency: num(b.concurrency, DEFAULT_BATCH.concurrency, 1, 20),
      maxRetries: num(b.maxRetries, DEFAULT_BATCH.maxRetries, 0, 10),
      llmBatchEnabled: b.llmBatchEnabled !== false,
    },
    cache: {
      enabled: s.cache?.enabled !== false,
      maxEntries: num(s.cache?.maxEntries, 5000, 0, 100000),
    },
    style: {
      preset: (["border", "dashed", "highlight", "plain"] as const).includes(st.preset as StylePreset)
        ? (st.preset as StylePreset)
        : DEFAULT_STYLE.preset,
      color: typeof st.color === "string" && /^#[0-9a-f]{3,8}$/i.test(st.color) ? st.color : DEFAULT_STYLE.color,
      opacity: num(st.opacity, DEFAULT_STYLE.opacity, 0.3, 1),
      fontScale: num(st.fontScale, DEFAULT_STYLE.fontScale, 0.7, 1.5),
    },
  }
}

/** Resolved provider configuration with preset defaults applied. */
export interface ResolvedProvider {
  id: string
  apiKey: string
  baseURL: string
  model: string
  temperature: number | null
}

export function resolveProvider(settings: Settings, providerId: string): ResolvedProvider {
  const preset = getPreset(providerId)
  if (!preset) throw new LocalizedError("errUnknownProvider", [providerId])
  const cfg = settings.providers[providerId] ?? { apiKey: "", baseURL: "", model: "" }
  return resolveProviderConfig(providerId, cfg)
}

export function resolveProviderConfig(providerId: string, cfg: ProviderConfig): ResolvedProvider {
  const preset = getPreset(providerId)
  if (!preset) throw new LocalizedError("errUnknownProvider", [providerId])
  return {
    id: providerId,
    apiKey: cfg.apiKey.trim(),
    baseURL: (cfg.baseURL.trim() || preset.defaultBaseURL).replace(/\/+$/, ""),
    model: cfg.model.trim() || preset.defaultModel,
    temperature: cfg.temperature === undefined ? preset.defaultTemperature : cfg.temperature,
  }
}

/** Settings that content scripts may see. Never contains API keys. */
export interface PublicSettings {
  uiLanguage: UiLanguageSetting
  targetLang: string
  mode: DisplayMode
  autoTranslate: boolean
  activeProviderId: string
  /** Identifies provider+model, so the content script knows when to re-translate. */
  providerSignature: string
  style: StyleSettings
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const r = resolveProvider(settings, settings.activeProviderId)
  return {
    uiLanguage: settings.uiLanguage,
    targetLang: settings.targetLang,
    mode: settings.mode,
    autoTranslate: settings.autoTranslate,
    activeProviderId: settings.activeProviderId,
    providerSignature: `${r.id}|${r.model}|${r.baseURL}|${hashText(settings.systemPrompt)}`,
    style: settings.style,
  }
}
