import { firstLine, truncate } from "../shared/errors"
import { ext } from "../shared/ext"
import { t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { followUiLanguage, loadExtensionI18n } from "../shared/i18n-ext"
import { REMOTE_ORIGINS } from "../shared/hosts"
import { IDLE_TAB_STATE, type OfflineStatus, type OptionsPlace, optionsPath, type PageNotice, send, type TabState } from "../shared/messages"
import { $, fillSelect, fillTierSelects, languageOptions, offlineStatus, onTierChange, showImagePreciseNote, showOfflineHint, sourceLanguageOptions, visionHint } from "../shared/page"
import { type DisplayMode, type ImageMode, imageStatus, summaryProvider } from "../shared/settings"
import { loadSettings, onStoredSettings, readSettings, updateSettings } from "../shared/settings-store"
import { REFRESH_AFTER_ACTION_MS, REFRESH_INTERVAL_MS } from "./timing"

async function main(): Promise<void> {
  let settings = await loadSettings()
  await loadExtensionI18n(settings.uiLanguage)
  localizeDocument()
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
  const tabId = tab?.id

  const toggle = $<HTMLButtonElement>("toggle")
  const retranslate = $<HTMLButtonElement>("retranslate")
  const summarize = $<HTMLButtonElement>("summarize")
  const status = $<HTMLParagraphElement>("status")
  const lastError = $<HTMLParagraphElement>("lastError")
  const sourceLang = $<HTMLSelectElement>("sourceLang")
  const targetLang = $<HTMLSelectElement>("targetLang")
  const autoTranslate = $<HTMLInputElement>("autoTranslate")
  const preciseEnabled = $<HTMLInputElement>("preciseEnabled")

  /** Open the settings page at a place and close the popup. */
  const openOptions = (place: OptionsPlace) => {
    void ext.tabs.create({ url: ext.runtime.getURL(optionsPath(place)) })
    window.close()
  }
  // A selected offline service without the data for the languages is marked in its selector, with a link to the downloads.
  let offline: OfflineStatus = {}
  const fillSelects = () => {
    fillSelect(sourceLang, sourceLanguageOptions(), settings.sourceLang)
    fillSelect(targetLang, languageOptions(), settings.targetLang)
    fillTierSelects(settings, false, offline)
    showOfflineHint($("offlineMissing"), settings, offline, openOptions)
  }
  const refreshOffline = async () => {
    offline = await offlineStatus(settings)
    fillSelects()
  }
  const modeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'))
  const imageRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="imageMode"]'))
  // The switches follow settings changed elsewhere, e.g. on the settings page. Precise translation applies to the AI tier only.
  const showSwitches = () => {
    autoTranslate.checked = settings.autoTranslate
    for (const radio of modeRadios) radio.checked = radio.value === settings.mode
    $("preciseRow").hidden = !settings.tiers.ai
    preciseEnabled.checked = settings.precise.enabled
    // Image translation needs precise translation: always on screen, greyed out with a note while that is off; a model that refuses images is named under the switch.
    const precise = showImagePreciseNote(settings)
    $("imageModes").setAttribute("aria-disabled", String(!precise))
    for (const radio of imageRadios) {
      radio.checked = radio.value === settings.image.mode
      radio.disabled = !precise
    }
    const status = imageStatus(settings)
    const hint = precise && status.support === "no" ? visionHint(status) : ""
    $("imageUnsupported").hidden = !hint
    $("imageUnsupported").textContent = hint
    $("sameLanguage").hidden = settings.sourceLang !== settings.targetLang
  }
  fillSelects()
  showSwitches()
  for (const radio of modeRadios) {
    radio.addEventListener("change", () => {
      if (radio.checked) void updateSettings((s) => (s.mode = radio.value as DisplayMode))
    })
  }
  for (const radio of imageRadios) {
    radio.addEventListener("change", () => {
      if (radio.checked) void updateSettings((s) => (s.image.mode = radio.value as ImageMode))
    })
  }

  sourceLang.addEventListener("change", () => void updateSettings((s) => (s.sourceLang = sourceLang.value)))
  targetLang.addEventListener("change", () => void updateSettings((s) => (s.targetLang = targetLang.value)))
  onTierChange(
    () => settings.tiers,
    (tier, value) => void updateSettings((s) => (s.tiers[tier] = value)),
    (tier) => openOptions({ section: "providers", tier }),
  )
  autoTranslate.addEventListener("change", () => void updateSettings((s) => (s.autoTranslate = autoTranslate.checked)))
  preciseEnabled.addEventListener("change", () => void updateSettings((s) => (s.precise.enabled = preciseEnabled.checked)))
  $("imagePreciseOn").addEventListener("click", () => void updateSettings((s) => (s.precise.enabled = true)))
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

  // Remote images of the message wait for the access to remote images: the click asks Thunderbird for it, first thing in the handler.
  let remoteAllowed = false
  const checkRemote = async () => {
    remoteAllowed = await ext.permissions.contains({ origins: [...REMOTE_ORIGINS] }).catch(() => false)
    render(last)
  }
  $("remoteAccessAllow").addEventListener("click", () => {
    void ext.permissions
      .request({ origins: [...REMOTE_ORIGINS] })
      .catch(() => false)
      .then(() => checkRemote())
  })

  let last = IDLE_TAB_STATE
  const render = (st: TabState) => {
    last = st
    const remote = st.connected && !remoteAllowed ? (st.remoteImages ?? 0) : 0
    $("remoteAccess").hidden = remote === 0
    $("remoteAccessText").textContent = remote > 0 ? t("popupRemoteImages", [remote]) : ""
    toggle.disabled = !st.connected
    toggle.classList.toggle("active", st.active)
    toggle.textContent = st.active ? t("popupShowOriginal") : t("popupTranslate")
    toggle.title = st.active ? t("tipShowOriginal") : t("tipTranslate")
    // Retranslating needs a translated message.
    retranslate.hidden = !(st.connected && st.active)
    // The summary needs a message and an AI service, of its own or of the AI tier.
    const summarizer = summaryProvider(settings) !== null
    summarize.disabled = !st.connected || !summarizer
    summarize.title = t(summarizer ? "tipSummarize" : "tipSummarizeNone")
    if (!st.connected) status.textContent = t("popupNotConnected")
    else if (!st.active) status.textContent = t("popupIdle")
    else if (st.total === 0) status.textContent = t("popupNothing")
    else {
      let text = st.provisional > 0 ? t("popupProgressProvisional", [st.done, st.total, st.provisional]) : t("popupProgress", [st.done, st.total])
      if (st.failed > 0) text += ` · ${t("popupFailed", [st.failed])}`
      status.textContent = text
    }
    // Provisional translations need a word of explanation.
    status.title = st.active && st.provisional > 0 ? t("tipProvisional") : ""
    // Most recent failure: one shortened line here, the full description as tooltip.
    const error = st.active && st.failed > 0 ? st.lastError?.trim() : ""
    lastError.hidden = !error
    lastError.textContent = error ? t("popupLastError", [truncate(firstLine(error), 90)]) : ""
    lastError.title = error ?? ""
  }

  const refresh = async () => {
    if (tabId === undefined) return render(IDLE_TAB_STATE)
    render(await send({ type: "getTabState", tabId }))
  }

  const followLanguage = followUiLanguage(settings.uiLanguage, () => {
    localizeDocument()
    fillSelects()
    render(last)
  })
  // The popup and the settings page change the settings; the interface language may change too.
  onStoredSettings((stored) => {
    const before = settings
    settings = readSettings(stored)
    showSwitches()
    const languages = (s: typeof settings) => JSON.stringify([s.sourceLang, s.targetLang, s.tiers])
    if (languages(settings) !== languages(before)) void refreshOffline()
    fillSelects()
    void followLanguage(settings.uiLanguage)
  })

  for (const [button, type] of [
    [toggle, "toggleTab"],
    [retranslate, "retranslateTab"],
    [summarize, "summarizeTab"],
  ] as const) {
    button.addEventListener("click", async () => {
      if (tabId === undefined) return
      await send({ type, tabId })
      setTimeout(refresh, REFRESH_AFTER_ACTION_MS)
    })
  }

  // Packs or models were installed or deleted on another page.
  ext.runtime.onMessage.addListener((message: unknown) => {
    if ((message as PageNotice | undefined)?.type === "offlineDataChanged") void refreshOffline()
  })
  void refreshOffline()

  await checkRemote()
  await refresh()
  setInterval(refresh, REFRESH_INTERVAL_MS)
}

void main()
