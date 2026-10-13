import { LocalizedError } from "./errors"
import { hashText } from "./hash"
import { patternHost, providerOrigin } from "./hosts"
import { appLang, LANGUAGES, languageTag } from "./languages"
import { normalizeUiLanguageSetting, type UiLanguageSetting } from "./locales"
import { DEFAULT_PROMPTS, PROMPT_KINDS, type PromptKind, promptText } from "./prompts"
import { DEFAULT_PROVIDER_ID, getPreset, isAiProvider, PROVIDER_PRESETS, type ProviderPreset, type Tier, TIERS, tierOf } from "./providers"

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
  /** Upper bound on characters per merged request; a longer paragraph is split at sentence boundaries. */
  maxCharsPerBatch: number
  /** Upper bound on paragraphs per merged request. */
  maxItemsPerBatch: number
  /** Concurrent requests to the provider. */
  concurrency: number
  /** Retries for retryable failures (429, 5xx, network, timeout). */
  maxRetries: number
  /** A request without an answer after this many seconds fails (and is retried). */
  timeoutSeconds: number
  /** Merge paragraphs into one LLM call. Off = one call per paragraph. */
  llmBatchEnabled: boolean
}

interface StyleSettings {
  preset: StylePreset
  /** CSS color for border / highlight. */
  color: string
  /** Colour of the translated text; "" = the colour of the message text. */
  textColor: string
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
  /** Offline service and language pair ("dictionary:ja>zh-Hans", "bergamot:ja>zh-Hans") for which a message shows no notice about missing dictionary packs or offline models. */
  offlineMutedPairs: string[]
  /**
   * Online services the user allowed to receive the text of messages, by id. A content script asks once per service
   * before it first sends message text there; the settings page lists them and takes them back.
   */
  onlineConsent: string[]
  batch: BatchSettings
  cache: { enabled: boolean; maxEntries: number }
  style: StyleSettings
}

export const SETTINGS_KEY = "settings"

/** Release of the dictionary packs on GitHub; the settings page can point to another one. */
const DEFAULT_DICT_TAG = "dicts-v1"

const DEFAULT_TIERS: TierSettings = { dictionary: null, machine: DEFAULT_PROVIDER_ID, ai: null }

/** Target language for a fresh installation: the interface language when it is a target language, else English. */
export function defaultTargetLang(uiLang?: string): string {
  const code = appLang(languageTag(uiLang ?? ""))
  return LANGUAGES.some((l) => l.code === code) ? code : "en"
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
    prompts: { bilingual: "", translationOnly: "", precise: "" },
    precise: { enabled: false },
    dictionary: { releaseTag: DEFAULT_DICT_TAG },
    offlineMutedPairs: [],
    onlineConsent: [],
    batch: { batchDelayMs: 50, maxCharsPerBatch: 3000, maxItemsPerBatch: 30, concurrency: 4, maxRetries: 3, timeoutSeconds: 60, llmBatchEnabled: true },
    cache: { enabled: true, maxEntries: 5000 },
    style: { preset: "border", color: "#4c8bf5", textColor: "", opacity: 0.85, fontScale: 1 },
  }
}

/** Offline service and language pair of a muted notice: "dictionary:ja>zh-Hans", "bergamot:ja>zh-Hans". */
const MUTED_KEY = /^(dictionary|bergamot):[A-Za-z-]{2,12}>[A-Za-z-]{2,12}$/

const isColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value)

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

/** The built-in system prompt of 1.0 – 1.3, for every kind. */
const PROMPT_1_0 = `You are a professional translator working on email messages.
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

/**
 * Whether `text` is a built-in prompt of some release, the current one
 * included: a stored copy of one of them is not the user's own prompt. A
 * release that changes DEFAULT_PROMPTS adds the prompts it replaces here.
 */
const isBuiltInPrompt = (kind: PromptKind, text: string) => [PROMPT_1_0, DEFAULT_PROMPTS[kind]].includes(text.trim())

/**
 * Prompts from stored settings; empty stands for the built-in prompt, so a
 * new release brings its improved prompts to everyone who did not write
 * their own. A custom system prompt of 1.3 and earlier becomes the prompt of
 * both display modes.
 */
function normalizePrompts(stored: Partial<Settings> & LegacySettings): Record<PromptKind, string> {
  const prompts: Record<PromptKind, string> = { bilingual: "", translationOnly: "", precise: "" }
  const own = (kind: PromptKind, value: unknown) => (typeof value === "string" && value.trim() && !isBuiltInPrompt(kind, value) ? value : "")
  if (stored.prompts && typeof stored.prompts === "object") {
    for (const kind of PROMPT_KINDS) prompts[kind] = own(kind, (stored.prompts as Partial<Record<PromptKind, unknown>>)[kind])
  } else {
    prompts.bilingual = own("bilingual", stored.systemPrompt)
    prompts.translationOnly = own("translationOnly", stored.systemPrompt)
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
    targetLang: LANGUAGES.some((l) => l.code === s.targetLang) ? (s.targetLang as string) : d.targetLang,
    mode: s.mode === "translation-only" ? "translation-only" : "bilingual",
    autoTranslate: s.autoTranslate === true,
    tiers: normalizeTiers(s),
    providers,
    prompts: normalizePrompts(s),
    precise: { enabled: s.precise?.enabled === true },
    dictionary: { releaseTag: tag || d.dictionary.releaseTag },
    offlineMutedPairs: Array.isArray(s.offlineMutedPairs) ? [...new Set(s.offlineMutedPairs.filter((p): p is string => typeof p === "string" && MUTED_KEY.test(p)))] : [],
    onlineConsent: Array.isArray(s.onlineConsent) ? [...new Set(s.onlineConsent.filter((id): id is string => typeof id === "string" && isOnlineService(id)))] : [],
    batch: {
      batchDelayMs: num(b.batchDelayMs, d.batch.batchDelayMs, 0, 2000),
      maxCharsPerBatch: num(b.maxCharsPerBatch, d.batch.maxCharsPerBatch, 200, 50000),
      maxItemsPerBatch: num(b.maxItemsPerBatch, d.batch.maxItemsPerBatch, 1, 200),
      concurrency: num(b.concurrency, d.batch.concurrency, 1, 20),
      maxRetries: num(b.maxRetries, d.batch.maxRetries, 0, 10),
      timeoutSeconds: num(b.timeoutSeconds, d.batch.timeoutSeconds, 5, 600),
      llmBatchEnabled: b.llmBatchEnabled !== false,
    },
    cache: {
      enabled: s.cache?.enabled !== false,
      maxEntries: num(s.cache?.maxEntries, d.cache.maxEntries, 0, 100000),
    },
    style: {
      preset: STYLE_PRESETS.includes(st.preset as StylePreset) ? (st.preset as StylePreset) : d.style.preset,
      color: isColor(st.color) ? st.color : d.style.color,
      // Settings saved before 1.9.0 have no text colour: the translation keeps the colour of the message.
      textColor: isColor(st.textColor) ? st.textColor : "",
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

/** What decides the result of a service, besides the text, the languages and the installed offline data. */
export interface ResultInputs {
  provider: ResolvedProvider
  /** AI services: the prompt in use. */
  kind?: PromptKind
  /** AI services: the system prompt template of `kind`. */
  prompt?: string
  /**
   * Endpoint and Microsoft mode; for AI services also prompt kind, prompt,
   * thinking and temperature. Joined with line breaks, they are part of the cache
   * key of every translation (TranslationService) and of the signature of
   * the tier the content script compares (toPublicSettings), so both change
   * together. The order is fixed: stored cache keys depend on it.
   */
  parts: readonly unknown[]
}

/** The inputs that decide the result of `providerId` under `settings`; throws errUnknownProvider for an unknown service. */
export function resultInputs(settings: Settings, providerId: string): ResultInputs {
  const provider = resolveProvider(settings, providerId)
  const kind = isAiProvider(getPreset(providerId)) ? promptKindFor(settings) : undefined
  const prompt = kind ? promptText(settings.prompts, kind) : undefined
  const parts = [provider.baseURL, provider.mode, ...(kind ? [kind, prompt, provider.thinking, provider.temperature] : [])]
  return { provider, kind, prompt, parts }
}

/** Whether a service sends text over the network: every service except the dictionary and Bergamot. */
export function isOnlineService(providerId: string): boolean {
  const kind = getPreset(providerId)?.kind
  return kind !== undefined && kind !== "dictionary" && kind !== "bergamot"
}

/** An online service of a tier in use that the user has not allowed yet to receive message text: its id and the host it sends to. */
export interface ConsentNeed {
  id: string
  /** Host of the endpoint, without path or credentials; empty when the endpoint is not a URL. */
  host: string
}

/** The online services of the tiers in use that need the user's consent before message text goes to them, lowest tier first. */
export function consentNeeds(settings: Settings): ConsentNeed[] {
  const needs: ConsentNeed[] = []
  for (const tier of enabledTiers(settings.tiers)) {
    const id = settings.tiers[tier]!
    if (!isOnlineService(id) || settings.onlineConsent.includes(id)) continue
    const origin = providerOrigin(resolveProvider(settings, id))
    needs.push({ id, host: origin ? patternHost(origin) : "" })
  }
  return needs
}

/** Settings that content scripts may see. Never contains API keys, nor endpoints, which may hold a token; only the host of a service that awaits consent. */
export interface PublicSettings {
  uiLanguage: UiLanguageSetting
  sourceLang: string
  targetLang: string
  mode: DisplayMode
  autoTranslate: boolean
  /** Tiers in use, lowest first. */
  tiers: Tier[]
  /**
   * Service, model and a hash of the other inputs of the result
   * (ResultInputs.parts) of each tier in use. When the signature of a tier
   * changes, the content script requests that tier again and keeps the
   * results of the others.
   */
  signatures: Partial<Record<Tier, string>>
  /** Precise mode applies: the content script sends the message text as context. */
  precise: boolean
  style: StyleSettings
  offlineMutedPairs: string[]
  /** The online services that need consent before the message text goes to them, with their hosts (consentNeeds()). */
  consent: ConsentNeed[]
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const signatures: Partial<Record<Tier, string>> = {}
  for (const tier of enabledTiers(settings.tiers)) {
    const { provider, parts } = resultInputs(settings, settings.tiers[tier]!)
    signatures[tier] = `${provider.id}|${provider.model}|${hashText(parts.join("\n"))}`
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
    offlineMutedPairs: settings.offlineMutedPairs,
    consent: consentNeeds(settings),
  }
}
