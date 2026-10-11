import { setStyleVars } from "../content/render"
import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n } from "../shared/i18n-ext"
import { normalizeUiLanguageSetting } from "../shared/locales"
import { $, fillSelect, languageOptions, send, sourceLanguageOptions, tierChoice, tierOptions, uiLanguageOptions } from "../shared/page"
import { getPreset, PROVIDER_PRESETS, providerDisplayName, type ProviderPreset, TIER_NAME_KEYS, TIERS, tierOf } from "../shared/providers"
import { addedProviders, addProvidersInUse, type DisplayMode, enabledTiers, removalBlocker, type Settings, type StylePreset } from "../shared/settings"
import { BergamotSection } from "./bergamot"
import { DictionarySection } from "./dictionaries"
import { h } from "./dom"
import { PromptEditor } from "./prompt-editor"
import { type PanelState, providerConfig, providerFields, providerTitle, testButton, testResult } from "./provider-panel"
import { type Control, SettingsSession } from "./session"

let session: SettingsSession
/** Settings as edited on this page. */
let settings: Settings
let selectedProvider = ""
let dictionaries: DictionarySection
let bergamot: BergamotSection
let prompts: PromptEditor

/** Changes made elsewhere were taken over: redraw what depends on them. */
function remoteChanged(before: Settings): void {
  const providerState = (s: Settings) => JSON.stringify([s.providers, s.tiers])
  applyPreview()
  if (settings.uiLanguage !== before.uiLanguage) return void changeUiLanguage(settings.uiLanguage)
  if (providerState(settings) === providerState(before)) return
  fillTierSelects()
  renderProviderList()
  if (!$("providerPanel").contains(document.activeElement)) renderProviderPanel()
}

function showSaved(): void {
  const saved = $("saved")
  saved.classList.add("show")
  setTimeout(() => saved.classList.remove("show"), 1200)
}

/** Side list in two groups: added services, then the ones that can be added. */
function renderProviderList(): void {
  const item = (p: ProviderPreset) => {
    const tag = removalBlocker(settings, p.id) ? h("span", { className: "tag active", text: t("providerInUse") }) : null
    const li = h("li", { className: p.id === selectedProvider ? "selected" : "" }, h("span", { text: providerDisplayName(p) }), tag)
    li.addEventListener("click", () => {
      selectedProvider = p.id
      renderProviderList()
      renderProviderPanel()
    })
    return li
  }
  const group = (label: string, presets: ProviderPreset[]) =>
    presets.length > 0 ? [h("li", { className: "group", role: "presentation", text: label }), ...presets.map(item)] : []
  const added = addedProviders(settings)
  $("providerList").replaceChildren(
    ...group(t("providerGroupAdded"), added),
    ...group(t("providerGroupAvailable"), PROVIDER_PRESETS.filter((p) => !added.includes(p))),
  )
}

/** The tier selectors, which list the added services of each tier. */
function fillTierSelects(): void {
  TIERS.forEach((tier, i) => {
    $(`tierLabel-${tier}`).textContent = t("tierLabel", [i + 1, t(TIER_NAME_KEYS[tier])])
    fillSelect($<HTMLSelectElement>(`tier-${tier}`), tierOptions(settings, tier), settings.tiers[tier] ?? "")
  })
}

/** A service was added or removed, or a service came into use: redraw everything that lists services. */
function providersChanged(): void {
  addProvidersInUse(settings)
  renderProviderList()
  renderProviderPanel()
  fillTierSelects()
  showTierControls()
  session.save()
}

/** Precise translation needs the AI tier; a warning when the source and the target language are the same. */
function showTierControls(): void {
  $<HTMLInputElement>("preciseEnabled").disabled = !settings.tiers.ai
  $("sameLanguage").hidden = settings.sourceLang !== settings.targetLang
}

function renderProviderPanel(): void {
  const p = getPreset(selectedProvider)!
  const cfg = providerConfig(session, p.id)
  const result = testResult()
  // Not added: "Add". Added: "Use this service" (in its tier) and "Remove"; the services of the tiers cannot be removed.
  const actions = h("div", { className: "row" })
  const blockedHint = h("p", { className: "hint remove-hint" })
  const button = (text: string, onClick: () => void, primary = false) => {
    const b = h("button", { type: "button", className: primary ? "primary" : "", text })
    b.addEventListener("click", onClick)
    return b
  }
  const state: PanelState = {
    p,
    cfg,
    session,
    addWhileTyping: (value) => {
      if (!value || cfg.enabled) return
      cfg.enabled = true
      renderProviderList()
      fillTierSelects()
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
      }, true)
      actions.replaceChildren(test, add)
      return
    }
    const use = button(t("buttonUse"), () => {
      settings.tiers[tierOf(p)] = p.id
      providersChanged()
    }, true)
    use.disabled = settings.tiers[tierOf(p)] === p.id
    const remove = button(t("buttonRemoveProvider"), () => {
      cfg.enabled = false
      providersChanged()
    })
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
  const r = await send<{ size: number }>({ type: "cacheStats" })
  $("cacheCount").textContent = t("cacheCount", [r?.size ?? 0])
}

/** Write every text of the page in the current interface language. */
function applyLanguage(): void {
  const i18n = getI18n()
  localizeDocument(i18n)
  fillSelect($<HTMLSelectElement>("uiLanguage"), uiLanguageOptions(i18n), settings.uiLanguage)
  fillSelect($<HTMLSelectElement>("sourceLang"), sourceLanguageOptions(i18n), settings.sourceLang)
  fillSelect($<HTMLSelectElement>("targetLang"), languageOptions(i18n), settings.targetLang)
  fillTierSelects()
  renderProviderList()
  renderProviderPanel()
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
  selectedProvider = settings.tiers[enabledTiers(settings.tiers).at(-1)!]!
  dictionaries = new DictionarySection({ tag: () => settings.dictionary.releaseTag, list: $("dictList"), status: $("dictStatus") })
  bergamot = new BergamotSection({
    languages: () => ({ source: settings.sourceLang, target: settings.targetLang }),
    list: $("bergamotList"),
    status: $("bergamotStatus"),
    needed: $("bergamotNeeded"),
    filter: $<HTMLInputElement>("bergamotFilter"),
  })
  prompts = new PromptEditor($("promptEditor"), session)
  await loadExtensionI18n(settings.uiLanguage)
  applyLanguage()
  // The popup links to options.html#providers; the section is filled only now.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
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
  })
  session.bind("targetLang", "change", (el) => (el.value = settings.targetLang), (el) => {
    settings.targetLang = el.value
    showTierControls()
    prompts.refresh()
  })
  session.bind("mode", "change", (el) => (el.value = settings.mode), (el) => (settings.mode = el.value as DisplayMode))
  session.bindCheck("autoTranslate", () => settings.autoTranslate, (v) => (settings.autoTranslate = v))

  // Tiers
  for (const tier of TIERS) {
    const select = $<HTMLSelectElement>(`tier-${tier}`)
    select.addEventListener("change", () => {
      const value = tierChoice(select, settings.tiers, tier)
      $("tiersEmpty").hidden = value !== undefined
      if (value === undefined) return
      settings.tiers[tier] = value
      providersChanged()
    })
  }
  session.bindCheck("preciseEnabled", () => settings.precise.enabled, (v) => (settings.precise.enabled = v))
  session.track($("sameLanguage"), showTierControls)

  // Dictionaries
  session.bind("dictReleaseTag", "change", (el) => (el.value = settings.dictionary.releaseTag), (el) => {
    settings.dictionary.releaseTag = el.value.trim() || settings.dictionary.releaseTag
    el.value = settings.dictionary.releaseTag
    void dictionaries.load()
  })
  $("dictReload").addEventListener("click", () => void dictionaries.load())
  void dictionaries.load()

  // Offline models: the directions needed follow the languages, also when they change elsewhere.
  $("bergamotFilter").addEventListener("input", () => bergamot.render())
  $("bergamotReload").addEventListener("click", () => void bergamot.load(true))
  let languages = ""
  session.track($("bergamotNeeded"), () => {
    if (languages === (languages = `${settings.sourceLang}>${settings.targetLang}`)) return
    void bergamot.refreshNeeded()
  })
  void bergamot.load()

  // Batching
  const b = settings.batch
  session.bindNumber("batchDelayMs", () => b.batchDelayMs, (v) => (b.batchDelayMs = v))
  session.bindNumber("maxCharsPerBatch", () => b.maxCharsPerBatch, (v) => (b.maxCharsPerBatch = v))
  session.bindNumber("maxItemsPerBatch", () => b.maxItemsPerBatch, (v) => (b.maxItemsPerBatch = v))
  session.bindNumber("concurrency", () => b.concurrency, (v) => (b.concurrency = v))
  session.bindNumber("maxRetries", () => b.maxRetries, (v) => (b.maxRetries = v))
  session.bindCheck("llmBatchEnabled", () => b.llmBatchEnabled, (v) => (b.llmBatchEnabled = v))

  // Style
  const st = settings.style
  const preview = (change: (el: Control) => void) => (el: Control) => {
    change(el)
    applyPreview()
  }
  session.bind("stylePreset", "change", (el) => (el.value = st.preset), preview((el) => (st.preset = el.value as StylePreset)))
  session.bind("styleColor", "input", (el) => (el.value = st.color), preview((el) => (st.color = el.value)))
  session.bind("styleOpacity", "input", (el) => (el.value = String(st.opacity)), preview((el) => (st.opacity = Number(el.value))))
  session.bind("styleFontScale", "input", (el) => (el.value = String(st.fontScale)), preview((el) => (st.fontScale = Number(el.value))))
  applyPreview()

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
