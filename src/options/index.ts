import { describeError } from "../shared/errors"
import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n, thunderbirdUiLanguage } from "../shared/i18n-ext"
import { LANGUAGES } from "../shared/languages"
import { LOCALE_NATIVE_NAMES, localeToLanguageTag, matchUiLocale, normalizeUiLanguageSetting, SUPPORTED_LOCALES } from "../shared/locales"
import type { BackgroundRequest } from "../shared/messages"
import { checkBaseURL, getPreset, isAiProvider, PROVIDER_PRESETS, providerDisplayName, type ProviderPreset } from "../shared/providers"
import {
  addedProviders,
  addProvidersInUse,
  type DisplayMode,
  normalizeSettings,
  type ProviderConfig,
  removalBlocker,
  SETTINGS_KEY,
  type Settings,
  type StylePreset,
} from "../shared/settings"
import { loadSettings, saveSettings } from "../shared/settings-store"
import { supportsThinkingControl } from "../background/providers/thinking"
import { DEFAULT_SYSTEM_PROMPT } from "../background/translators/llm-prompt"

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function send<T>(req: BackgroundRequest): Promise<T> {
  return ext.runtime.sendMessage(req) as Promise<T>
}

/** Small DOM builder; avoids innerHTML. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean>> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue
    if (k === "className") el.className = String(v)
    else if (k === "text") el.textContent = String(v)
    else el.setAttribute(k, v === true ? "" : String(v))
  }
  for (const c of children) if (c !== null) el.append(c)
  return el
}

let settings: Settings
let selectedProvider = ""
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null
    await saveSettings(settings)
    const saved = $("saved")
    saved.classList.add("show")
    setTimeout(() => saved.classList.remove("show"), 1200)
  }, 300)
}

function providerConfig(id: string): ProviderConfig {
  settings.providers[id] ??= { enabled: false, apiKey: "", baseURL: "", model: "" }
  return settings.providers[id]
}

/** Side list in two groups: added services, then the ones that can be added. */
function renderProviderList(): void {
  const item = (p: ProviderPreset) => {
    const tag = p.id === settings.activeProviderId ? h("span", { className: "tag active", text: t("providerActive") }) : null
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

/** The selectors that list added services: current service and fast service of race mode. */
function fillProviderSelects(): void {
  const i18n = getI18n()
  fillSelect(
    $<HTMLSelectElement>("activeProvider"),
    addedProviders(settings).map((p) => new Option(providerDisplayName(p, i18n), p.id)),
    settings.activeProviderId,
  )
  fillSelect(
    $<HTMLSelectElement>("fastProvider"),
    PROVIDER_PRESETS.filter((p) => !isAiProvider(p) && (providerConfig(p.id).enabled || p.id === settings.race.fastProviderId)).map(
      (p) => new Option(providerDisplayName(p, i18n), p.id),
    ),
    settings.race.fastProviderId,
  )
}

/** A service was added or removed, or a service came into use: redraw everything that lists services. */
function providersChanged(): void {
  addProvidersInUse(settings)
  renderProviderList()
  renderProviderPanel()
  fillProviderSelects()
  scheduleSave()
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

function showTestSuccess(box: HTMLElement, text: string): void {
  box.className = "test-result ok"
  box.textContent = t("testOk", [text])
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

function renderProviderPanel(): void {
  const panel = $("providerPanel")
  const p = getPreset(selectedProvider)!
  const cfg = providerConfig(p.id)
  const children: (HTMLElement | null)[] = []

  const title = h("div", { className: "row" }, h("h3", { text: providerDisplayName(p) }))
  if (p.docsUrl) {
    const a = h("a", { href: p.docsUrl, target: "_blank", rel: "noopener", text: t("getKey") })
    title.append(a)
  }
  children.push(title)

  const change = () => scheduleSave()
  // Typing a key (or the DeepLX endpoint) adds the service; the panel is not redrawn, so the field keeps the focus.
  const addWhileTyping = (value: string) => {
    if (!value || cfg.enabled) return
    cfg.enabled = true
    renderProviderList()
    fillProviderSelects()
    renderActions()
  }

  if (p.kind === "google" || p.kind === "microsoft") {
    children.push(h("p", { className: "hint", text: t("hintFree") }))
  } else {
    // Endpoint
    const baseURL = h("input", { type: "text", value: cfg.baseURL, placeholder: p.defaultBaseURL || "https://…", spellcheck: "false" })
    const warning = h("div", { className: "field-warning", role: "status" })
    const validate = () => renderBaseUrlWarning(warning, p, baseURL, () => {
      cfg.baseURL = ""
      baseURL.value = ""
      validate()
      change()
    })
    baseURL.addEventListener("input", () => {
      cfg.baseURL = baseURL.value.trim()
      if (p.kind === "deeplx") addWhileTyping(cfg.baseURL)
      change()
    })
    // Checked when the value is committed (blur / Enter), not on every keystroke.
    baseURL.addEventListener("change", validate)
    let baseHint: string | undefined
    if (p.id === "azure") baseHint = t("hintAzure")
    else if (p.id === "ollama") baseHint = t("hintOllama")
    else if (p.kind === "deeplx") baseHint = t("hintDeeplx")
    children.push(h("div", { className: "field-group" }, field(p.kind === "deeplx" ? t("labelDeeplxURL") : t("labelBaseURL"), baseURL, baseHint), warning))
    validate()

    // Key / token
    const key = h("input", { type: "password", value: cfg.apiKey, autocomplete: "off", spellcheck: "false" })
    key.addEventListener("input", () => {
      cfg.apiKey = key.value.trim()
      addWhileTyping(cfg.apiKey)
      change()
    })
    const show = h("button", { type: "button", text: t("buttonShowKey") })
    show.addEventListener("click", () => {
      const hidden = key.type === "password"
      key.type = hidden ? "text" : "password"
      show.textContent = hidden ? t("buttonHideKey") : t("buttonShowKey")
    })
    children.push(field(p.kind === "deeplx" ? t("labelDeeplxToken") : t("labelApiKey"), h("div", { className: "row" }, key, show), t("hintKeyLocal")))

    if (p.kind === "llm") {
      const listId = `models-${p.id}`
      const model = h("input", { type: "text", value: cfg.model, placeholder: p.defaultModel, list: listId, spellcheck: "false" })
      const datalist = h("datalist", { id: listId }, ...p.models.map((m) => h("option", { value: m })))
      model.addEventListener("input", () => {
        cfg.model = model.value.trim()
        change()
      })
      children.push(field(t("labelModel"), h("div", {}, model, datalist)))

      const temp = h("input", {
        type: "number",
        min: "0",
        max: "2",
        step: "0.1",
        value: cfg.temperature === undefined ? (p.defaultTemperature === null ? "" : String(p.defaultTemperature)) : cfg.temperature === null ? "" : String(cfg.temperature),
      })
      temp.addEventListener("input", () => {
        const v = temp.value.trim()
        cfg.temperature = v === "" ? null : Math.min(2, Math.max(0, Number(v)))
        change()
      })
      children.push(field(t("labelTemperature"), temp))

      const supported = supportsThinkingControl(p.id)
      const thinking = h("input", { type: "checkbox", checked: supported && cfg.thinking === true, disabled: !supported })
      thinking.addEventListener("change", () => {
        cfg.thinking = thinking.checked
        change()
      })
      children.push(
        h(
          "div",
          { className: "field-group" },
          h("label", { className: "check" }, thinking, h("span", { text: t("labelThinking") })),
          h("span", { className: "hint", text: supported ? t("hintThinking") : t("hintThinkingUnsupported") }),
        ),
      )
    }
  }

  // Actions
  const result = h("div", { className: "test-result", "aria-live": "polite" })
  const test = h("button", { type: "button", text: t("buttonTest") })
  test.addEventListener("click", async () => {
    result.className = "test-result"
    result.textContent = t("testRunning")
    test.disabled = true
    try {
      const r = await send<{ ok: boolean; text?: string; error?: string } | undefined>({
        type: "testProvider",
        providerId: p.id,
        config: { ...cfg },
        targetLang: settings.targetLang,
      })
      if (r?.ok) showTestSuccess(result, r.text ?? "")
      else showTestFailure(result, r?.error)
    } catch (error) {
      showTestFailure(result, describeError(error, getI18n()))
    } finally {
      test.disabled = false
    }
  })
  // Not added: "Add". Added: "Use this service" and "Remove"; the services in use cannot be removed.
  const actions = h("div", { className: "row" })
  const blockedHint = h("p", { className: "hint remove-hint" })
  function renderActions(): void {
    const button = (text: string, onClick: () => void, primary = false) => {
      const b = h("button", { type: "button", className: primary ? "primary" : "", text })
      b.addEventListener("click", onClick)
      return b
    }
    blockedHint.textContent = ""
    if (!cfg.enabled) {
      actions.replaceChildren(test, button(t("buttonAddProvider"), () => {
        cfg.enabled = true
        providersChanged()
      }, true))
      return
    }
    const use = button(t("buttonUse"), () => {
      settings.activeProviderId = p.id
      providersChanged()
    }, true)
    use.disabled = p.id === settings.activeProviderId
    const remove = button(t("buttonRemoveProvider"), () => {
      cfg.enabled = false
      providersChanged()
    })
    const blocker = removalBlocker(settings, p.id)
    if (blocker) {
      remove.disabled = true
      blockedHint.textContent = blocker === "active" ? t("removeBlockedActive") : t("removeBlockedRace")
      remove.title = blockedHint.textContent
    }
    actions.replaceChildren(test, use, remove)
  }
  renderActions()
  children.push(actions, blockedHint, result)

  panel.replaceChildren(...children.filter((c): c is HTMLElement => c !== null))
}

function bindNumber(id: string, get: () => number, set: (v: number) => void): void {
  const input = $<HTMLInputElement>(id)
  input.value = String(get())
  input.addEventListener("change", () => {
    const v = Number(input.value)
    if (!Number.isFinite(v)) return
    const min = Number(input.min)
    const max = Number(input.max)
    const clamped = Math.min(max, Math.max(min, v))
    input.value = String(clamped)
    set(clamped)
    scheduleSave()
  })
}

function bindCheck(id: string, get: () => boolean, set: (v: boolean) => void): void {
  const input = $<HTMLInputElement>(id)
  input.checked = get()
  input.addEventListener("change", () => {
    set(input.checked)
    scheduleSave()
  })
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

/** Replace a select's options, keeping the selected value. */
function fillSelect(select: HTMLSelectElement, options: HTMLOptionElement[], value: string): void {
  select.replaceChildren(...options)
  select.value = value
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
  fillSelect(
    $<HTMLSelectElement>("targetLang"),
    LANGUAGES.map((l) => new Option(i18n.languageName(l.code, l.native), l.code)),
    settings.targetLang,
  )
  fillProviderSelects()
  renderProviderList()
  renderProviderPanel()
  void refreshCacheCount()
}

async function changeUiLanguage(value: unknown): Promise<void> {
  settings.uiLanguage = normalizeUiLanguageSetting(value)
  await loadExtensionI18n(settings.uiLanguage)
  applyLanguage()
}

async function main(): Promise<void> {
  settings = await loadSettings()
  selectedProvider = settings.activeProviderId
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
  // Another settings tab may change the interface language.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return
    const next = normalizeSettings(changes[SETTINGS_KEY].newValue).uiLanguage
    if (next !== settings.uiLanguage) void changeUiLanguage(next)
  })
  const targetLang = $<HTMLSelectElement>("targetLang")
  targetLang.addEventListener("change", () => {
    settings.targetLang = targetLang.value
    scheduleSave()
  })
  const mode = $<HTMLSelectElement>("mode")
  mode.value = settings.mode
  mode.addEventListener("change", () => {
    settings.mode = mode.value as DisplayMode
    scheduleSave()
  })
  const active = $<HTMLSelectElement>("activeProvider")
  active.addEventListener("change", () => {
    settings.activeProviderId = active.value
    providersChanged()
  })
  bindCheck("autoTranslate", () => settings.autoTranslate, (v) => (settings.autoTranslate = v))

  // AI translation modes
  bindCheck("raceEnabled", () => settings.race.enabled, (v) => {
    settings.race.enabled = v
    providersChanged()
  })
  const fast = $<HTMLSelectElement>("fastProvider")
  fast.addEventListener("change", () => {
    settings.race.fastProviderId = fast.value
    providersChanged()
  })
  bindCheck("preciseEnabled", () => settings.precise.enabled, (v) => (settings.precise.enabled = v))

  // Prompt
  const prompt = $<HTMLTextAreaElement>("systemPrompt")
  prompt.placeholder = DEFAULT_SYSTEM_PROMPT
  prompt.value = settings.systemPrompt
  prompt.addEventListener("input", () => {
    settings.systemPrompt = prompt.value
    scheduleSave()
  })
  $("resetPrompt").addEventListener("click", () => {
    prompt.value = ""
    settings.systemPrompt = ""
    scheduleSave()
  })

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
  const preset = $<HTMLSelectElement>("stylePreset")
  preset.value = st.preset
  preset.addEventListener("change", () => {
    st.preset = preset.value as StylePreset
    applyPreview()
    scheduleSave()
  })
  const color = $<HTMLInputElement>("styleColor")
  color.value = st.color
  color.addEventListener("input", () => {
    st.color = color.value
    applyPreview()
    scheduleSave()
  })
  for (const [id, key] of [
    ["styleOpacity", "opacity"],
    ["styleFontScale", "fontScale"],
  ] as const) {
    const input = $<HTMLInputElement>(id)
    input.value = String(st[key])
    input.addEventListener("input", () => {
      st[key] = Number(input.value)
      applyPreview()
      scheduleSave()
    })
  }
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
