import { ext, t } from "../shared/ext"
import { localizeDocument } from "../shared/i18n-dom"
import { LANGUAGES } from "../shared/languages"
import type { BackgroundRequest, TabState } from "../shared/messages"
import { PROVIDER_PRESETS } from "../shared/providers"
import type { DisplayMode } from "../shared/settings"
import { loadSettings, updateSettings } from "../shared/settings-store"

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function send<T>(req: BackgroundRequest): Promise<T> {
  return ext.runtime.sendMessage(req) as Promise<T>
}

async function main(): Promise<void> {
  localizeDocument()
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
  const tabId = tab?.id
  const settings = await loadSettings()

  const toggle = $<HTMLButtonElement>("toggle")
  const status = $<HTMLParagraphElement>("status")
  const targetLang = $<HTMLSelectElement>("targetLang")
  const provider = $<HTMLSelectElement>("provider")
  const autoTranslate = $<HTMLInputElement>("autoTranslate")

  for (const lang of LANGUAGES) targetLang.add(new Option(lang.native, lang.code))
  targetLang.value = settings.targetLang
  for (const p of PROVIDER_PRESETS) provider.add(new Option(p.name, p.id))
  provider.value = settings.activeProviderId
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

  const render = (st: TabState) => {
    toggle.disabled = !st.connected
    toggle.classList.toggle("active", st.active)
    toggle.textContent = st.active ? t("popupShowOriginal") : t("popupTranslate")
    if (!st.connected) status.textContent = t("popupNotConnected")
    else if (!st.active) status.textContent = t("popupIdle")
    else if (st.total === 0) status.textContent = t("popupNothing")
    else {
      let text = t("popupProgress", [String(st.done), String(st.total)])
      if (st.failed > 0) text += ` · ${t("popupFailed", [String(st.failed)])}`
      status.textContent = text
    }
  }

  const refresh = async () => {
    if (tabId === undefined) return render({ connected: false, active: false, total: 0, done: 0, failed: 0 })
    render(await send<TabState>({ type: "getTabState", tabId }))
  }

  toggle.addEventListener("click", async () => {
    if (tabId === undefined) return
    await send({ type: "tabCommand", tabId, command: "toggle" })
    setTimeout(refresh, 150)
  })

  await refresh()
  setInterval(refresh, 500)
}

void main()
