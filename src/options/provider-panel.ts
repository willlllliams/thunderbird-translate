/**
 * Configuration fields of one translation service and its connection test,
 * shared by the settings page (service panel) and the welcome page.
 */

import { supportsThinkingControl } from "../shared/thinking"
import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import type { TranslateResponse } from "../shared/messages"
import { send } from "../shared/page"
import { checkBaseURL, type ProviderPreset, providerDisplayName } from "../shared/providers"
import { emptyProviderConfig, type ProviderConfig } from "../shared/settings"
import { button, h } from "../shared/dom"
import type { SettingsSession } from "./session"

/** The service shown and its configuration. */
export interface PanelState {
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
    children.push(h("div", { className: "row" }, h("span", { text: t("warnBaseUrlDefault", [p.defaultBaseURL]) }), button(t("buttonRestoreBaseUrl"), restore)))
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

/** Endpoint field with the URL check. */
function endpointField({ p, cfg, session, addWhileTyping }: PanelState, label: string, hint?: string): HTMLElement {
  const baseURL = h("input", { type: "text", value: cfg.baseURL, placeholder: p.defaultBaseURL || "https://…", spellcheck: "false" })
  const warning = h("div", { className: "field-warning", role: "status" })
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
    session.save()
  })
  // Checked when the value is committed (blur / Enter), not on every keystroke.
  baseURL.addEventListener("change", validate)
  validate()
  return h("div", { className: "field-group" }, field(label, baseURL, hint), warning)
}

/** Key / token field, hidden by default and with a button to show it. */
function keyField({ cfg, session, addWhileTyping }: PanelState, label: string): HTMLElement {
  const key = h("input", { type: "password", value: cfg.apiKey, autocomplete: "off", spellcheck: "false" })
  key.addEventListener("input", () => {
    cfg.apiKey = key.value.trim()
    addWhileTyping(cfg.apiKey)
    session.save()
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
      session.save()
    })
    return h("label", {}, input, h("span", { text: label }))
  }
  const modeSwitch = h("div", { className: "mode-switch" }, radio("free", t("microsoftModeFree")), radio("key", t("microsoftModeKey")))
  return [h("div", { className: "panel-field" }, h("span", { text: t("microsoftModeLabel") }), modeSwitch), freeHint, fields]
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
  thinking.addEventListener("change", () => {
    cfg.thinking = thinking.checked
    session.save()
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

/** Title of a service with the link to its key or documentation. */
export function providerTitle(p: ProviderPreset): HTMLElement {
  const title = h("div", { className: "row" }, h("h3", { text: providerDisplayName(p) }))
  if (p.docsUrl && p.kind !== "microsoft") title.append(h("a", { href: p.docsUrl, target: "_blank", rel: "noopener", text: t("getKey") }))
  return title
}

/** The configuration fields of a service, by kind. */
export function providerFields(state: PanelState): HTMLElement[] {
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
export function testButton({ p, cfg, session }: PanelState, result: HTMLElement): HTMLButtonElement {
  const test = h("button", { type: "button", text: t("buttonTest") })
  test.addEventListener("click", async () => {
    result.className = "test-result"
    result.textContent = t("testRunning")
    test.disabled = true
    try {
      const r = await send<TranslateResponse | undefined>({ type: "testProvider", providerId: p.id, config: { ...cfg }, targetLang: session.settings.targetLang })
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
export function testResult(): HTMLElement {
  return h("div", { className: "test-result", "aria-live": "polite" })
}
