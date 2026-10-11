import { LocalizedError } from "./errors"
import { hashText } from "./hash"
import { baseLang, LANGUAGES } from "./languages"
import { matchUiLocale, normalizeUiLanguageSetting, type UiLanguageSetting } from "./locales"
import { DEFAULT_PROVIDER_ID, getPreset, isAiProvider, PROVIDER_PRESETS, type ProviderPreset } from "./providers"

export type DisplayMode = "bilingual" | "translation-only"
const STYLE_PRESETS = ["border", "dashed", "highlight", "plain"] as const
export type StylePreset = (typeof STYLE_PRESETS)[number]

/** Per-provider user configuration. Empty strings fall back to preset defaults. */
export interface ProviderConfig {
  /** Added by the user: listed in the service selectors. */
  enabled: boolean
  apiKey: string
  baseURL: string
  model: string
  /** null = do not send a temperature. undefined = use preset default. */
  temperature?: number | null
  /** AI services: let the model reason before answering. Off by default: slower and costlier for translation. */
  thinking?: boolean
  /** Microsoft Translator: "free" (default) uses the Edge endpoints; "key" calls Azure Translator with apiKey, region and baseURL. */
  mode?: MicrosoftMode
  /** Microsoft Translator, key mode: Azure region of the resource; empty for a global resource. */
  region?: string
}

type MicrosoftMode = "free" | "key"

export function emptyProviderConfig(): ProviderConfig {
  return { enabled: false, apiKey: "", baseURL: "", model: "" }
}

interface BatchSettings {
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

interface StyleSettings {
  preset: StylePreset
  /** CSS color for border / highlight. */
  color: string
  /** 0.3 – 1, opacity of the translated text. */
  opacity: number
  /** Font size relative to original, e.g. 0.95. */
  fontScale: number
}

interface RaceSettings {
  /** With an AI service, also ask a fast service and show its result until the AI result arrives. */
  enabled: boolean
  /** A non-AI service: Google, Microsoft or DeepLX. */
  fastProviderId: string
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
  race: RaceSettings
  /** AI services only: translate with the whole message as context. */
  precise: { enabled: boolean }
  batch: BatchSettings
  cache: { enabled: boolean; maxEntries: number }
  style: StyleSettings
}

export const SETTINGS_KEY = "settings"

/** Target language for a fresh installation: the interface language when it is a target language, else English. */
export function defaultTargetLang(uiLang?: string): string {
  const base = baseLang(uiLang ?? "")
  if (base === "zh") return matchUiLocale(uiLang) === "zh_TW" ? "zh-TW" : "zh-CN"
  return LANGUAGES.find((l) => l.code === base)?.code ?? "en"
}

export function createDefaultSettings(uiLang?: string): Settings {
  const providers: Record<string, ProviderConfig> = {}
  for (const p of PROVIDER_PRESETS) {
    const cfg = emptyProviderConfig()
    cfg.enabled = addedByDefault(p, cfg)
    providers[p.id] = cfg
  }
  return {
    uiLanguage: "auto",
    targetLang: defaultTargetLang(uiLang),
    mode: "bilingual",
    autoTranslate: false,
    activeProviderId: DEFAULT_PROVIDER_ID,
    providers,
    systemPrompt: "",
    race: { enabled: false, fastProviderId: DEFAULT_PROVIDER_ID },
    precise: { enabled: false },
    batch: { batchDelayMs: 50, maxCharsPerBatch: 3000, maxItemsPerBatch: 30, concurrency: 4, maxRetries: 3, llmBatchEnabled: true },
    cache: { enabled: true, maxEntries: 5000 },
    style: { preset: "border", color: "#4c8bf5", opacity: 0.85, fontScale: 1 },
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
    const next: ProviderConfig = {
      enabled: false,
      apiKey: typeof cfg.apiKey === "string" ? cfg.apiKey : "",
      baseURL: typeof cfg.baseURL === "string" ? cfg.baseURL : "",
      model: typeof cfg.model === "string" ? cfg.model : "",
      ...(cfg.temperature === null || typeof cfg.temperature === "number"
        ? { temperature: cfg.temperature }
        : {}),
      ...(cfg.thinking === true ? { thinking: true } : {}),
      ...(cfg.mode === "key" ? { mode: "key" as const } : {}),
      ...(typeof cfg.region === "string" && cfg.region ? { region: cfg.region } : {}),
    }
    // Settings saved before 1.2.0 have no "enabled": derive it from what the user configured.
    const preset = getPreset(id)
    next.enabled = typeof cfg.enabled === "boolean" ? cfg.enabled : preset ? addedByDefault(preset, next) : false
    providers[id] = next
  }
  const b = (s.batch ?? {}) as Partial<BatchSettings>
  const st = (s.style ?? {}) as Partial<StyleSettings>
  const fast = getPreset(String(s.race?.fastProviderId))
  const settings: Settings = {
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
    race: {
      enabled: s.race?.enabled === true,
      fastProviderId: fast && !isAiProvider(fast) ? fast.id : d.race.fastProviderId,
    },
    precise: { enabled: s.precise?.enabled === true },
    batch: {
      batchDelayMs: num(b.batchDelayMs, d.batch.batchDelayMs, 0, 2000),
      maxCharsPerBatch: num(b.maxCharsPerBatch, d.batch.maxCharsPerBatch, 200, 50000),
      maxItemsPerBatch: num(b.maxItemsPerBatch, d.batch.maxItemsPerBatch, 1, 200),
      concurrency: num(b.concurrency, d.batch.concurrency, 1, 20),
      maxRetries: num(b.maxRetries, d.batch.maxRetries, 0, 10),
      llmBatchEnabled: b.llmBatchEnabled !== false,
    },
    cache: {
      enabled: s.cache?.enabled !== false,
      maxEntries: num(s.cache?.maxEntries, d.cache.maxEntries, 0, 100000),
    },
    style: {
      preset: STYLE_PRESETS.includes(st.preset as StylePreset) ? (st.preset as StylePreset) : d.style.preset,
      color: typeof st.color === "string" && /^#[0-9a-f]{3,8}$/i.test(st.color) ? st.color : d.style.color,
      opacity: num(st.opacity, d.style.opacity, 0.3, 1),
      fontScale: num(st.fontScale, d.style.fontScale, 0.7, 1.5),
    },
  }
  addProvidersInUse(settings)
  return settings
}

/**
 * Whether a provider counts as added when the settings carry no explicit
 * choice: the free translators always; DeepLX once it has an endpoint; AI
 * services once they have a key, keyless ones (Ollama, LM Studio, custom)
 * once the user changed their configuration.
 */
export function addedByDefault(preset: ProviderPreset, cfg: ProviderConfig): boolean {
  switch (preset.kind) {
    case "google":
    case "microsoft":
      return true
    case "deeplx":
      return Boolean(cfg.baseURL)
    case "llm":
      return Boolean(cfg.apiKey) || (!preset.requiresKey && Boolean(cfg.baseURL || cfg.model || cfg.temperature !== undefined))
  }
}

/** Services the user added, in preset order: the only ones offered by the service selectors. */
export function addedProviders(settings: Settings): ProviderPreset[] {
  return PROVIDER_PRESETS.filter((p) => settings.providers[p.id]?.enabled)
}

/** Why a provider cannot be removed, or null when it can. */
export function removalBlocker(settings: Settings, providerId: string): "active" | "race" | null {
  if (providerId === settings.activeProviderId) return "active"
  if (settings.race.enabled && providerId === settings.race.fastProviderId) return "race"
  return null
}

/** The current service, and the fast service while race mode is on, are always added. */
export function addProvidersInUse(settings: Settings): void {
  const inUse = settings.race.enabled ? [settings.activeProviderId, settings.race.fastProviderId] : [settings.activeProviderId]
  for (const id of inUse) {
    settings.providers[id] ??= emptyProviderConfig()
    settings.providers[id].enabled = true
  }
}

/** Resolved provider configuration with preset defaults applied. */
export interface ResolvedProvider {
  id: string
  apiKey: string
  baseURL: string
  model: string
  temperature: number | null
  thinking: boolean
  /** Microsoft Translator only; always "free" for other services. */
  mode: MicrosoftMode
  region: string
}

export function resolveProvider(settings: Settings, providerId: string): ResolvedProvider {
  return resolveProviderConfig(providerId, settings.providers[providerId] ?? emptyProviderConfig())
}

export function resolveProviderConfig(providerId: string, cfg: Omit<ProviderConfig, "enabled">): ResolvedProvider {
  const preset = getPreset(providerId)
  if (!preset) throw new LocalizedError("errUnknownProvider", [providerId])
  return {
    id: providerId,
    apiKey: cfg.apiKey.trim(),
    baseURL: (cfg.baseURL.trim() || preset.defaultBaseURL).replace(/\/+$/, ""),
    model: cfg.model.trim() || preset.defaultModel,
    temperature: cfg.temperature === undefined ? preset.defaultTemperature : cfg.temperature,
    thinking: cfg.thinking === true,
    mode: preset.kind === "microsoft" && cfg.mode === "key" ? "key" : "free",
    region: (cfg.region ?? "").trim(),
  }
}

/** Settings that content scripts may see. Never contains API keys. */
export interface PublicSettings {
  uiLanguage: UiLanguageSetting
  targetLang: string
  mode: DisplayMode
  autoTranslate: boolean
  activeProviderId: string
  /** Identifies provider, model, prompt and precise mode, so the content script knows when to re-translate. */
  providerSignature: string
  /** Precise mode applies: the content script sends the message text as context. */
  precise: boolean
  style: StyleSettings
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const r = resolveProvider(settings, settings.activeProviderId)
  const precise = settings.precise.enabled && isAiProvider(getPreset(r.id))
  return {
    uiLanguage: settings.uiLanguage,
    targetLang: settings.targetLang,
    mode: settings.mode,
    autoTranslate: settings.autoTranslate,
    activeProviderId: settings.activeProviderId,
    providerSignature: `${r.id}|${r.model}|${r.baseURL}|${hashText(settings.systemPrompt)}|${precise ? "precise" : ""}`,
    precise,
    style: settings.style,
  }
}
