import { firstLine } from "../shared/errors"
import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n } from "../shared/i18n-ext"
import { LANGUAGES } from "../shared/languages"
import type { BackgroundRequest, TabState } from "../shared/messages"
import { getPreset, isAiProvider, providerDisplayName } from "../shared/providers"
import { addedProviders, type DisplayMode, normalizeSettings, SETTINGS_KEY } from "../shared/settings"
import { loadSettings, updateSettings } from "../shared/settings-store"

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function send<T>(req: BackgroundRequest): Promise<T> {
  return ext.runtime.sendMessage(req) as Promise<T>
}

/** Replace a select's options, keeping the selected value. */
function fillSelect(select: HTMLSelectElement, options: [label: string, value: string][], value: string): void {
  select.replaceChildren(...options.map(([label, v]) => new Option(label, v)))
  select.value = value
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

async function main(): Promise<void> {
  let settings = await loadSettings()
  let uiLanguage = settings.uiLanguage
  await loadExtensionI18n(uiLanguage)
  localizeDocument()
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
  const tabId = tab?.id

  const toggle = $<HTMLButtonElement>("toggle")
  const status = $<HTMLParagraphElement>("status")
  const lastError = $<HTMLParagraphElement>("lastError")
  const targetLang = $<HTMLSelectElement>("targetLang")
  const provider = $<HTMLSelectElement>("provider")
  const autoTranslate = $<HTMLInputElement>("autoTranslate")
  const raceEnabled = $<HTMLInputElement>("raceEnabled")
  const preciseEnabled = $<HTMLInputElement>("preciseEnabled")

  const fillSelects = () => {
    const i18n = getI18n()
    fillSelect(targetLang, LANGUAGES.map((l) => [i18n.languageName(l.code, l.native), l.code]), settings.targetLang)
    fillSelect(provider, addedProviders(settings).map((p) => [providerDisplayName(p, i18n), p.id]), settings.activeProviderId)
  }
  // Race and precise mode apply to AI services only.
  const showAiModes = () => {
    $("aiModes").hidden = !isAiProvider(getPreset(settings.activeProviderId))
    raceEnabled.checked = settings.race.enabled
    preciseEnabled.checked = settings.precise.enabled
  }
  fillSelects()
  showAiModes()
  autoTranslate.checked = settings.autoTranslate
  for (const radio of Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'))) {
    radio.checked = radio.value === settings.mode
    radio.addEventListener("change", () => {
      if (radio.checked) void updateSettings((s) => (s.mode = radio.value as DisplayMode))
    })
  }

  targetLang.addEventListener("change", () => void updateSettings((s) => (s.targetLang = targetLang.value)))
  provider.addEventListener("change", () => void updateSettings((s) => (s.activeProviderId = provider.value)))
  autoTranslate.addEventListener("change", () => void updateSettings((s) => (s.autoTranslate = autoTranslate.checked)))
  raceEnabled.addEventListener("change", () => void updateSettings((s) => (s.race.enabled = raceEnabled.checked)))
  preciseEnabled.addEventListener("change", () => void updateSettings((s) => (s.precise.enabled = preciseEnabled.checked)))
  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault()
    void ext.runtime.openOptionsPage()
    window.close()
  })
  $("addProvider").addEventListener("click", () => {
    void ext.tabs.create({ url: ext.runtime.getURL("options.html#providers") })
    window.close()
  })

  const idle: TabState = { connected: false, active: false, total: 0, done: 0, provisional: 0, failed: 0 }
  let last = idle
  const render = (st: TabState) => {
    last = st
    toggle.disabled = !st.connected
    toggle.classList.toggle("active", st.active)
    toggle.textContent = st.active ? t("popupShowOriginal") : t("popupTranslate")
    if (!st.connected) status.textContent = t("popupNotConnected")
    else if (!st.active) status.textContent = t("popupIdle")
    else if (st.total === 0) status.textContent = t("popupNothing")
    else {
      let text = st.provisional > 0 ? t("popupProgressProvisional", [st.done, st.total, st.provisional]) : t("popupProgress", [st.done, st.total])
      if (st.failed > 0) text += ` · ${t("popupFailed", [st.failed])}`
      status.textContent = text
    }
    // Most recent failure: one shortened line here, the full description as tooltip.
    const error = st.active && st.failed > 0 ? st.lastError?.trim() : ""
    lastError.hidden = !error
    lastError.textContent = error ? t("popupLastError", [shorten(firstLine(error), 90)]) : ""
    lastError.title = error ?? ""
  }

  const refresh = async () => {
    if (tabId === undefined) return render(idle)
    render(await send<TabState>({ type: "getTabState", tabId }))
  }

  // The popup and the settings page change the settings; the interface language may change too.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return
    settings = normalizeSettings(changes[SETTINGS_KEY].newValue)
    showAiModes()
    if (settings.uiLanguage === uiLanguage) {
      fillSelects()
      return
    }
    uiLanguage = settings.uiLanguage
    void loadExtensionI18n(uiLanguage).then(() => {
      localizeDocument()
      fillSelects()
      render(last)
    })
  })

  toggle.addEventListener("click", async () => {
    if (tabId === undefined) return
    await send({ type: "tabCommand", tabId, command: "toggle" })
    setTimeout(refresh, 150)
  })

  await refresh()
  setInterval(refresh, 500)
}

void main()
