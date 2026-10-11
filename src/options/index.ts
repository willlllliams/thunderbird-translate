import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n, thunderbirdUiLanguage } from "../shared/i18n-ext"
import { LANGUAGES } from "../shared/languages"
import { LOCALE_NATIVE_NAMES, localeToLanguageTag, matchUiLocale, normalizeUiLanguageSetting, SUPPORTED_LOCALES } from "../shared/locales"
import type { BackgroundRequest } from "../shared/messages"
import { getPreset, PROVIDER_PRESETS, providerDisplayName, type ProviderPreset } from "../shared/providers"
import { type DisplayMode, normalizeSettings, type ProviderConfig, SETTINGS_KEY, type Settings, type StylePreset } from "../shared/settings"
import { loadSettings, saveSettings } from "../shared/settings-store"
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
  settings.providers[id] ??= { apiKey: "", baseURL: "", model: "" }
  return settings.providers[id]
}

function isConfigured(p: ProviderPreset): boolean {
  const c = providerConfig(p.id)
  if (p.kind === "google" || p.kind === "microsoft") return true
  if (p.requiresBaseURL && !c.baseURL) return false
  if (p.requiresKey && !c.apiKey) return false
  return p.kind === "llm" ? Boolean(c.model || p.defaultModel) : true
}

function renderProviderList(): void {
  const list = $("providerList")
  list.replaceChildren(
    ...PROVIDER_PRESETS.map((p) => {
      const tags: HTMLElement[] = []
      if (p.id === settings.activeProviderId) tags.push(h("span", { className: "tag active", text: t("providerActive") }))
      else if (isConfigured(p) && (p.requiresKey || p.requiresBaseURL)) {
        tags.push(h("span", { className: "tag configured", text: t("providerConfigured") }))
      }
      const li = h("li", { className: p.id === selectedProvider ? "selected" : "" }, h("span", { text: providerDisplayName(p) }), ...tags)
      li.addEventListener("click", () => {
        selectedProvider = p.id
        renderProviderList()
        renderProviderPanel()
      })
      return li
    }),
  )
}

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h("label", { className: "panel-field" }, h("span", { text: label }), input, hint ? h("span", { className: "hint", text: hint }) : null)
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

  const change = () => {
    renderProviderList()
    scheduleSave()
  }

  if (p.kind === "google" || p.kind === "microsoft") {
    children.push(h("p", { className: "hint", text: t("hintFree") }))
  } else {
    // Endpoint
    const baseURL = h("input", { type: "text", value: cfg.baseURL, placeholder: p.defaultBaseURL || "https://…", spellcheck: "false" })
    baseURL.addEventListener("input", () => {
      cfg.baseURL = baseURL.value.trim()
      change()
    })
    let baseHint: string | undefined
    if (p.id === "azure") baseHint = t("hintAzure")
    else if (p.id === "ollama") baseHint = t("hintOllama")
    else if (p.kind === "deeplx") baseHint = t("hintDeeplx")
    children.push(field(p.kind === "deeplx" ? t("labelDeeplxURL") : t("labelBaseURL"), baseURL, baseHint))

    // Key / token
    const key = h("input", { type: "password", value: cfg.apiKey, autocomplete: "off", spellcheck: "false" })
    key.addEventListener("input", () => {
      cfg.apiKey = key.value.trim()
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
    }
  }

  // Actions
  const result = h("span", { className: "test-result" })
  const test = h("button", { type: "button", text: t("buttonTest") })
  test.addEventListener("click", async () => {
    result.className = "test-result"
    result.textContent = t("testRunning")
    test.disabled = true
    try {
      const r = await send<{ ok: boolean; text?: string; error?: string }>({
        type: "testProvider",
        providerId: p.id,
        config: { ...cfg },
        targetLang: settings.targetLang,
      })
      result.className = `test-result ${r.ok ? "ok" : "fail"}`
      result.textContent = r.ok ? t("testOk", [r.text ?? ""]) : t("testFail", [r.error ?? ""])
    } finally {
      test.disabled = false
    }
  })
  const use = h("button", { type: "button", className: "primary", text: t("buttonUse") })
  use.disabled = p.id === settings.activeProviderId
  use.addEventListener("click", () => {
    settings.activeProviderId = p.id
    ;($("activeProvider") as HTMLSelectElement).value = p.id
    use.disabled = true
    change()
  })
  children.push(h("div", { className: "row" }, test, use), result)

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
  fillSelect(
    $<HTMLSelectElement>("activeProvider"),
    PROVIDER_PRESETS.map((p) => new Option(providerDisplayName(p, i18n), p.id)),
    settings.activeProviderId,
  )
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
    renderProviderList()
    renderProviderPanel()
    scheduleSave()
  })
  bindCheck("autoTranslate", () => settings.autoTranslate, (v) => (settings.autoTranslate = v))

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
