import { firstLine, truncate } from "../shared/errors"
import { ext } from "../shared/ext"
import { t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n } from "../shared/i18n-ext"
import { IDLE_TAB_STATE, type TabState } from "../shared/messages"
import { $, fillSelect, fillTierSelects, languageOptions, onTierChange, send, sourceLanguageOptions } from "../shared/page"
import { type DisplayMode, SETTINGS_KEY } from "../shared/settings"
import { loadSettings, readSettings, updateSettings } from "../shared/settings-store"

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
  const sourceLang = $<HTMLSelectElement>("sourceLang")
  const targetLang = $<HTMLSelectElement>("targetLang")
  const autoTranslate = $<HTMLInputElement>("autoTranslate")
  const preciseEnabled = $<HTMLInputElement>("preciseEnabled")

  const fillSelects = () => {
    fillSelect(sourceLang, sourceLanguageOptions(), settings.sourceLang)
    fillSelect(targetLang, languageOptions(), settings.targetLang)
    fillTierSelects(settings)
  }
  const modeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'))
  // The switches follow settings changed elsewhere, e.g. on the settings page. Precise translation applies to the AI tier only.
  const showSwitches = () => {
    autoTranslate.checked = settings.autoTranslate
    for (const radio of modeRadios) radio.checked = radio.value === settings.mode
    $("preciseRow").hidden = !settings.tiers.ai
    preciseEnabled.checked = settings.precise.enabled
    $("sameLanguage").hidden = settings.sourceLang !== settings.targetLang
  }
  fillSelects()
  showSwitches()
  for (const radio of modeRadios) {
    radio.addEventListener("change", () => {
      if (radio.checked) void updateSettings((s) => (s.mode = radio.value as DisplayMode))
    })
  }

  sourceLang.addEventListener("change", () => void updateSettings((s) => (s.sourceLang = sourceLang.value)))
  targetLang.addEventListener("change", () => void updateSettings((s) => (s.targetLang = targetLang.value)))
  onTierChange(
    () => settings.tiers,
    (tier, value) => void updateSettings((s) => (s.tiers[tier] = value)),
  )
  autoTranslate.addEventListener("change", () => void updateSettings((s) => (s.autoTranslate = autoTranslate.checked)))
  preciseEnabled.addEventListener("change", () => void updateSettings((s) => (s.precise.enabled = preciseEnabled.checked)))
  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault()
    void ext.runtime.openOptionsPage()
    window.close()
  })
  $("openWelcome").addEventListener("click", (e) => {
    e.preventDefault()
    void ext.tabs.create({ url: ext.runtime.getURL("welcome.html") })
    window.close()
  })
  $("addProvider").addEventListener("click", () => {
    void ext.tabs.create({ url: ext.runtime.getURL("options.html#providers") })
    window.close()
  })

  let last = IDLE_TAB_STATE
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
    lastError.textContent = error ? t("popupLastError", [truncate(firstLine(error), 90)]) : ""
    lastError.title = error ?? ""
  }

  const refresh = async () => {
    if (tabId === undefined) return render(IDLE_TAB_STATE)
    render(await send<TabState>({ type: "getTabState", tabId }))
  }

  // The popup and the settings page change the settings; the interface language may change too.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return
    settings = readSettings(changes[SETTINGS_KEY].newValue)
    showSwitches()
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
    await send({ type: "toggleTab", tabId })
    setTimeout(refresh, 150)
  })

  await refresh()
  setInterval(refresh, 500)
}

void main()
