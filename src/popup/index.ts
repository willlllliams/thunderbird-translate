import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n } from "../shared/i18n-ext"
import { LANGUAGES } from "../shared/languages"
import type { BackgroundRequest, TabState } from "../shared/messages"
import { PROVIDER_PRESETS, providerDisplayName } from "../shared/providers"
import { type DisplayMode, normalizeSettings, SETTINGS_KEY } from "../shared/settings"
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

async function main(): Promise<void> {
  const settings = await loadSettings()
  let uiLanguage = settings.uiLanguage
  await loadExtensionI18n(uiLanguage)
  localizeDocument()
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
  const tabId = tab?.id

  const toggle = $<HTMLButtonElement>("toggle")
  const status = $<HTMLParagraphElement>("status")
  const targetLang = $<HTMLSelectElement>("targetLang")
  const provider = $<HTMLSelectElement>("provider")
  const autoTranslate = $<HTMLInputElement>("autoTranslate")

  const fillSelects = (target: string, providerId: string) => {
    const i18n = getI18n()
    fillSelect(targetLang, LANGUAGES.map((l) => [i18n.languageName(l.code, l.native), l.code]), target)
    fillSelect(provider, PROVIDER_PRESETS.map((p) => [providerDisplayName(p, i18n), p.id]), providerId)
  }
  fillSelects(settings.targetLang, settings.activeProviderId)
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
  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault()
    void ext.runtime.openOptionsPage()
    window.close()
  })

  let last: TabState = { connected: false, active: false, total: 0, done: 0, failed: 0 }
  const render = (st: TabState) => {
    last = st
    toggle.disabled = !st.connected
    toggle.classList.toggle("active", st.active)
    toggle.textContent = st.active ? t("popupShowOriginal") : t("popupTranslate")
    if (!st.connected) status.textContent = t("popupNotConnected")
    else if (!st.active) status.textContent = t("popupIdle")
    else if (st.total === 0) status.textContent = t("popupNothing")
    else {
      let text = t("popupProgress", [st.done, st.total])
      if (st.failed > 0) text += ` · ${t("popupFailed", [st.failed])}`
      status.textContent = text
    }
  }

  const refresh = async () => {
    if (tabId === undefined) return render({ connected: false, active: false, total: 0, done: 0, failed: 0 })
    render(await send<TabState>({ type: "getTabState", tabId }))
  }

  // The interface language may change in the settings page while the popup is open.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return
    const next = normalizeSettings(changes[SETTINGS_KEY].newValue)
    if (next.uiLanguage === uiLanguage) return
    uiLanguage = next.uiLanguage
    void loadExtensionI18n(uiLanguage).then(() => {
      localizeDocument()
      fillSelects(targetLang.value, provider.value)
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
