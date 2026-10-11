import { LocalizedError } from "./errors"
import { hashText } from "./hash"
import { baseLang, LANGUAGES } from "./languages"
import { matchUiLocale, normalizeUiLanguageSetting, type UiLanguageSetting } from "./locales"
import { DEFAULT_PROMPTS, PROMPT_KINDS, type PromptKind, promptText } from "./prompts"
import { DEFAULT_PROVIDER_ID, getPreset, PROVIDER_PRESETS, type ProviderPreset, type Tier, TIERS, tierOf } from "./providers"

export type DisplayMode = "bilingual" | "translation-only"
const STYLE_PRESETS = ["border", "dashed", "highlight", "plain"] as const
export type StylePreset = (typeof STYLE_PRESETS)[number]

/** Per-provider user configuration. Empty strings fall back to preset defaults. */
export interface ProviderConfig {
  /** Added by the user: listed in the tier selectors. */
  enabled: boolean
  apiKey: string
  baseURL: string
  model: string
  /** null = do not send a temperature. undefined = use preset default. */
  temperature?: number | null
  /** AI services: let the model reason before answering. Off by default: slower and costlier for translation. */
  thinking?: boolean
  /** Microsoft Translator: "free" (default) uses the Edge endpoint; "key" calls Azure Translator with apiKey, region and baseURL. */
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

/** Service of each tier; null = the tier is not used. At least one tier is set. */
export type TierSettings = Record<Tier, string | null>

export interface Settings {
  /** Interface language: "auto" follows Thunderbird. */
  uiLanguage: UiLanguageSetting
  /** "auto" or a language code of LANGUAGES. */
  sourceLang: string
  targetLang: string
  mode: DisplayMode
  autoTranslate: boolean
  tiers: TierSettings
  providers: Record<string, ProviderConfig>
  /** System prompts of the AI tier; `{{to}}` is the target language. Empty = default. */
  prompts: Record<PromptKind, string>
  /** AI tier only: translate with the whole message as context. */
  precise: { enabled: boolean }
  /** Release tag on GitHub that holds the dictionary packs. */
  dictionary: { releaseTag: string }
  batch: BatchSettings
  cache: { enabled: boolean; maxEntries: number }
  style: StyleSettings
}

export const SETTINGS_KEY = "settings"

/** Release of the dictionary packs on GitHub; the settings page can point to another one. */
export const DEFAULT_DICT_TAG = "dicts-v1"

export const DEFAULT_TIERS: TierSettings = { dictionary: null, machine: DEFAULT_PROVIDER_ID, ai: null }

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
    sourceLang: "auto",
    targetLang: defaultTargetLang(uiLang),
    mode: "bilingual",
    autoTranslate: false,
    tiers: { ...DEFAULT_TIERS },
    providers,
    prompts: { ...DEFAULT_PROMPTS },
    precise: { enabled: false },
    dictionary: { releaseTag: DEFAULT_DICT_TAG },
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

/** Fields of settings saved before 1.4.0: one current service, race mode and one system prompt. */
interface LegacySettings {
  activeProviderId?: unknown
  race?: { enabled?: unknown; fastProviderId?: unknown }
  systemPrompt?: unknown
}

/** The built-in system prompt before 1.4.0; a stored copy of it is not a custom prompt. */
const LEGACY_DEFAULT_PROMPT = `You are a professional translator working on email messages.
Translate the user's text into {{to}}.
Rules:
- Preserve the meaning, tone and level of politeness of the original email.
- Keep names, email addresses, URLs, numbers, dates, code and product names unchanged unless they have an established translation.
- Keep line breaks and list markers.
- If a passage is already in {{to}}, return it unchanged.
- Output only the translation. Do not add explanations, notes, quotes or labels.`

/** A service id when it exists and belongs to the tier, else null. */
function serviceOfTier(tier: Tier, id: unknown): string | null {
  const preset = getPreset(String(id))
  return preset && tierOf(preset) === tier ? preset.id : null
}

/**
 * Tiers from stored settings. Before 1.4.0 the settings held one current
 * service: an AI service becomes the AI tier, with the fast service of race
 * mode as machine tier; any other service becomes the machine tier.
 */
function normalizeTiers(stored: Partial<Settings> & LegacySettings): TierSettings {
  let tiers: TierSettings
  if (stored.tiers && typeof stored.tiers === "object") {
    const t = stored.tiers as Partial<Record<Tier, unknown>>
    tiers = { dictionary: serviceOfTier("dictionary", t.dictionary), machine: serviceOfTier("machine", t.machine), ai: serviceOfTier("ai", t.ai) }
  } else {
    tiers = { dictionary: null, machine: null, ai: null }
    const active = getPreset(String(stored.activeProviderId))
    if (active) tiers[tierOf(active)] = active.id
    if (tiers.ai && stored.race?.enabled === true) tiers.machine = serviceOfTier("machine", stored.race.fastProviderId) ?? DEFAULT_PROVIDER_ID
  }
  return tiersValid(tiers) ? tiers : { ...DEFAULT_TIERS }
}

/** Prompts from stored settings. A custom system prompt of 1.3 and earlier becomes the prompt of both display modes. */
function normalizePrompts(stored: Partial<Settings> & LegacySettings): Record<PromptKind, string> {
  const prompts = { ...DEFAULT_PROMPTS }
  if (stored.prompts && typeof stored.prompts === "object") {
    for (const kind of PROMPT_KINDS) {
      const value = (stored.prompts as Partial<Record<PromptKind, unknown>>)[kind]
      if (typeof value === "string") prompts[kind] = value
    }
  } else if (typeof stored.systemPrompt === "string" && stored.systemPrompt.trim() && stored.systemPrompt.trim() !== LEGACY_DEFAULT_PROMPT) {
    prompts.bilingual = stored.systemPrompt
    prompts.translationOnly = stored.systemPrompt
  }
  return prompts
}

/** Merge stored (possibly partial or outdated) settings over defaults and clamp values. */
export function normalizeSettings(stored: unknown, uiLang?: string): Settings {
  const d = createDefaultSettings(uiLang)
  if (!stored || typeof stored !== "object") return d
  const s = stored as Partial<Settings> & LegacySettings
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
  const tag = typeof s.dictionary?.releaseTag === "string" ? s.dictionary.releaseTag.trim() : ""
  const settings: Settings = {
    uiLanguage: normalizeUiLanguageSetting(s.uiLanguage),
    sourceLang: LANGUAGES.some((l) => l.code === s.sourceLang) ? (s.sourceLang as string) : "auto",
    targetLang: typeof s.targetLang === "string" && s.targetLang ? s.targetLang : d.targetLang,
    mode: s.mode === "translation-only" ? "translation-only" : "bilingual",
    autoTranslate: s.autoTranslate === true,
    tiers: normalizeTiers(s),
    providers,
    prompts: normalizePrompts(s),
    precise: { enabled: s.precise?.enabled === true },
    dictionary: { releaseTag: tag || d.dictionary.releaseTag },
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
 * once the user changed their configuration. The dictionary and the offline
 * translator need data the user installs, so they are added by hand.
 */
export function addedByDefault(preset: ProviderPreset, cfg: ProviderConfig): boolean {
  switch (preset.kind) {
    case "google":
    case "microsoft":
      return true
    case "dictionary":
    case "bergamot":
      return false
    case "deeplx":
      return Boolean(cfg.baseURL)
    case "llm":
      return Boolean(cfg.apiKey) || (!preset.requiresKey && Boolean(cfg.baseURL || cfg.model || cfg.temperature !== undefined))
  }
}

/** Services the user added, in preset order: the only ones offered by the tier selectors. */
export function addedProviders(settings: Settings): ProviderPreset[] {
  return PROVIDER_PRESETS.filter((p) => settings.providers[p.id]?.enabled)
}

/** At least one tier has a service. */
export function tiersValid(tiers: TierSettings): boolean {
  return TIERS.some((tier) => tiers[tier])
}

/** Tiers in use, lowest first. */
export function enabledTiers(tiers: TierSettings): Tier[] {
  return TIERS.filter((tier) => tiers[tier])
}

/** The tier that uses a provider, which therefore cannot be removed; null when it can. */
export function removalBlocker(settings: Settings, providerId: string): Tier | null {
  return TIERS.find((tier) => settings.tiers[tier] === providerId) ?? null
}

/** The services of the tiers are always added. */
export function addProvidersInUse(settings: Settings): void {
  for (const tier of TIERS) {
    const id = settings.tiers[tier]
    if (!id) continue
    settings.providers[id] ??= emptyProviderConfig()
    settings.providers[id].enabled = true
  }
}

/** Prompt of the AI tier: the precise prompt in precise mode, else the prompt of the display mode. */
export function promptKindFor(settings: Pick<Settings, "precise" | "mode">): PromptKind {
  if (settings.precise.enabled) return "precise"
  return settings.mode === "bilingual" ? "bilingual" : "translationOnly"
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
  sourceLang: string
  targetLang: string
  mode: DisplayMode
  autoTranslate: boolean
  /** Tiers in use, lowest first. */
  tiers: Tier[]
  /**
   * Service, model and, for the AI tier, prompt of each tier in use. When the
   * signature of a tier changes, the content script requests that tier again
   * and keeps the results of the others.
   */
  signatures: Partial<Record<Tier, string>>
  /** Precise mode applies: the content script sends the message text as context. */
  precise: boolean
  style: StyleSettings
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const signatures: Partial<Record<Tier, string>> = {}
  for (const tier of enabledTiers(settings.tiers)) {
    const r = resolveProvider(settings, settings.tiers[tier]!)
    let signature = `${r.id}|${r.model}|${r.baseURL}|${r.mode}`
    if (tier === "ai") {
      const kind = promptKindFor(settings)
      signature += `|${kind}:${hashText(promptText(settings.prompts, kind))}`
    }
    signatures[tier] = signature
  }
  return {
    uiLanguage: settings.uiLanguage,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    mode: settings.mode,
    autoTranslate: settings.autoTranslate,
    tiers: enabledTiers(settings.tiers),
    signatures,
    precise: settings.precise.enabled && settings.tiers.ai !== null,
    style: settings.style,
  }
}
