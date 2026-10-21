import { LocalizedError } from "./errors"
import { hashText } from "./hash"
import { patternHost, providerOrigin } from "./hosts"
import { appLang, LANGUAGES, languageTag } from "./languages"
import { normalizeUiLanguageSetting, type UiLanguageSetting } from "./locales"
import { DEFAULT_PROMPTS, PROMPT_NAMES, type PromptKind, type PromptName, promptText } from "./prompts"
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
  /** Baidu and Youdao: the app ID (appid, appKey); apiKey holds the secret key. */
  appId?: string
  /** Baidu: the edition of the account, which sets the request size and the requests per second. */
  edition?: BaiduEdition
  /** DeepL: formality and the variants of English and Portuguese as target languages. */
  deepl?: DeeplOptions
}

type MicrosoftMode = "free" | "key"

export const BAIDU_EDITIONS = ["standard", "advanced", "premium"] as const
export type BaiduEdition = (typeof BAIDU_EDITIONS)[number]

export interface DeeplOptions {
  formality: "default" | "more" | "less"
  english: "EN-US" | "EN-GB"
  portuguese: "PT-BR" | "PT-PT"
}

export const DEFAULT_DEEPL: DeeplOptions = { formality: "default", english: "EN-US", portuguese: "PT-BR" }

/** Endpoint of the keys of DeepL's free plan, which end in ":fx". */
export const DEEPL_FREE_URL = "https://api-free.deepl.com"

/** The parts of a summary, in the order of the panel. */
export const SUMMARY_PARTS = ["summary", "actions", "questions", "dates"] as const
export type SummaryPart = (typeof SUMMARY_PARTS)[number]

/** Summary and to-dos of the message on screen. */
export interface SummarySettings {
  /** AI service of the summary; null = the service of the AI tier. */
  provider: string | null
  /** Model of the summary; "" = the model of the service. */
  model: string
  /** A "Summary" button above the message while it is translated. */
  inlineButton: boolean
  /** The parts the model is asked for and the panel shows. */
  parts: SummaryPart[]
  maxOutputTokens: number
  /** The panel opens expanded or collapsed. */
  display: "expanded" | "collapsed"
}

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
  /** Translate the subject of a message with its body, shown in a line above the body. */
  translateSubject: boolean
  /** Show the Markdown of AI translations formatted (shared/markdown.ts); off shows the text as the service wrote it. */
  renderMarkdown: boolean
  tiers: TierSettings
  providers: Record<string, ProviderConfig>
  /** System prompts of the AI tier and of the summary; `{{to}}` is the target language. Empty = default. */
  prompts: Record<PromptName, string>
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
  summary: SummarySettings
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
    translateSubject: true,
    renderMarkdown: true,
    tiers: { ...DEFAULT_TIERS },
    providers,
    prompts: { bilingual: "", translationOnly: "", precise: "", summary: "" },
    precise: { enabled: false },
    dictionary: { releaseTag: DEFAULT_DICT_TAG },
    offlineMutedPairs: [],
    onlineConsent: [],
    summary: { provider: null, model: "", inlineButton: false, parts: [...SUMMARY_PARTS], maxOutputTokens: 800, display: "expanded" },
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
const isBuiltInPrompt = (kind: PromptName, text: string) => [PROMPT_1_0, DEFAULT_PROMPTS[kind]].includes(text.trim())

/**
 * Prompts from stored settings; empty stands for the built-in prompt, so a
 * new release brings its improved prompts to everyone who did not write
 * their own. A custom system prompt of 1.3 and earlier becomes the prompt of
 * both display modes.
 */
function normalizePrompts(stored: Partial<Settings> & LegacySettings): Record<PromptName, string> {
  const prompts: Record<PromptName, string> = { bilingual: "", translationOnly: "", precise: "", summary: "" }
  const own = (kind: PromptName, value: unknown) => (typeof value === "string" && value.trim() && !isBuiltInPrompt(kind, value) ? value : "")
  if (stored.prompts && typeof stored.prompts === "object") {
    // Settings saved before 2.3.0 have no summary prompt, which stands for the built-in one.
    for (const kind of PROMPT_NAMES) prompts[kind] = own(kind, (stored.prompts as Partial<Record<PromptName, unknown>>)[kind])
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
      ...(typeof cfg.appId === "string" && cfg.appId ? { appId: cfg.appId } : {}),
      ...(BAIDU_EDITIONS.includes(cfg.edition as BaiduEdition) ? { edition: cfg.edition } : {}),
      ...(cfg.deepl && typeof cfg.deepl === "object" ? { deepl: normalizeDeepl(cfg.deepl) } : {}),
    }
    // Settings saved before 1.2.0 have no "enabled": derive it from what the user configured.
    const preset = getPreset(id)
    next.enabled = typeof cfg.enabled === "boolean" ? cfg.enabled : preset ? addedByDefault(preset, next) : false
    providers[id] = next
  }
  const b = (s.batch ?? {}) as Partial<BatchSettings>
  const sum = (s.summary ?? {}) as Partial<SummarySettings>
  const st = (s.style ?? {}) as Partial<StyleSettings>
  const tag = typeof s.dictionary?.releaseTag === "string" ? s.dictionary.releaseTag.trim() : ""
  const settings: Settings = {
    uiLanguage: normalizeUiLanguageSetting(s.uiLanguage),
    sourceLang: LANGUAGES.some((l) => l.code === s.sourceLang) ? (s.sourceLang as string) : "auto",
    targetLang: LANGUAGES.some((l) => l.code === s.targetLang) ? (s.targetLang as string) : d.targetLang,
    mode: s.mode === "translation-only" ? "translation-only" : "bilingual",
    autoTranslate: s.autoTranslate === true,
    // On unless switched off: settings saved before 2.1.0 have no such field.
    translateSubject: s.translateSubject !== false,
    // On unless switched off: settings saved before 2.2.0 have no such field.
    renderMarkdown: s.renderMarkdown !== false,
    tiers: normalizeTiers(s),
    providers,
    prompts: normalizePrompts(s),
    precise: { enabled: s.precise?.enabled === true },
    dictionary: { releaseTag: tag || d.dictionary.releaseTag },
    offlineMutedPairs: Array.isArray(s.offlineMutedPairs) ? [...new Set(s.offlineMutedPairs.filter((p): p is string => typeof p === "string" && MUTED_KEY.test(p)))] : [],
    onlineConsent: Array.isArray(s.onlineConsent) ? [...new Set(s.onlineConsent.filter((id): id is string => typeof id === "string" && isOnlineService(id)))] : [],
    // Settings saved before 2.3.0 have no summary settings: the defaults.
    summary: {
      provider: isAiProvider(getPreset(String(sum.provider))) ? (sum.provider as string) : null,
      model: typeof sum.model === "string" ? sum.model.trim() : "",
      inlineButton: sum.inlineButton === true,
      parts: Array.isArray(sum.parts) ? SUMMARY_PARTS.filter((part) => (sum.parts as unknown[]).includes(part)) : [...SUMMARY_PARTS],
      maxOutputTokens: num(sum.maxOutputTokens, d.summary.maxOutputTokens, 200, 4000),
      display: sum.display === "collapsed" ? "collapsed" : "expanded",
    },
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

/** DeepL options from stored settings; a missing or unknown value takes the default. */
function normalizeDeepl(stored: Partial<Record<keyof DeeplOptions, unknown>>): DeeplOptions {
  const pick = <T extends string>(value: unknown, values: readonly T[]) => (values.includes(value as T) ? (value as T) : values[0])
  return {
    formality: pick(stored.formality, ["default", "more", "less"]),
    english: pick(stored.english, ["EN-US", "EN-GB"]),
    portuguese: pick(stored.portuguese, ["PT-BR", "PT-PT"]),
  }
}

/**
 * Whether a provider counts as added when the settings carry no explicit
 * choice: the free translators always; DeepLX once it has an endpoint; the
 * other machine translators and AI services once they have a key, keyless ones (Ollama, LM Studio, custom)
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
    case "deepl":
    case "baidu":
    case "youdao":
    case "caiyun":
      return Boolean(cfg.apiKey)
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
  /** Baidu and Youdao. */
  appId: string
  /** Baidu; "standard" for other services. */
  edition: BaiduEdition
  /** DeepL; the defaults for other services. */
  deepl: DeeplOptions
}

export function resolveProvider(settings: Settings, providerId: string): ResolvedProvider {
  return resolveProviderConfig(providerId, settings.providers[providerId] ?? emptyProviderConfig())
}

export function resolveProviderConfig(providerId: string, cfg: Omit<ProviderConfig, "enabled">): ResolvedProvider {
  const preset = getPreset(providerId)
  if (!preset) throw new LocalizedError("errUnknownProvider", [providerId])
  const apiKey = cfg.apiKey.trim()
  const defaultBaseURL = preset.kind === "deepl" && apiKey.endsWith(":fx") ? DEEPL_FREE_URL : preset.defaultBaseURL
  return {
    id: providerId,
    apiKey,
    baseURL: (cfg.baseURL.trim() || defaultBaseURL).replace(/\/+$/, ""),
    model: cfg.model.trim() || preset.defaultModel,
    temperature: cfg.temperature === undefined ? preset.defaultTemperature : cfg.temperature,
    thinking: cfg.thinking === true,
    mode: preset.kind === "microsoft" && cfg.mode === "key" ? "key" : "free",
    region: (cfg.region ?? "").trim(),
    appId: (cfg.appId ?? "").trim(),
    edition: cfg.edition ?? "standard",
    deepl: cfg.deepl ?? DEFAULT_DEEPL,
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
   * thinking and temperature; for DeepL its formality and target variants. Joined with line breaks, they are part of the cache
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
  const { formality, english, portuguese } = provider.deepl
  const deepl = getPreset(providerId)?.kind === "deepl" ? [formality, english, portuguese] : []
  const parts = [provider.baseURL, provider.mode, ...(kind ? [kind, prompt, provider.thinking, provider.temperature] : []), ...deepl]
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

/** The consent `id` still needs before message text goes to it; null for an offline service and one already allowed. */
function consentNeed(settings: Settings, id: string): ConsentNeed | null {
  if (!isOnlineService(id) || settings.onlineConsent.includes(id)) return null
  const origin = providerOrigin(resolveProvider(settings, id))
  return { id, host: origin ? patternHost(origin) : "" }
}

/** The online services of the tiers in use that need the user's consent before message text goes to them, lowest tier first. */
export function consentNeeds(settings: Settings): ConsentNeed[] {
  return enabledTiers(settings.tiers).flatMap((tier) => consentNeed(settings, settings.tiers[tier]!) ?? [])
}

/** The AI service of the summary: the added service chosen for it, else the service of the AI tier; null without either. */
export function summaryProvider(settings: Settings): string | null {
  const chosen = settings.summary.provider
  return chosen && settings.providers[chosen]?.enabled ? chosen : settings.tiers.ai
}

/** Settings that content scripts may see. Never contains API keys, nor endpoints, which may hold a token; only the host of a service that awaits consent. */
export interface PublicSettings {
  uiLanguage: UiLanguageSetting
  sourceLang: string
  targetLang: string
  mode: DisplayMode
  autoTranslate: boolean
  /** The content script translates the subject of the message as well, in a line above the body. */
  translateSubject: boolean
  /** AI translations show their Markdown formatted; it decides only how a result is shown, so it is not part of any signature. */
  renderMarkdown: boolean
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
  /** Summary and to-dos: whether a service is there, the button above a translated message, the panel collapsed, and the consent its service still needs. */
  summary: { available: boolean; inlineButton: boolean; collapsed: boolean; consent: ConsentNeed | null }
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const signatures: Partial<Record<Tier, string>> = {}
  for (const tier of enabledTiers(settings.tiers)) {
    const { provider, parts } = resultInputs(settings, settings.tiers[tier]!)
    signatures[tier] = `${provider.id}|${provider.model}|${hashText(parts.join("\n"))}`
  }
  const summarizer = summaryProvider(settings)
  return {
    uiLanguage: settings.uiLanguage,
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
    mode: settings.mode,
    autoTranslate: settings.autoTranslate,
    translateSubject: settings.translateSubject,
    renderMarkdown: settings.renderMarkdown,
    tiers: enabledTiers(settings.tiers),
    signatures,
    precise: settings.precise.enabled && settings.tiers.ai !== null,
    style: settings.style,
    offlineMutedPairs: settings.offlineMutedPairs,
    consent: consentNeeds(settings),
    summary: {
      available: summarizer !== null,
      inlineButton: settings.summary.inlineButton,
      collapsed: settings.summary.display === "collapsed",
      consent: summarizer ? consentNeed(settings, summarizer) : null,
    },
  }
}
