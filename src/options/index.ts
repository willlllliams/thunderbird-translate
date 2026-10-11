import { describeError } from "../shared/errors"
import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n, thunderbirdUiLanguage } from "../shared/i18n-ext"
import { LOCALE_NATIVE_NAMES, localeToLanguageTag, matchUiLocale, normalizeUiLanguageSetting, SUPPORTED_LOCALES } from "../shared/locales"
import type { TranslateResponse } from "../shared/messages"
import { $, fillSelect, languageOptions, send, sourceLanguageOptions, tierChoice, tierOptions } from "../shared/page"
import { DEFAULT_PROMPTS, PROMPT_KINDS } from "../shared/prompts"
import { checkBaseURL, getPreset, PROVIDER_PRESETS, providerDisplayName, type ProviderPreset, TIER_NAME_KEYS, TIERS, tierOf } from "../shared/providers"
import {
  addedProviders,
  addProvidersInUse,
  type DisplayMode,
  enabledTiers,
  emptyProviderConfig,
  type ProviderConfig,
  removalBlocker,
  SETTINGS_KEY,
  type Settings,
  type StylePreset,
} from "../shared/settings"
import { loadSettings, mergeChanges, readSettings, saveChanges } from "../shared/settings-store"
import { supportsThinkingControl } from "../background/providers/thinking"
import { BergamotSection } from "./bergamot"
import { DictionarySection } from "./dictionaries"
import { h } from "./dom"

/** Settings as edited on this page. */
let settings: Settings
/** Settings as this page last read or wrote them: the reference for what the user changed. */
let baseline: Settings
let selectedProvider = ""
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** Redraw the control of one setting; run again when the settings change elsewhere. */
const controls: (() => void)[] = []
const dictionaries = new DictionarySection({ tag: () => settings.dictionary.releaseTag })
const bergamot = new BergamotSection({ languages: () => ({ source: settings.sourceLang, target: settings.targetLang }) })

/** A control that shows a setting. The one being edited is left alone when the settings change elsewhere. */
function track(input: HTMLElement, show: () => void): void {
  const update = () => {
    if (document.activeElement !== input) show()
  }
  controls.push(update)
  update()
}

/** The popup, another settings tab or the background script wrote settings: take over what changed, keep what is being edited. */
function absorb(remote: Settings): void {
  const providerState = () => JSON.stringify([settings.providers, settings.tiers])
  const [language, before] = [settings.uiLanguage, providerState()]
  mergeChanges(settings, baseline, remote, true)
  baseline = structuredClone(remote)
  for (const show of controls) show()
  applyPreview()
  if (settings.uiLanguage !== language) return void changeUiLanguage(settings.uiLanguage)
  if (providerState() === before) return
  fillTierSelects()
  renderProviderList()
  if (!$("providerPanel").contains(document.activeElement)) renderProviderPanel()
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null
    absorb(await saveChanges(baseline, settings))
    const saved = $("saved")
    saved.classList.add("show")
    setTimeout(() => saved.classList.remove("show"), 1200)
  }, 300)
}

function providerConfig(id: string): ProviderConfig {
  settings.providers[id] ??= emptyProviderConfig()
  return settings.providers[id]
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
  scheduleSave()
}

/** Precise translation needs the AI tier; a warning when the source and the target language are the same. */
function showTierControls(): void {
  $<HTMLInputElement>("preciseEnabled").disabled = !settings.tiers.ai
  $("sameLanguage").hidden = settings.sourceLang !== settings.targetLang
}

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h("label", { className: "panel-field" }, h("span", { text: label }), input, hint ? h("span", { className: "hint", text: hint }) : null)
}

/**
 * Warning under the endpoint field: malformed URL, or a console / docs site
 * instead of the API. Saving is never blocked.
 */
function renderBaseUrlWarning(box: HTMLElement, p: ProviderPreset, input: HTMLInputElement, restore: () => void): void {
  const issue = checkBaseURL(input.value)
  if (!issue) {
    box.replaceChildren()
    box.hidden = true
    return
  }
  const children: HTMLElement[] = [h("div", { text: issue.kind === "invalid" ? t("warnBaseUrlInvalid") : t("hintWebHost", [issue.host]) })]
  if (p.defaultBaseURL) {
    const button = h("button", { type: "button", text: t("buttonRestoreBaseUrl") })
    button.addEventListener("click", restore)
    children.push(h("div", { className: "row" }, h("span", { text: t("warnBaseUrlDefault", [p.defaultBaseURL]) }), button))
  }
  box.replaceChildren(...children)
  box.hidden = false
}

/** Failure of the connection test: a title, then reason, server message, suggestions and URL on their own lines. */
function showTestFailure(box: HTMLElement, description: string | undefined): void {
  const text = description?.trim() ? description : describeError(undefined, getI18n())
  const [reason, ...rest] = text.split("\n").filter((line) => line.trim())
  box.className = "test-result fail"
  box.replaceChildren(
    h("div", { className: "test-title", text: t("testFailed") }),
    h("div", { className: "test-reason", text: reason }),
    ...rest.map((line) => h("div", { className: "test-line", text: line })),
  )
}

/** The service shown in the panel and its configuration. */
interface PanelState {
  p: ProviderPreset
  cfg: ProviderConfig
  /** Typing a key (or the DeepLX endpoint) adds the service; the panel is not redrawn, so the field keeps the focus. */
  addWhileTyping: (value: string) => void
}

/** Endpoint field with the URL check. */
function endpointField({ p, cfg, addWhileTyping }: PanelState, label: string, hint?: string): HTMLElement {
  const baseURL = h("input", { type: "text", value: cfg.baseURL, placeholder: p.defaultBaseURL || "https://…", spellcheck: "false" })
  const warning = h("div", { className: "field-warning", role: "status" })
  const validate = () =>
    renderBaseUrlWarning(warning, p, baseURL, () => {
      cfg.baseURL = ""
      baseURL.value = ""
      validate()
      scheduleSave()
    })
  baseURL.addEventListener("input", () => {
    cfg.baseURL = baseURL.value.trim()
    if (p.kind === "deeplx") addWhileTyping(cfg.baseURL)
    scheduleSave()
  })
  // Checked when the value is committed (blur / Enter), not on every keystroke.
  baseURL.addEventListener("change", validate)
  validate()
  return h("div", { className: "field-group" }, field(label, baseURL, hint), warning)
}

/** Key / token field, hidden by default and with a button to show it. */
function keyField({ cfg, addWhileTyping }: PanelState, label: string): HTMLElement {
  const key = h("input", { type: "password", value: cfg.apiKey, autocomplete: "off", spellcheck: "false" })
  key.addEventListener("input", () => {
    cfg.apiKey = key.value.trim()
    addWhileTyping(cfg.apiKey)
    scheduleSave()
  })
  const show = h("button", { type: "button", text: t("buttonShowKey") })
  show.addEventListener("click", () => {
    const hidden = key.type === "password"
    key.type = hidden ? "text" : "password"
    show.textContent = hidden ? t("buttonHideKey") : t("buttonShowKey")
  })
  return field(label, h("div", { className: "row" }, key, show), t("hintKeyLocal"))
}

/** Two interfaces: the free Edge endpoints, or Azure Translator with the user's key. The fields of the second are hidden in the first. */
function microsoftFields(state: PanelState): HTMLElement[] {
  const { p, cfg } = state
  const freeHint = h("p", { className: "hint", text: t("hintFree"), hidden: cfg.mode === "key" })
  const region = h("input", { type: "text", value: cfg.region ?? "", placeholder: "westeurope", spellcheck: "false" })
  region.addEventListener("input", () => {
    cfg.region = region.value.trim()
    scheduleSave()
  })
  const fields = h(
    "div",
    { className: "azure-fields", hidden: cfg.mode !== "key" },
    endpointField(state, t("labelAzureEndpoint"), t("hintAzureEndpoint")),
    keyField(state, t("labelApiKey")),
    field(t("labelRegion"), region, t("hintAzureRegion")),
    h("a", { href: p.docsUrl, target: "_blank", rel: "noopener", text: t("getKey") }),
  )
  const radio = (value: "free" | "key", label: string) => {
    const input = h("input", { type: "radio", name: "microsoftMode", value, checked: (cfg.mode ?? "free") === value })
    input.addEventListener("change", () => {
      if (!input.checked) return
      if (value === "key") cfg.mode = "key"
      else delete cfg.mode
      freeHint.hidden = value === "key"
      fields.hidden = value !== "key"
      scheduleSave()
    })
    return h("label", {}, input, h("span", { text: label }))
  }
  const modeSwitch = h("div", { className: "mode-switch" }, radio("free", t("microsoftModeFree")), radio("key", t("microsoftModeKey")))
  return [h("div", { className: "panel-field" }, h("span", { text: t("microsoftModeLabel") }), modeSwitch), freeHint, fields]
}

/** Model, temperature and thinking switch of an AI service. */
function llmFields({ p, cfg }: PanelState): HTMLElement[] {
  const listId = `models-${p.id}`
  const model = h("input", { type: "text", value: cfg.model, placeholder: p.defaultModel, list: listId, spellcheck: "false" })
  const datalist = h("datalist", { id: listId }, ...p.models.map((m) => h("option", { value: m })))
  model.addEventListener("input", () => {
    cfg.model = model.value.trim()
    scheduleSave()
  })

  const temperature = cfg.temperature === undefined ? p.defaultTemperature : cfg.temperature
  const temp = h("input", { type: "number", min: "0", max: "2", step: "0.1", value: temperature === null ? "" : String(temperature) })
  temp.addEventListener("input", () => {
    const v = temp.value.trim()
    cfg.temperature = v === "" ? null : Math.min(2, Math.max(0, Number(v)))
    scheduleSave()
  })

  const supported = supportsThinkingControl(p.id)
  const thinking = h("input", { type: "checkbox", checked: supported && cfg.thinking === true, disabled: !supported })
  thinking.addEventListener("change", () => {
    cfg.thinking = thinking.checked
    scheduleSave()
  })
  return [
    field(t("labelModel"), h("div", {}, model, datalist)),
    field(t("labelTemperature"), temp),
    h(
      "div",
      { className: "field-group" },
      h("label", { className: "check" }, thinking, h("span", { text: t("labelThinking") })),
      h("span", { className: "hint", text: supported ? t("hintThinking") : t("hintThinkingUnsupported") }),
    ),
  ]
}

/** Connection test with the configuration as it is on screen, saved or not. */
function testButton(p: ProviderPreset, cfg: ProviderConfig, result: HTMLElement): HTMLButtonElement {
  const test = h("button", { type: "button", text: t("buttonTest") })
  test.addEventListener("click", async () => {
    result.className = "test-result"
    result.textContent = t("testRunning")
    test.disabled = true
    try {
      const r = await send<TranslateResponse | undefined>({ type: "testProvider", providerId: p.id, config: { ...cfg }, targetLang: settings.targetLang })
      if (r?.ok) {
        result.className = "test-result ok"
        result.textContent = t("testOk", [r.text])
      } else showTestFailure(result, r?.error)
    } catch (error) {
      showTestFailure(result, describeError(error, getI18n()))
    } finally {
      test.disabled = false
    }
  })
  return test
}

function renderProviderPanel(): void {
  const p = getPreset(selectedProvider)!
  const cfg = providerConfig(p.id)

  const title = h("div", { className: "row" }, h("h3", { text: providerDisplayName(p) }))
  if (p.docsUrl && p.kind !== "microsoft") title.append(h("a", { href: p.docsUrl, target: "_blank", rel: "noopener", text: t("getKey") }))

  const result = h("div", { className: "test-result", "aria-live": "polite" })
  const test = testButton(p, cfg, result)
  // Not added: "Add". Added: "Use this service" (in its tier) and "Remove"; the services of the tiers cannot be removed.
  const actions = h("div", { className: "row" })
  const blockedHint = h("p", { className: "hint remove-hint" })
  const button = (text: string, onClick: () => void, primary = false) => {
    const b = h("button", { type: "button", className: primary ? "primary" : "", text })
    b.addEventListener("click", onClick)
    return b
  }
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

  const state: PanelState = {
    p,
    cfg,
    addWhileTyping: (value) => {
      if (!value || cfg.enabled) return
      cfg.enabled = true
      renderProviderList()
      fillTierSelects()
      renderActions()
    },
  }
  let fields: HTMLElement[]
  if (p.kind === "google") {
    fields = [h("p", { className: "hint", text: t("hintFree") })]
  } else if (p.kind === "dictionary") {
    fields = [h("p", { className: "hint", text: t("hintDictionaryProvider") })]
  } else if (p.kind === "bergamot") {
    fields = [h("p", { className: "hint", text: t("hintBergamot") })]
  } else if (p.kind === "microsoft") {
    fields = microsoftFields(state)
  } else {
    let baseHint: string | undefined
    if (p.id === "azure") baseHint = t("hintAzure")
    else if (p.id === "ollama") baseHint = t("hintOllama")
    else if (p.kind === "deeplx") baseHint = t("hintDeeplx")
    fields = [
      endpointField(state, p.kind === "deeplx" ? t("labelDeeplxURL") : t("labelBaseURL"), baseHint),
      keyField(state, p.kind === "deeplx" ? t("labelDeeplxToken") : t("labelApiKey")),
      ...(p.kind === "llm" ? llmFields(state) : []),
    ]
  }
  renderActions()
  $("providerPanel").replaceChildren(title, ...fields, actions, blockedHint, result)
}

/** Any form control of the page: input, select or textarea. */
type Control = HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement

/** A control of the page bound to one setting: `show` draws the setting, `apply` takes the control's value, then the settings are saved. */
function bind(id: string, event: "input" | "change", show: (el: Control) => void, apply: (el: Control) => void): Control {
  const el = $<Control>(id)
  track(el, () => show(el))
  el.addEventListener(event, () => {
    apply(el)
    scheduleSave()
  })
  return el
}

/** Number field, clamped to its min and max. */
function bindNumber(id: string, get: () => number, set: (v: number) => void): void {
  const show = (el: Control) => (el.value = String(get()))
  bind(id, "change", show, (el) => {
    const v = Number(el.value)
    if (Number.isFinite(v)) set(Math.min(Number(el.max), Math.max(Number(el.min), v)))
    show(el)
  })
}

function bindCheck(id: string, get: () => boolean, set: (v: boolean) => void): void {
  bind(id, "change", (el) => (el.checked = get()), (el) => set(el.checked))
}

function applyPreview(): void {
  const preview = $("preview")
  preview.style.setProperty("--tt-color", settings.style.color)
  preview.style.setProperty("--tt-opacity", String(settings.style.opacity))
  preview.style.setProperty("--tt-scale", String(settings.style.fontScale))
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

  const follow = new Option(t("uiLanguageAuto", [LOCALE_NATIVE_NAMES[matchUiLocale(thunderbirdUiLanguage())]]), "auto")
  const locales = SUPPORTED_LOCALES.map((l) => {
    const o = new Option(LOCALE_NATIVE_NAMES[l], l)
    o.lang = localeToLanguageTag(l)
    return o
  })
  fillSelect($<HTMLSelectElement>("uiLanguage"), [follow, ...locales], settings.uiLanguage)
  fillSelect($<HTMLSelectElement>("sourceLang"), sourceLanguageOptions(i18n), settings.sourceLang)
  fillSelect($<HTMLSelectElement>("targetLang"), languageOptions(i18n), settings.targetLang)
  fillTierSelects()
  renderProviderList()
  renderProviderPanel()
  dictionaries.render()
  bergamot.render()
  void refreshCacheCount()
}

async function changeUiLanguage(value: unknown): Promise<void> {
  settings.uiLanguage = normalizeUiLanguageSetting(value)
  await loadExtensionI18n(settings.uiLanguage)
  applyLanguage()
}

async function main(): Promise<void> {
  settings = await loadSettings()
  baseline = structuredClone(settings)
  selectedProvider = settings.tiers[enabledTiers(settings.tiers).at(-1)!]!
  await loadExtensionI18n(settings.uiLanguage)
  applyLanguage()
  // The popup links to options.html#providers; the section is filled only now.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()

  // General
  const uiLanguage = $<HTMLSelectElement>("uiLanguage")
  uiLanguage.addEventListener("change", () => {
    void changeUiLanguage(uiLanguage.value)
    scheduleSave()
  })
  // The popup, another settings tab or the background script may change settings while this page is open.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SETTINGS_KEY]) absorb(readSettings(changes[SETTINGS_KEY].newValue))
  })
  bind("sourceLang", "change", (el) => (el.value = settings.sourceLang), (el) => {
    settings.sourceLang = el.value
    showTierControls()
  })
  bind("targetLang", "change", (el) => (el.value = settings.targetLang), (el) => {
    settings.targetLang = el.value
    showTierControls()
  })
  bind("mode", "change", (el) => (el.value = settings.mode), (el) => (settings.mode = el.value as DisplayMode))
  bindCheck("autoTranslate", () => settings.autoTranslate, (v) => (settings.autoTranslate = v))

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
  bindCheck("preciseEnabled", () => settings.precise.enabled, (v) => (settings.precise.enabled = v))
  track($("sameLanguage"), showTierControls)

  // Dictionaries
  bind("dictReleaseTag", "change", (el) => (el.value = settings.dictionary.releaseTag), (el) => {
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
  track($("bergamotNeeded"), () => {
    if (languages === (languages = `${settings.sourceLang}>${settings.targetLang}`)) return
    void bergamot.refreshNeeded()
  })
  void bergamot.load()

  // Prompts: an empty box means the default.
  for (const kind of PROMPT_KINDS) {
    const prompt = bind(`prompt-${kind}`, "input", (el) => (el.value = settings.prompts[kind]), (el) => (settings.prompts[kind] = el.value))
    prompt.placeholder = DEFAULT_PROMPTS[kind]
    $(`reset-${kind}`).addEventListener("click", () => {
      prompt.value = DEFAULT_PROMPTS[kind]
      settings.prompts[kind] = DEFAULT_PROMPTS[kind]
      scheduleSave()
    })
  }

  // Batching
  const b = settings.batch
  bindNumber("batchDelayMs", () => b.batchDelayMs, (v) => (b.batchDelayMs = v))
  bindNumber("maxCharsPerBatch", () => b.maxCharsPerBatch, (v) => (b.maxCharsPerBatch = v))
  bindNumber("maxItemsPerBatch", () => b.maxItemsPerBatch, (v) => (b.maxItemsPerBatch = v))
  bindNumber("concurrency", () => b.concurrency, (v) => (b.concurrency = v))
  bindNumber("maxRetries", () => b.maxRetries, (v) => (b.maxRetries = v))
  bindCheck("llmBatchEnabled", () => b.llmBatchEnabled, (v) => (b.llmBatchEnabled = v))

  // Style
  const st = settings.style
  const preview = (change: (el: Control) => void) => (el: Control) => {
    change(el)
    applyPreview()
  }
  bind("stylePreset", "change", (el) => (el.value = st.preset), preview((el) => (st.preset = el.value as StylePreset)))
  bind("styleColor", "input", (el) => (el.value = st.color), preview((el) => (st.color = el.value)))
  bind("styleOpacity", "input", (el) => (el.value = String(st.opacity)), preview((el) => (st.opacity = Number(el.value))))
  bind("styleFontScale", "input", (el) => (el.value = String(st.fontScale)), preview((el) => (st.fontScale = Number(el.value))))
  applyPreview()

  // Cache
  bindCheck("cacheEnabled", () => settings.cache.enabled, (v) => (settings.cache.enabled = v))
  bindNumber("cacheMax", () => settings.cache.maxEntries, (v) => (settings.cache.maxEntries = v))
  $("clearCache").addEventListener("click", async () => {
    await send({ type: "clearCache" })
    await refreshCacheCount()
    $("cacheCount").textContent += ` · ${t("cacheCleared")}`
  })
}

void main()
