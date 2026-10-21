import { setStyleVars } from "../content/render"
import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n } from "../shared/i18n-ext"
import { normalizeUiLanguageSetting } from "../shared/locales"
import { type OfflineStatus, type OptionsPlace, type PageNotice, send } from "../shared/messages"
import { $, fillSelect, fillTierSelects, languageOptions, offlineStatus, onTierChange, showOfflineHint, showSaved, showSaveError, sourceLanguageOptions, uiLanguageOptions } from "../shared/page"
import { getPreset, PROVIDER_PRESETS, providerDisplayName, type ProviderPreset, type Tier, TIER_NAME_KEYS, TIERS, tierOf } from "../shared/providers"
import { addedProviders, addProvidersInUse, consentParts, type DisplayMode, enabledTiers, removalBlocker, resolveProvider, type Settings, SUMMARY_PARTS, summaryProvider } from "../shared/settings"
import { BergamotSection } from "./bergamot"
import { DictionarySection } from "./dictionaries"
import { button, h } from "../shared/dom"
import { loadSystemLanguages, recommendedFor } from "./offline-list"
import { ImageSettingsSection } from "./image-settings"
import { PromptEditor } from "./prompt-editor"
import { type PanelState, providerConfig, providerFields, providerTitle, testButton, testResult } from "./provider-panel"
import { SettingsSession } from "./session"
import { mountStyleControls } from "./style-controls"

let session: SettingsSession
/** Settings as edited on this page. */
let settings: Settings
let selectedProvider = ""
let dictionaries: DictionarySection
let bergamot: BergamotSection
let prompts: PromptEditor
let images: ImageSettingsSection
/** The service list shows the services of this tier; "" = all. */
let providerTier: Tier | "" = ""
/** What the selected offline services lack for the languages. */
let offline: OfflineStatus = {}

/** The tier selectors with the marks of the offline services, and the line under them. */
function fillTiers(): void {
  fillTierSelects(settings, false, offline)
  showOfflineHint($("offlineMissing"), settings, offline, goTo)
}

async function refreshOffline(): Promise<void> {
  offline = await offlineStatus(settings)
  fillTiers()
}

/** Show a place of the page: the offline lists filtered, the services of a tier. */
function goTo({ section, dictionaries: dict, bergamot: models, tier }: OptionsPlace): void {
  if (dict) $<HTMLInputElement>("dictFilter").value = dict.join(", ")
  if (models) $<HTMLInputElement>("bergamotFilter").value = models.join(", ")
  if (tier) showProviderTier(tier)
  dictionaries.render()
  bergamot.render()
  document.getElementById(section)?.scrollIntoView()
}

/** Show the services of one tier ("" = all), and one of them in the panel. */
function showProviderTier(tier: Tier | ""): void {
  providerTier = tier
  $<HTMLSelectElement>("providerTierFilter").value = tier
  const shown = PROVIDER_PRESETS.filter((p) => !tier || tierOf(p) === tier)
  if (!shown.some((p) => p.id === selectedProvider)) selectedProvider = (shown.find((p) => !settings.providers[p.id]?.enabled) ?? shown[0]).id
  renderProviderList()
  renderProviderPanel()
}

/** The muted notices about missing offline data, and the button that brings them back. */
function renderMuted(): void {
  const entries = settings.offlineMutedPairs.map((key) => {
    const [service, pair] = key.split(":")
    return t("mutedPairEntry", [service === "dictionary" ? t("tierDictionary") : "Bergamot", getI18n().pairName(pair)])
  })
  $("mutedPairs").textContent = entries.length > 0 ? t("mutedPairsList", [entries.join(", ")]) : t("mutedPairsNone")
  $<HTMLButtonElement>("clearMuted").disabled = entries.length === 0
}

/** The online services allowed to receive the text of messages and those allowed to receive their images, each with a button that takes the consent back. */
function renderConsent(): void {
  const list = (listId: string, key: "onlineConsent" | "imageConsent") => {
    const items = settings[key].map((entry) => {
      const { id, host } = consentParts(entry)
      const preset = getPreset(id)
      const name = preset ? providerDisplayName(preset) : id
      const revoke = button(
        t("buttonRevokeConsent"),
        () => {
          settings[key] = settings[key].filter((other) => other !== entry)
          renderConsent()
          session.save()
        },
        false,
        t(key === "onlineConsent" ? "tipRevokeConsent" : "tipRevokeImageConsent"),
      )
      return h("li", { className: "row" }, h("span", { text: host ? t("consentService", [name, host]) : name }), revoke)
    })
    $(listId).replaceChildren(...(items.length > 0 ? items : [h("li", { className: "hint", text: t("consentListNone") })]))
  }
  list("consentList", "onlineConsent")
  list("imageConsentList", "imageConsent")
}

/** The services the summary can use: the one of the AI tier, then every added AI service; under the model, the model of the service in use. */
function fillSummaryProviders(): void {
  const chosen = settings.summary.provider
  const services = addedProviders(settings).filter((p) => tierOf(p) === "ai")
  const value = chosen && settings.providers[chosen]?.enabled ? chosen : ""
  fillSelect($<HTMLSelectElement>("summaryProvider"), [new Option(t("summaryProviderTier"), ""), ...services.map((p) => new Option(providerDisplayName(p), p.id))], value)
  const id = summaryProvider(settings)
  $("summaryNone").hidden = id !== null
  $<HTMLInputElement>("summaryModel").placeholder = id ? resolveProvider(settings, id).model : ""
}

/** Changes made elsewhere were taken over: redraw what depends on them. */
function remoteChanged(before: Settings): void {
  const providerState = (s: Settings) => JSON.stringify([s.providers, s.tiers])
  applyPreview()
  if (settings.uiLanguage !== before.uiLanguage) return void changeUiLanguage(settings.uiLanguage)
  renderMuted()
  renderConsent()
  images.refresh()
  const languages = (s: Settings) => JSON.stringify([s.sourceLang, s.targetLang, s.tiers])
  if (languages(settings) !== languages(before)) void refreshOffline()
  if (providerState(settings) === providerState(before)) return
  fillTiers()
  fillSummaryProviders()
  renderProviderList()
  if (!$("providerPanel").contains(document.activeElement)) renderProviderPanel()
}

/** Side list in two groups: added services, then the ones that can be added. */
function renderProviderList(): void {
  const item = (p: ProviderPreset) => {
    const tag = removalBlocker(settings, p.id) ? h("span", { className: "tag active", text: t("providerInUse"), title: t("tipInUse") }) : null
    const selected = p.id === selectedProvider
    // A button, so the keyboard reaches every service; the list is drawn again, so the focus goes to the new button.
    const pick = h("button", { type: "button", className: "provider-item", title: t("tipProviderItem"), "aria-current": selected ? "true" : undefined }, h("span", { text: providerDisplayName(p) }), tag)
    pick.addEventListener("click", () => {
      selectedProvider = p.id
      renderProviderList()
      renderProviderPanel()
      $("providerList").querySelector<HTMLElement>("[aria-current]")?.focus()
    })
    return h("li", { className: selected ? "selected" : "" }, pick)
  }
  const group = (label: string, title: string, presets: ProviderPreset[]) =>
    presets.length > 0 ? [h("li", { className: "group", role: "presentation", text: label, title }), ...presets.map(item)] : []
  const shown = PROVIDER_PRESETS.filter((p) => !providerTier || tierOf(p) === providerTier)
  const added = addedProviders(settings).filter((p) => shown.includes(p))
  $("providerList").replaceChildren(
    ...group(t("providerGroupAdded"), t("tipGroupAdded"), added),
    ...group(t("providerGroupAvailable"), t("tipGroupAvailable"), shown.filter((p) => !added.includes(p))),
  )
}

/** A service was added or removed, or a service came into use: redraw everything that lists services. */
function providersChanged(): void {
  addProvidersInUse(settings)
  renderProviderList()
  renderProviderPanel()
  fillTiers()
  fillSummaryProviders()
  showTierControls()
  session.save()
  void refreshOffline()
}

/** Precise translation needs the AI tier; a warning when the source and the target language are the same. */
function showTierControls(): void {
  $<HTMLInputElement>("preciseEnabled").disabled = !settings.tiers.ai
  $("sameLanguage").hidden = settings.sourceLang !== settings.targetLang
  images.refresh()
}

function renderProviderPanel(): void {
  const p = getPreset(selectedProvider)!
  const cfg = providerConfig(session, p.id)
  const result = testResult()
  // Not added: "Add". Added: "Use this service" (in its tier) and "Remove"; the services of the tiers cannot be removed.
  const actions = h("div", { className: "row" })
  const blockedHint = h("p", { className: "hint remove-hint" })
  const state: PanelState = {
    p,
    cfg,
    session,
    addWhileTyping: (value) => {
      if (!value || cfg.enabled) return
      cfg.enabled = true
      renderProviderList()
      fillTiers()
      renderActions()
    },
  }
  const test = testButton(state, result)
  const renderActions = () => {
    blockedHint.textContent = ""
    if (!cfg.enabled) {
      const add = button(t("buttonAddProvider"), () => {
        cfg.enabled = true
        providersChanged()
      }, true, t("tipAdd"))
      actions.replaceChildren(test, add)
      return
    }
    const use = button(t("buttonUse"), () => {
      settings.tiers[tierOf(p)] = p.id
      providersChanged()
    }, true, t("tipUse"))
    use.disabled = settings.tiers[tierOf(p)] === p.id
    const remove = button(t("buttonRemoveProvider"), () => {
      cfg.enabled = false
      providersChanged()
    }, false, t("tipRemove"))
    const blocker = removalBlocker(settings, p.id)
    if (blocker) {
      remove.disabled = true
      blockedHint.textContent = t("removeBlockedTier", [t(TIER_NAME_KEYS[blocker])])
      remove.title = blockedHint.textContent
    }
    actions.replaceChildren(test, use, remove)
  }
  renderActions()
  $("providerPanel").replaceChildren(providerTitle(p), ...providerFields(state), actions, blockedHint, result)
}

function applyPreview(): void {
  setStyleVars($("preview"), settings.style)
  const tr = $("previewTranslation")
  tr.className = `tt-translation tt-bilingual tt-flow tt-style-${settings.style.preset}`
}

async function refreshCacheCount(): Promise<void> {
  const r = await send({ type: "cacheStats" })
  $("cacheCount").textContent = t("cacheCount", [r?.size ?? 0])
}

/** Write every text of the page in the current interface language. */
function applyLanguage(): void {
  const i18n = getI18n()
  localizeDocument(i18n)
  fillSelect($<HTMLSelectElement>("uiLanguage"), uiLanguageOptions(i18n), settings.uiLanguage)
  fillSelect($<HTMLSelectElement>("sourceLang"), sourceLanguageOptions(i18n), settings.sourceLang)
  fillSelect($<HTMLSelectElement>("targetLang"), languageOptions(i18n), settings.targetLang)
  fillSelect($<HTMLSelectElement>("providerTierFilter"), [new Option(t("providerFilterAll"), ""), ...TIERS.map((tier) => new Option(t(TIER_NAME_KEYS[tier]), tier))], providerTier)
  fillTiers()
  renderMuted()
  renderConsent()
  renderProviderList()
  renderProviderPanel()
  fillSummaryProviders()
  images.refresh()
  dictionaries.render()
  bergamot.render()
  prompts.refresh()
  void refreshCacheCount()
}

async function changeUiLanguage(value: unknown): Promise<void> {
  settings.uiLanguage = normalizeUiLanguageSetting(value)
  await loadExtensionI18n(settings.uiLanguage)
  applyLanguage()
}

async function main(): Promise<void> {
  session = await SettingsSession.open()
  settings = session.settings
  session.onRemoteChange = remoteChanged
  session.onSaved = showSaved
  session.onSaveError = showSaveError
  selectedProvider = settings.tiers[enabledTiers(settings.tiers).at(-1)!]!
  const languages = () => ({ source: settings.sourceLang, target: settings.targetLang })
  const recommended = () => recommendedFor(settings)
  dictionaries = new DictionarySection({
    tag: () => settings.dictionary.releaseTag,
    list: $("dictList"),
    status: $("dictStatus"),
    common: $("dictCommon"),
    filter: $<HTMLInputElement>("dictFilter"),
    languages,
    recommended,
  })
  bergamot = new BergamotSection({
    languages,
    recommended,
    list: $("bergamotList"),
    status: $("bergamotStatus"),
    common: $("bergamotCommon"),
    needed: $("bergamotNeeded"),
    filter: $<HTMLInputElement>("bergamotFilter"),
  })
  prompts = new PromptEditor($("promptEditor"), session)
  images = new ImageSettingsSection(session)
  mountStyleControls($("styleControls"), session, applyPreview)
  await Promise.all([loadExtensionI18n(settings.uiLanguage), loadSystemLanguages()])
  // The popup, the notice above a message and the tier selectors link to a place: options.html?dict=…&bergamot=…&tier=…#section.
  const query = new URLSearchParams(location.search)
  const terms = (name: string) => query.get(name)?.split(",").filter(Boolean)
  providerTier = TIERS.find((tier) => tier === query.get("tier")) ?? ""
  applyLanguage()
  if (location.hash) goTo({ section: location.hash.slice(1) as OptionsPlace["section"], dictionaries: terms("dict"), bergamot: terms("bergamot"), tier: providerTier || undefined })
  void refreshOffline()
  // Packs or models were installed or deleted, also through another page; the progress of the downloads.
  ext.runtime.onMessage.addListener((message: unknown) => {
    if ((message as PageNotice | undefined)?.type === "offlineDataChanged") void refreshOffline()
    dictionaries.receive(message)
    bergamot.receive(message)
  })
  $("openWelcome").addEventListener("click", () => void ext.tabs.create({ url: ext.runtime.getURL("welcome.html") }))

  // General
  const uiLanguage = $<HTMLSelectElement>("uiLanguage")
  uiLanguage.addEventListener("change", () => {
    void changeUiLanguage(uiLanguage.value)
    session.save()
  })
  session.bind("sourceLang", "change", (el) => (el.value = settings.sourceLang), (el) => {
    settings.sourceLang = el.value
    showTierControls()
    void refreshOffline()
  })
  session.bind("targetLang", "change", (el) => (el.value = settings.targetLang), (el) => {
    settings.targetLang = el.value
    showTierControls()
    prompts.refresh()
    void refreshOffline()
  })
  session.bind("mode", "change", (el) => (el.value = settings.mode), (el) => (settings.mode = el.value as DisplayMode))
  session.bindCheck("autoTranslate", () => settings.autoTranslate, (v) => (settings.autoTranslate = v))
  session.bindCheck("translateSubject", () => settings.translateSubject, (v) => (settings.translateSubject = v))

  // Tiers; "+ Add translation service…" shows the services of the tier.
  onTierChange(
    () => settings.tiers,
    (tier, value) => {
      settings.tiers[tier] = value
      providersChanged()
    },
    (tier) => goTo({ section: "providers", tier }),
  )
  $<HTMLSelectElement>("providerTierFilter").addEventListener("change", (e) => showProviderTier((e.target as HTMLSelectElement).value as Tier | ""))
  $("clearMuted").addEventListener("click", () => {
    settings.offlineMutedPairs = []
    renderMuted()
    session.save()
  })
  session.bindCheck("preciseEnabled", () => settings.precise.enabled, (v) => {
    settings.precise.enabled = v
    images.refresh()
  })
  session.track($("sameLanguage"), showTierControls)

  // Dictionaries
  session.bind("dictReleaseTag", "change", (el) => (el.value = settings.dictionary.releaseTag), (el) => {
    settings.dictionary.releaseTag = el.value.trim() || settings.dictionary.releaseTag
    el.value = settings.dictionary.releaseTag
    void dictionaries.load()
  })
  $("dictReload").addEventListener("click", () => void dictionaries.load(true))
  $("dictFilter").addEventListener("input", () => dictionaries.render())
  void dictionaries.load()

  // Offline models. Both lists follow the languages, also when they change elsewhere.
  $("bergamotFilter").addEventListener("input", () => bergamot.render())
  $("bergamotReload").addEventListener("click", () => void bergamot.load(true))
  let listed = ""
  session.track($("bergamotNeeded"), () => {
    if (listed === (listed = `${settings.sourceLang}>${settings.targetLang}>${settings.uiLanguage}`)) return
    dictionaries.render()
    bergamot.render()
  })
  void bergamot.load()

  // Summary and to-dos
  session.bind("summaryProvider", "change", fillSummaryProviders, (el) => {
    settings.summary.provider = el.value || null
    fillSummaryProviders()
  })
  session.bind("summaryModel", "input", (el) => (el.value = settings.summary.model), (el) => (settings.summary.model = el.value.trim()))
  session.bindNumber("summaryMaxTokens", () => settings.summary.maxOutputTokens, (v) => (settings.summary.maxOutputTokens = v))
  session.bind("summaryDisplay", "change", (el) => (el.value = settings.summary.display), (el) => (settings.summary.display = el.value === "collapsed" ? "collapsed" : "expanded"))
  for (const part of SUMMARY_PARTS) {
    session.bindCheck(`summaryPart-${part}`, () => settings.summary.parts.includes(part), (v) => {
      settings.summary.parts = SUMMARY_PARTS.filter((p) => (p === part ? v : settings.summary.parts.includes(p)))
    })
  }
  session.bindCheck("summaryInline", () => settings.summary.inlineButton, (v) => (settings.summary.inlineButton = v))

  // Batching
  const b = settings.batch
  session.bindNumber("batchDelayMs", () => b.batchDelayMs, (v) => (b.batchDelayMs = v))
  session.bindNumber("maxCharsPerBatch", () => b.maxCharsPerBatch, (v) => (b.maxCharsPerBatch = v))
  session.bindNumber("maxItemsPerBatch", () => b.maxItemsPerBatch, (v) => (b.maxItemsPerBatch = v))
  session.bindNumber("concurrency", () => b.concurrency, (v) => (b.concurrency = v))
  session.bindNumber("maxRetries", () => b.maxRetries, (v) => (b.maxRetries = v))
  session.bindNumber("timeoutSeconds", () => b.timeoutSeconds, (v) => (b.timeoutSeconds = v))
  session.bindCheck("llmBatchEnabled", () => b.llmBatchEnabled, (v) => (b.llmBatchEnabled = v))

  applyPreview()
  session.bindCheck("renderMarkdown", () => settings.renderMarkdown, (v) => (settings.renderMarkdown = v))

  // Cache
  session.bindCheck("cacheEnabled", () => settings.cache.enabled, (v) => (settings.cache.enabled = v))
  session.bindNumber("cacheMax", () => settings.cache.maxEntries, (v) => (settings.cache.maxEntries = v))
  $("clearCache").addEventListener("click", async () => {
    await send({ type: "clearCache" })
    await refreshCacheCount()
    $("cacheCount").textContent += ` · ${t("cacheCleared")}`
  })
}

void main()
