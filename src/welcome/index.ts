/**
 * Welcome page, opened after installation and from the popup and the
 * settings page: one decision per step, each saved as soon as it is made.
 * The page reuses the parts of the settings page (service fields and
 * connection test, dictionary packs, offline models, prompt editor) and,
 * for the trial at the end, the content script's paragraph detection and
 * rendering connected to the background script.
 */

import { type ContentClient, connectContent } from "../content/client"
import type { Unit } from "../content/paragraphs"
import { Renderer, setStyleVars } from "../content/render"
import { ext } from "../shared/ext"
import { getI18n, t } from "../shared/i18n"
import { localizeDocument } from "../shared/i18n-dom"
import { loadExtensionI18n } from "../shared/i18n-ext"
import { normalizeUiLanguageSetting } from "../shared/locales"
import { $, fillSelect, fillTierSelects, languageOptions, onTierChange, showSaved, showSaveError, sourceLanguageOptions, tierOptions, uiLanguageOptions } from "../shared/page"
import { getPreset, type Tier } from "../shared/providers"
import { addProvidersInUse, type DisplayMode, type Settings } from "../shared/settings"
import { BergamotSection } from "../options/bergamot"
import { DictionarySection } from "../options/dictionaries"
import { h } from "../shared/dom"
import { loadSystemLanguages, recommendedFor } from "../options/offline-list"
import { PromptEditor } from "../options/prompt-editor"
import { type PanelState, providerConfig, providerFields, providerTitle, testButton, testResult } from "../options/provider-panel"
import { SettingsSession } from "../options/session"
import { mountStyleControls } from "../options/style-controls"
import { releaseFetch } from "../hooks/servers"
import { welcomeProbe } from "../hooks/welcome"
import { TierDemo, TierTour } from "./demo"
import { neighbourStep, resumeStep, STEP_IDS, STEP_TITLE_KEYS, type StepId, stepNeeded, TRY_MAIL, trialLanguage, WELCOME_KEY, type WelcomeState } from "./steps"

declare const __DEBUG__: boolean

let session: SettingsSession
let settings: Settings
let step: StepId = STEP_IDS[0]
let dictionaries: DictionarySection
let bergamot: BergamotSection
let prompts: PromptEditor
let client: ContentClient | null = null
let demo: TierDemo
let tour: TierTour
/** The tour of the tier selectors was closed once; it does not open on its own again. */
let toured = false
/** Languages the offline lists were last drawn for; "" before they are loaded. */
let offlineLanguages = ""
/** Number of directions "Download selected" is downloading; 0 when it does not run. */
let downloading = 0
/** How the last "Download selected" ended. */
let downloadResult = ""

/** Paragraph elements of a message; a line break inside a paragraph becomes <br>. */
function paragraphs(texts: string[]): HTMLParagraphElement[] {
  return texts.map((text) => {
    const p = h("p")
    text.split("\n").forEach((line, i) => p.append(...(i > 0 ? [h("br"), line] : [line])))
    return p
  })
}

/* ---------- steps and navigation ---------- */

function renderStepList(): void {
  const needed = STEP_IDS.filter((id) => stepNeeded(id, settings))
  $("stepList").replaceChildren(
    ...STEP_IDS.map((id, i) => {
      const skipped = !needed.includes(id)
      const label = `${i + 1}. ${t(STEP_TITLE_KEYS[id])}`
      const button = h("button", { type: "button", text: label, disabled: skipped })
      if (id === step) button.setAttribute("aria-current", "step")
      if (skipped) button.title = t("stepNotNeeded")
      button.addEventListener("click", () => void go(id))
      return h("li", { className: skipped ? "skipped" : id === step ? "current" : "" }, button)
    }),
  )
  const position = needed.indexOf(step) + 1
  $("progressBar").style.width = `${(position / needed.length) * 100}%`
  $("progressTrack").setAttribute("aria-valuemax", String(needed.length))
  $("progressTrack").setAttribute("aria-valuenow", String(position))
  const last = neighbourStep(step, settings, 1) === null
  $<HTMLButtonElement>("prevStep").disabled = neighbourStep(step, settings, -1) === null
  $("skipStep").hidden = last
  $("nextStep").textContent = t(last ? "buttonFinish" : "buttonNext")
}

function saveState(state: WelcomeState): Promise<void> {
  return ext.storage.local.set({ [WELCOME_KEY]: toured ? { ...state, toured } : state })
}

/** Show a step; the settings are saved first and the step is remembered for the next visit. */
async function go(next: StepId, focus = true): Promise<void> {
  if (next !== "tiers") leaveTiers()
  step = next
  for (const section of Array.from(document.querySelectorAll<HTMLElement>("section.step"))) section.hidden = section.dataset.step !== next
  renderStepList()
  // Focus first: the tour of the tiers step moves the focus into its tip.
  if (focus) document.querySelector<HTMLElement>(`section[data-step="${next}"] h2`)?.focus()
  enterStep()
  await Promise.all([session.flush(), saveState({ step: next })])
}

/** Draw what a step shows from the current settings. */
function enterStep(): void {
  switch (step) {
    case "display":
      return renderModePreview()
    case "tiers":
      demo.play(settings)
      if (!toured) tour.start()
      return
    case "offline":
      return enterOffline()
    case "machine":
      return renderServicePanel($("machinePanel"), settings.tiers.machine)
    case "ai":
      fillAiServices()
      return renderServicePanel($("aiPanel"), settings.tiers.ai)
    case "prompts":
      return prompts.refresh()
  }
}

async function closeTab(): Promise<void> {
  const tab = await ext.tabs.getCurrent()
  if (tab?.id !== undefined) await ext.tabs.remove(tab.id)
  else window.close()
}

/** Leave the guide; when the settings cannot be saved, the page stays open with the failure on screen (onSaveError). */
async function leave(state: WelcomeState): Promise<void> {
  const [saved] = await Promise.all([session.flush(), saveState(state)])
  if (saved) await closeTab()
}

const exit = () => leave({ step })
const finish = () => leave({ step, finished: true })

/* ---------- step 1: languages ---------- */

function showSameLanguage(): void {
  $("sameLanguage").hidden = settings.sourceLang !== settings.targetLang
}

/* ---------- step 2: display mode ---------- */

/** Sample message with its translations, drawn by the content script's renderer in the chosen mode and style. */
function renderModePreview(): void {
  const box = $("modePreview")
  const originals = paragraphs([t("welcomePreviewOriginal"), t("stylePreviewOriginal")])
  const translations = [t("welcomePreviewTranslation"), t("stylePreviewTranslation")]
  box.replaceChildren(...originals)
  setStyleVars(box, settings.style)
  const renderer = new Renderer(document)
  renderer.stylePreset = settings.style.preset
  originals.forEach((el, i) => {
    const unit: Unit = { id: i, el, text: el.textContent ?? "", pre: false }
    renderer.showTranslation(unit, translations[i], settings.mode)
  })
  for (const radio of Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'))) radio.checked = radio.value === settings.mode
}

/* ---------- step 3: tiers ---------- */

/** Choosing a service for a tier adds it; the selectors list every service of each tier, not only the added ones. */
function setTier(tier: Tier, id: string | null): void {
  settings.tiers[tier] = id
  addProvidersInUse(settings)
  fillTierSelects(settings, true)
  renderStepList()
  session.save()
  if (step !== "tiers") return
  demo.play(settings)
  tour.chosen(tier)
}

/** Leaving the tiers step or the page stops the demo and ends the tour; leaving the page does not count as closing it. */
function leaveTiers(user = true): void {
  demo.stop()
  tour.close(user)
}

/* ---------- step 4: offline translation ---------- */

/** The lists are loaded once; new languages start the check boxes from the new recommendation. */
function enterOffline(): void {
  $("offlineDictionary").hidden = settings.tiers.dictionary === null
  $("offlineBergamot").hidden = settings.tiers.machine === null || getPreset(settings.tiers.machine)?.kind !== "bergamot"
  $("offlineAutoHint").hidden = settings.sourceLang !== "auto"
  const languages = `${settings.sourceLang}>${settings.targetLang}`
  const first = offlineLanguages === ""
  if (languages !== offlineLanguages) {
    offlineLanguages = languages
    dictionaries.resetChoice()
    bergamot.resetChoice()
  }
  if (!first) {
    dictionaries.render()
    bergamot.render()
    return
  }
  void dictionaries.load()
  void bergamot.load()
}

/** The lists shown on the offline step. */
const offlineLists = () => [...($("offlineDictionary").hidden ? [] : [dictionaries]), ...($("offlineBergamot").hidden ? [] : [bergamot])]

/** "Download selected" needs a ticked direction; the line beside it says why it is disabled, what runs and how it ended. */
function showDownloadState(): void {
  // The lists draw themselves before the page has all of them.
  if (!dictionaries || !bergamot) return
  const picked = offlineLists().reduce((n, list) => n + list.picked().length, 0)
  $<HTMLButtonElement>("downloadPicked").disabled = downloading > 0 || picked === 0
  let status = downloadResult
  if (downloading > 0) status = t("downloadRunning", [downloading])
  else if (!status && picked === 0) status = t("downloadNothingPicked")
  $("downloadStatus").textContent = status
}

async function downloadPicked(): Promise<void> {
  downloading = offlineLists().reduce((n, list) => n + list.picked().length, 0)
  downloadResult = ""
  showDownloadState()
  const failed = (await Promise.all(offlineLists().map((list) => list.downloadPicked()))).reduce((a, b) => a + b, 0)
  downloading = 0
  downloadResult = failed > 0 ? t("downloadFailed", [failed]) : t("downloadDone")
  showDownloadState()
}

/* ---------- steps 5 and 6: services ---------- */

/** Fields and connection test of the service a tier uses. */
function renderServicePanel(box: HTMLElement, id: string | null): void {
  const p = id ? getPreset(id) : undefined
  if (!p) return void box.replaceChildren()
  const cfg = providerConfig(session, p.id)
  const state: PanelState = {
    p,
    cfg,
    session,
    addWhileTyping: (value) => {
      if (value) cfg.enabled = true
    },
  }
  const result = testResult()
  box.replaceChildren(providerTitle(p), ...providerFields(state), h("div", { className: "row" }, testButton(state, result)), result)
}

/** Every AI service; the AI tier uses the chosen one. */
function fillAiServices(): void {
  fillSelect($<HTMLSelectElement>("aiService"), tierOptions(settings, "ai", getI18n(), true).slice(1), settings.tiers.ai ?? "")
}

/* ---------- step 8: trial ---------- */

/** Translate the trial message with the current settings, or show the original again. */
async function tryIt(): Promise<void> {
  const sample = $("trySample")
  const button = $("tryIt")
  client ??= connectContent({ root: () => sample })
  if (client.controller.active) {
    client.controller.stop()
    button.textContent = t("buttonTryIt")
    return
  }
  sample.replaceChildren(...paragraphs(TRY_MAIL[trialLanguage(settings)]))
  sample.hidden = false
  button.textContent = t("popupShowOriginal")
  await session.flush()
  await client.ready
  await client.controller.start()
}

/* ---------- language of the page ---------- */

function applyLanguage(): void {
  const i18n = getI18n()
  localizeDocument(i18n)
  fillSelect($<HTMLSelectElement>("uiLanguage"), uiLanguageOptions(i18n), settings.uiLanguage)
  fillSelect($<HTMLSelectElement>("sourceLang"), sourceLanguageOptions(i18n), settings.sourceLang)
  fillSelect($<HTMLSelectElement>("targetLang"), languageOptions(i18n), settings.targetLang)
  fillTierSelects(settings, true)
  renderStepList()
  prompts.refresh()
  dictionaries.render()
  bergamot.render()
  if (client?.controller.active) $("tryIt").textContent = t("popupShowOriginal")
  enterStep()
}

async function changeUiLanguage(value: unknown): Promise<void> {
  settings.uiLanguage = normalizeUiLanguageSetting(value)
  await loadExtensionI18n(settings.uiLanguage)
  applyLanguage()
}

/** Changes made elsewhere (popup, settings page) were taken over. */
function remoteChanged(before: Settings): void {
  if (settings.uiLanguage !== before.uiLanguage) return void changeUiLanguage(settings.uiLanguage)
  fillTierSelects(settings, true)
  renderStepList()
  showSameLanguage()
  const section = document.querySelector(`section[data-step="${step}"]`)
  const shown = (s: Settings) => JSON.stringify([s.tiers, s.mode, s.style, s.sourceLang, s.targetLang])
  // Redraw the step unless the user is typing in it.
  if (shown(settings) !== shown(before) && !section?.contains(document.activeElement)) enterStep()
}

async function main(): Promise<void> {
  session = await SettingsSession.open()
  settings = session.settings
  session.onRemoteChange = remoteChanged
  session.onSaved = showSaved
  session.onSaveError = showSaveError
  const lists = {
    languages: () => ({ source: settings.sourceLang, target: settings.targetLang }),
    recommended: () => recommendedFor(settings),
    pick: true,
    onRender: showDownloadState,
  }
  dictionaries = new DictionarySection({
    ...lists,
    tag: () => settings.dictionary.releaseTag,
    list: $("dictList"),
    status: $("dictStatus"),
    common: $("dictCommon"),
    filter: $<HTMLInputElement>("dictFilter"),
    fetchFn: releaseFetch,
  })
  bergamot = new BergamotSection({
    ...lists,
    list: $("bergamotList"),
    status: $("bergamotStatus"),
    common: $("bergamotCommon"),
    needed: $("bergamotNeeded"),
    filter: $<HTMLInputElement>("bergamotFilter"),
  })
  prompts = new PromptEditor($("promptEditor"), session)
  mountStyleControls($("styleControls"), session, renderModePreview)
  demo = new TierDemo($("tierDemo"), $("demoStatus"))
  tour = new TierTour(() => {
    toured = true
    void saveState({ step })
  })
  await Promise.all([loadExtensionI18n(settings.uiLanguage), loadSystemLanguages()])

  // Step 1
  const uiLanguage = $<HTMLSelectElement>("uiLanguage")
  uiLanguage.addEventListener("change", () => {
    void changeUiLanguage(uiLanguage.value)
    session.save()
  })
  for (const id of ["sourceLang", "targetLang"] as const) {
    session.bind(id, "change", (el) => (el.value = settings[id]), (el) => {
      settings[id] = el.value
      showSameLanguage()
    })
  }
  showSameLanguage()

  // Step 2
  for (const radio of Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'))) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return
      settings.mode = radio.value as DisplayMode
      renderModePreview()
      session.save()
    })
  }

  // Step 3: at least one tier keeps a service.
  onTierChange(() => settings.tiers, setTier)
  $("demoReplay").addEventListener("click", () => demo.play(settings))
  $("tourAgain").addEventListener("click", (e) => {
    e.preventDefault()
    tour.start()
  })
  addEventListener("pagehide", () => leaveTiers(false))

  // Step 4
  $("downloadPicked").addEventListener("click", () => void downloadPicked())
  $("dictFilter").addEventListener("input", () => dictionaries.render())
  $("bergamotFilter").addEventListener("input", () => bergamot.render())

  // Step 6
  const aiService = $<HTMLSelectElement>("aiService")
  aiService.addEventListener("change", () => {
    setTier("ai", aiService.value)
    renderServicePanel($("aiPanel"), settings.tiers.ai)
  })
  session.bindCheck("preciseEnabled", () => settings.precise.enabled, (v) => (settings.precise.enabled = v))

  // Step 8
  session.bindCheck("autoTranslate", () => settings.autoTranslate, (v) => (settings.autoTranslate = v))
  $("tryIt").addEventListener("click", () => void tryIt())
  $("openOptions").addEventListener("click", () => void ext.runtime.openOptionsPage())

  // Navigation
  $("prevStep").addEventListener("click", () => {
    const prev = neighbourStep(step, settings, -1)
    if (prev) void go(prev)
  })
  const forward = () => {
    const next = neighbourStep(step, settings, 1)
    void (next ? go(next) : finish())
  }
  $("nextStep").addEventListener("click", forward)
  $("skipStep").addEventListener("click", forward)
  $("exitGuide").addEventListener("click", () => void exit())

  const stored = (await ext.storage.local.get(WELCOME_KEY))[WELCOME_KEY] as WelcomeState | undefined
  toured = stored?.toured === true
  step = resumeStep(stored, settings)
  applyLanguage()
  await go(step, false)
  if (__DEBUG__) console.info("[thunderbird-translate] welcome page open at step", step)
  // Test build (npm run e2e): the background script opens the page for a scenario to have the offline step walked through.
  welcomeProbe?.()
}

void main()
