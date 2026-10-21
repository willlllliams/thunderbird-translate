/**
 * Configuration fields of one translation service and its connection test,
 * shared by the settings page (service panel) and the welcome page.
 */

import { supportsThinkingControl } from "../shared/thinking"
import { describeError } from "../shared/errors"
import { getI18n, type MessageKey, t } from "../shared/i18n"
import { send } from "../shared/messages"
import { checkBaseURL, type ProviderPreset, providerDisplayName } from "../shared/providers"
import { type BaiduEdition, DEFAULT_DEEPL, emptyProviderConfig, type ProviderConfig } from "../shared/settings"
import { button, h, setTitle } from "../shared/dom"
import { isLoopback } from "../shared/hosts"
import { hostAccessLine, requestHostAccess } from "./host-access"
import type { SettingsSession } from "./session"

/** The service shown and its configuration. */
interface PanelState {
  p: ProviderPreset
  cfg: ProviderConfig
  session: SettingsSession
  /** Typing a key (or the DeepLX endpoint) adds the service; the fields are not redrawn, so the field keeps the focus. */
  addWhileTyping: (value: string) => void
}

/** The configuration of a service in the settings, created when missing. */
export function providerConfig(session: SettingsSession, id: string): ProviderConfig {
  session.settings.providers[id] ??= emptyProviderConfig()
  return session.settings.providers[id]
}

/** A labelled field; `tip` is the hover text of the label and its control. */
function field(label: string, input: HTMLElement, tip: string, hint?: string): HTMLElement {
  const el = h("label", { className: "panel-field" }, h("span", { text: label }), input, hint ? h("span", { className: "hint", text: hint }) : null)
  setTitle(el, tip)
  return el
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
    children.push(h("div", { className: "row" }, h("span", { text: t("warnBaseUrlDefault", [p.defaultBaseURL]) }), button(t("buttonRestoreBaseUrl"), restore, false, t("tipRestoreBaseUrl"))))
  }
  box.replaceChildren(...children)
  box.hidden = false
}

/** Failure of the connection test: a title, then reason, server message, suggestions and URL on their own lines. */
function showTestFailure(box: HTMLElement, description: string | undefined, title: MessageKey = "testFailed"): void {
  const text = description?.trim() ? description : describeError(undefined, getI18n())
  const [reason, ...rest] = text.split("\n").filter((line) => line.trim())
  box.className = `test-result fail${box.classList.contains("reach") ? " reach" : ""}`
  box.replaceChildren(
    h("div", { className: "test-title", text: t(title) }),
    h("div", { className: "test-reason", text: reason }),
    ...rest.map((line) => h("div", { className: "test-line", text: line })),
  )
}

/** Endpoint field with the URL check, the note on an address of this computer, and the line asking for access to the endpoint. */
function endpointField({ p, cfg, session, addWhileTyping }: PanelState, label: string, hint?: string): HTMLElement {
  const baseURL = h("input", { type: "text", value: cfg.baseURL, placeholder: p.defaultBaseURL || "https://…", spellcheck: "false" })
  const warning = h("div", { className: "field-warning", role: "status" })
  const loopback = h("span", { className: "hint", text: t("hintLoopback") })
  const access = hostAccessLine(p.id, cfg)
  const showLoopback = () => (loopback.hidden = !isLoopback(cfg.baseURL || p.defaultBaseURL))
  showLoopback()
  const validate = () =>
    renderBaseUrlWarning(warning, p, baseURL, () => {
      cfg.baseURL = ""
      baseURL.value = ""
      validate()
      session.save()
    })
  baseURL.addEventListener("input", () => {
    cfg.baseURL = baseURL.value.trim()
    if (p.kind === "deeplx") addWhileTyping(cfg.baseURL)
    showLoopback()
    session.save()
  })
  // Checked when the value is committed (blur / Enter), not on every keystroke.
  baseURL.addEventListener("change", () => {
    validate()
    access.refresh()
  })
  validate()
  const tip = p.kind === "deeplx" ? t("tipDeeplxUrl") : p.defaultBaseURL ? t("tipBaseUrlDefault") : t("tipBaseUrl")
  return h("div", { className: "field-group" }, field(label, baseURL, tip, hint), loopback, warning, access.el)
}

/** Key / token field, hidden by default and with a button to show it; `onKey` hears the key as typed, and once at the start. */
function keyField({ cfg, session, addWhileTyping }: PanelState, label: string, onKey?: (key: string) => void): HTMLElement {
  const key = h("input", { type: "password", value: cfg.apiKey, autocomplete: "off", spellcheck: "false" })
  key.addEventListener("input", () => {
    cfg.apiKey = key.value.trim()
    addWhileTyping(cfg.apiKey)
    onKey?.(cfg.apiKey)
    session.save()
  })
  onKey?.(cfg.apiKey)
  const show = h("button", { type: "button", text: t("buttonShowKey"), title: t("tipShowKey") })
  show.addEventListener("click", () => {
    const hidden = key.type === "password"
    key.type = hidden ? "text" : "password"
    show.textContent = hidden ? t("buttonHideKey") : t("buttonShowKey")
  })
  return field(label, h("div", { className: "row" }, key, show), t("tipApiKey"), t("hintKeyLocal"))
}

/** Two interfaces: the free Edge endpoints, or Azure Translator with the user's key. The fields of the second are hidden in the first. */
function microsoftFields(state: PanelState): HTMLElement[] {
  const { p, cfg, session } = state
  const freeHint = h("p", { className: "hint", text: t("hintFree"), hidden: cfg.mode === "key" })
  const region = h("input", { type: "text", value: cfg.region ?? "", placeholder: "westeurope", spellcheck: "false" })
  region.addEventListener("input", () => {
    cfg.region = region.value.trim()
    session.save()
  })
  const fields = h(
    "div",
    { className: "azure-fields", hidden: cfg.mode !== "key" },
    endpointField(state, t("labelAzureEndpoint"), t("hintAzureEndpoint")),
    keyField(state, t("labelApiKey")),
    field(t("labelRegion"), region, t("tipRegion"), t("hintAzureRegion")),
    h("a", { href: p.docsUrl, target: "_blank", rel: "noopener", text: t("getKey"), title: t("tipGetKey") }),
  )
  const radio = (value: "free" | "key", label: string, tip: string) => {
    const input = h("input", { type: "radio", name: "microsoftMode", value, checked: (cfg.mode ?? "free") === value })
    input.addEventListener("change", () => {
      if (!input.checked) return
      if (value === "key") cfg.mode = "key"
      else delete cfg.mode
      freeHint.hidden = value === "key"
      fields.hidden = value !== "key"
      session.save()
    })
    const el = h("label", {}, input, h("span", { text: label }))
    setTitle(el, tip)
    return el
  }
  const modeSwitch = h("div", { className: "mode-switch" }, radio("free", t("microsoftModeFree"), t("tipMicrosoftFree")), radio("key", t("microsoftModeKey"), t("tipMicrosoftKey")))
  return [h("div", { className: "panel-field" }, h("span", { text: t("microsoftModeLabel") }), modeSwitch), freeHint, fields]
}

/** A list of choices, each a value and its label; `hint` the line under it. */
function choiceField<T extends string>(session: SettingsSession, label: string, tip: string, choices: [T, string][], value: T, set: (value: T) => void, hint?: HTMLElement): HTMLElement {
  const select = h("select", {}, ...choices.map(([v, text]) => h("option", { value: v, text, selected: v === value })))
  select.addEventListener("change", () => {
    set(select.value as T)
    session.save()
  })
  const el = field(label, select, tip)
  if (hint) el.append(hint)
  return el
}

/** The app ID of Baidu and Youdao; `hint` the line under it. */
function appIdField({ cfg, session }: PanelState, hint?: string): HTMLElement {
  const appId = h("input", { type: "text", value: cfg.appId ?? "", autocomplete: "off", spellcheck: "false" })
  appId.addEventListener("input", () => {
    cfg.appId = appId.value.trim()
    session.save()
  })
  return field(t("labelAppId"), appId, t("tipAppId"), hint)
}

/** DeepL: key (free or Pro), endpoint, formality and the target variants of English and Portuguese. */
function deeplFields(state: PanelState): HTMLElement[] {
  const { cfg, session } = state
  const plan = h("span", { className: "hint" })
  const options = () => (cfg.deepl ??= { ...DEFAULT_DEEPL })
  const value = cfg.deepl ?? DEFAULT_DEEPL
  const key = keyField(state, t("labelApiKey"), (k) => (plan.textContent = k ? t(k.endsWith(":fx") ? "hintDeeplFreeKey" : "hintDeeplProKey") : ""))
  key.append(plan)
  return [
    key,
    endpointField(state, t("labelBaseURL"), t("hintDeeplEndpoint")),
    choiceField(session, t("labelFormality"), t("tipFormality"), [["default", t("formalityDefault")], ["more", t("formalityMore")], ["less", t("formalityLess")]], value.formality, (v) => (options().formality = v)),
    choiceField(session, t("labelDeeplEnglish"), t("tipDeeplVariant"), [["EN-US", t("variantEnUs")], ["EN-GB", t("variantEnGb")]], value.english, (v) => (options().english = v)),
    choiceField(session, t("labelDeeplPortuguese"), t("tipDeeplVariant"), [["PT-BR", t("variantPtBr")], ["PT-PT", t("variantPtPt")]], value.portuguese, (v) => (options().portuguese = v)),
  ]
}

/** Baidu: app ID, secret key and the edition of the account, with its quota and the languages it lacks. */
function baiduFields(state: PanelState): HTMLElement[] {
  const { cfg, session } = state
  const hint = h("span", { className: "hint" })
  const showEdition = (edition: BaiduEdition) => (hint.textContent = t(edition === "premium" ? "hintBaiduPremium" : edition === "advanced" ? "hintBaiduAdvanced" : "hintBaiduStandard"))
  showEdition(cfg.edition ?? "standard")
  const editions: [BaiduEdition, string][] = [["standard", t("baiduStandard")], ["advanced", t("baiduAdvanced")], ["premium", t("baiduPremium")]]
  return [
    appIdField(state, t("hintBaiduAppId")),
    keyField(state, t("labelSecretKey")),
    choiceField(session, t("labelBaiduEdition"), t("tipBaiduEdition"), editions, cfg.edition ?? "standard", (v) => showEdition((cfg.edition = v)), hint),
  ]
}

/** Model, temperature and thinking switch of an AI service. */
function llmFields({ p, cfg, session }: PanelState): HTMLElement[] {
  const listId = `models-${p.id}`
  const model = h("input", { type: "text", value: cfg.model, placeholder: p.defaultModel, list: listId, spellcheck: "false" })
  const datalist = h("datalist", { id: listId }, ...p.models.map((m) => h("option", { value: m })))
  model.addEventListener("input", () => {
    cfg.model = model.value.trim()
    session.save()
  })

  const temperature = cfg.temperature === undefined ? p.defaultTemperature : cfg.temperature
  const temp = h("input", { type: "number", min: "0", max: "2", step: "0.1", value: temperature === null ? "" : String(temperature) })
  temp.addEventListener("input", () => {
    const v = temp.value.trim()
    cfg.temperature = v === "" ? null : Math.min(2, Math.max(0, Number(v)))
    session.save()
  })

  const supported = supportsThinkingControl(p.id)
  const thinking = h("input", { type: "checkbox", checked: supported && cfg.thinking === true, disabled: !supported })
  const thinkingField = h("label", { className: "check" }, thinking, h("span", { text: t("labelThinking") }))
  setTitle(thinkingField, t("tipThinking"))
  thinking.addEventListener("change", () => {
    cfg.thinking = thinking.checked
    session.save()
  })
  return [
    field(t("labelModel"), h("div", {}, model, datalist), t("tipModel")),
    field(t("labelTemperature"), temp, t("tipTemperature")),
    h(
      "div",
      { className: "field-group" },
      thinkingField,
      h("span", { className: "hint", text: supported ? t("hintThinking") : t("hintThinkingUnsupported") }),
    ),
  ]
}

/** Title of a service with the link to its key or documentation. */
function providerTitle(p: ProviderPreset): HTMLElement {
  const title = h("div", { className: "row" }, h("h3", { text: providerDisplayName(p) }))
  if (p.docsUrl && p.kind !== "microsoft") title.append(h("a", { href: p.docsUrl, target: "_blank", rel: "noopener", text: t("getKey"), title: t("tipGetKey") }))
  return title
}

/** The configuration fields of a service, by kind. */
function providerFields(state: PanelState): HTMLElement[] {
  const { p } = state
  switch (p.kind) {
    case "google":
      return [h("p", { className: "hint", text: t("hintFree") })]
    case "dictionary":
      return [h("p", { className: "hint", text: t("hintDictionaryProvider") })]
    case "bergamot":
      return [h("p", { className: "hint", text: t("hintBergamot") })]
    case "microsoft":
      return microsoftFields(state)
    case "deepl":
      return deeplFields(state)
    case "baidu":
      return baiduFields(state)
    case "youdao":
      return [appIdField(state), keyField(state, t("labelAppSecret"))]
    case "caiyun":
      return [keyField(state, t("labelToken")), h("p", { className: "hint", text: t("hintCaiyun") })]
  }
  let baseHint: string | undefined
  if (p.id === "azure") baseHint = t("hintAzure")
  else if (p.id === "ollama") baseHint = t("hintOllama")
  else if (p.kind === "deeplx") baseHint = t("hintDeeplx")
  return [
    endpointField(state, p.kind === "deeplx" ? t("labelDeeplxURL") : t("labelBaseURL"), baseHint),
    keyField(state, p.kind === "deeplx" ? t("labelDeeplxToken") : t("labelApiKey")),
    ...(p.kind === "llm" ? llmFields(state) : []),
  ]
}

/** Connection test with the configuration as it is on screen, saved or not; the result goes into `result`. */
function testButton({ p, cfg, session }: PanelState, result: HTMLElement): HTMLButtonElement {
  const test = h("button", { type: "button", text: t("buttonTest"), title: t("tipTest") })
  test.addEventListener("click", async () => {
    // First, while the click is being handled: Thunderbird asks the user only from a user action.
    const access = requestHostAccess(p.id, cfg)
    result.className = "test-result"
    result.textContent = t("testRunning")
    test.disabled = true
    try {
      // Without the permission the background script refuses the test and says why.
      await access
      const r = await send({ type: "testProvider", providerId: p.id, config: { ...cfg }, targetLang: session.settings.targetLang })
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

/** Box for the result of the connection test. */
function testResult(): HTMLElement {
  return h("div", { className: "test-result", "aria-live": "polite" })
}

/** The free routes the pages check by themselves when they show them: some networks block them, Google in mainland China. */
const CHECKED_SERVICES: ReadonlySet<string> = new Set(["google-free", "microsoft-free"])

/** The check starts this long after the panel was drawn, so that a service shown in passing sends nothing. */
export const REACH_DELAY_MS = 600

/** The check of each service, once per page view; a failed one is kept as well. */
const reached = new Map<string, Promise<{ ok: true; ms: number } | { ok: false; error: string }>>()

/** The check of `p`: the fixed sentence of "Test connection", never message text, with the time of the answer. */
function checkReach({ p, cfg, session }: PanelState) {
  let check = reached.get(p.id)
  if (!check) {
    const start = performance.now()
    check = send({ type: "testProvider", providerId: p.id, config: { ...cfg }, targetLang: session.settings.targetLang }).then(
      (r) => (r?.ok ? { ok: true as const, ms: Math.round(performance.now() - start) } : { ok: false as const, error: r?.error ?? "" }),
      (error: unknown) => ({ ok: false as const, error: describeError(error, getI18n()) }),
    )
    reached.set(p.id, check)
  }
  return check
}

/**
 * The line with the connection check of a free route that is added: reachable with the time of the answer, or not
 * with the reason, which for a network that blocks the route names the services that work without it. Nothing is
 * sent while Thunderbird is offline; null for the other services and for Microsoft with an Azure key.
 */
function reachLine(state: PanelState): HTMLElement | null {
  const { p, cfg } = state
  if (!CHECKED_SERVICES.has(p.id) || !cfg.enabled || cfg.mode === "key") return null
  const line = h("div", { className: "test-result reach", role: "status" })
  if (!navigator.onLine) {
    line.textContent = t("reachOffline")
    return line
  }
  line.textContent = t("reachRunning")
  setTimeout(() => {
    if (!line.isConnected) return
    void checkReach(state).then((r) => {
      if (r.ok) {
        line.className = "test-result reach ok"
        line.textContent = t("reachOk", [r.ms])
      } else showTestFailure(line, r.error, "reachFailed")
    })
  }, REACH_DELAY_MS)
  return line
}

/**
 * The panel of a service, as the settings page and the setup guide show it: its title, its fields, the check of a
 * free route, a row with the test button, followed by `actions` (the page's buttons, given the test button to put
 * first) and `after` the row, then the result of the test.
 */
export function servicePanel(session: SettingsSession, p: ProviderPreset, addWhileTyping: PanelState["addWhileTyping"], actions?: (test: HTMLButtonElement) => HTMLElement, after: Node[] = []): Node[] {
  const state: PanelState = { p, cfg: providerConfig(session, p.id), session, addWhileTyping }
  const result = testResult()
  const test = testButton(state, result)
  const reach = reachLine(state)
  return [providerTitle(p), ...providerFields(state), ...(reach ? [reach] : []), actions ? actions(test) : h("div", { className: "row" }, test), ...after, result]
}
