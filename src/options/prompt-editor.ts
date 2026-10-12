/**
 * The three prompts of the AI tier with their "Restore built-in prompt"
 * buttons, and the preset library that adds rules to one of them; its first
 * entry, "Plain", removes the rules that presets added. Shared by
 * the settings page and the welcome page. Static texts carry data-i18n, so
 * localizeDocument() translates them; refresh() fills what depends on the
 * interface or target language. A box shows the built-in prompt while the
 * setting is empty, and a box left with the built-in text stores nothing,
 * so later releases can improve the prompt.
 */

import { type MessageKey, t } from "../shared/i18n"
import { fillSelect } from "../shared/page"
import { applyPreset, availablePresets, getPromptPreset, NO_PRESET, PRESET_EXAMPLE_SOURCE, type PresetOption, presetOptions, type PromptPreset, removePresets } from "../shared/prompt-presets"
import { DEFAULT_PROMPTS, PROMPT_KINDS, type PromptKind, promptText } from "../shared/prompts"
import { promptKindFor } from "../shared/settings"
import { h } from "../shared/dom"
import type { SettingsSession } from "./session"

const KIND_LABELS: Record<PromptKind, MessageKey> = {
  bilingual: "labelPromptBilingual",
  translationOnly: "labelPromptTranslationOnly",
  precise: "labelPromptPrecise",
}

/** Short names of the prompts in the "Apply to" list. */
const KIND_NAMES: Record<PromptKind, MessageKey> = { bilingual: "modeBilingual", translationOnly: "modeTranslationOnly", precise: "labelPrecise" }

const labelled = (key: MessageKey, control: HTMLElement) => h("label", {}, h("span", { "data-i18n": key }), control)

export class PromptEditor {
  private readonly preset = h("select", { id: "presetId" })
  private readonly option = h("select", { id: "presetOption" })
  private readonly kind = h("select", { id: "presetKind" })
  private readonly optionField = labelled("presetOptionLabel", this.option)
  private readonly hint = h("p", { className: "hint", id: "presetHint" })
  private readonly example = h("p", { className: "preset-example", id: "presetExample" })
  private readonly status = h("p", { className: "hint", id: "presetStatus", role: "status" })
  private readonly boxes = {} as Record<PromptKind, HTMLTextAreaElement>

  constructor(
    container: HTMLElement,
    private readonly session: SettingsSession,
  ) {
    const apply = h("button", { type: "button", className: "primary", id: "presetApply", "data-i18n": "buttonApplyPreset" })
    apply.addEventListener("click", () => this.apply())
    this.preset.addEventListener("change", () => {
      this.status.textContent = ""
      this.showPreset()
    })
    this.option.addEventListener("change", () => this.showExample())
    const presets = h(
      "div",
      { className: "presets" },
      h("h3", { "data-i18n": "presetsTitle" }),
      h("p", { className: "hint", "data-i18n": "presetsHint" }),
      h("div", { className: "grid" }, labelled("presetLabel", this.preset), this.optionField, labelled("presetKindLabel", this.kind)),
      this.hint,
      this.example,
      h("div", { className: "row" }, apply, this.status),
    )
    container.replaceChildren(presets, ...PROMPT_KINDS.map((kind) => this.promptBox(kind)))
    // A new target language from another page changes the options of the presets.
    let target = session.settings.targetLang
    session.track(this.preset, () => {
      if (target !== (target = session.settings.targetLang)) this.refresh()
    })
  }

  private promptBox(kind: PromptKind): HTMLElement {
    const s = this.session
    const box = h("textarea", { id: `prompt-${kind}`, rows: "9", spellcheck: "false", placeholder: DEFAULT_PROMPTS[kind] })
    this.boxes[kind] = box
    s.track(box, () => (box.value = promptText(s.settings.prompts, kind)))
    box.addEventListener("input", () => {
      s.settings.prompts[kind] = box.value.trim() === DEFAULT_PROMPTS[kind] ? "" : box.value
      s.save()
    })
    const reset = h("button", { type: "button", id: `reset-${kind}`, "data-i18n": "buttonResetPrompt" })
    reset.addEventListener("click", () => this.setPrompt(kind, ""))
    return h("div", { className: "prompt" }, h("label", { for: box.id, "data-i18n": KIND_LABELS[kind] }), box, reset)
  }

  /** Store a prompt; "" stands for the built-in one. */
  private setPrompt(kind: PromptKind, text: string): void {
    this.session.settings.prompts[kind] = text
    this.boxes[kind].value = promptText(this.session.settings.prompts, kind)
    this.session.save()
  }

  /** The chosen preset and option; no preset for "Plain". */
  private current(): { preset?: PromptPreset; option?: PresetOption } {
    const preset = getPromptPreset(this.preset.value)
    return { preset, option: preset && presetOptions(preset, this.session.settings.targetLang).find((o) => o.id === this.option.value) }
  }

  /** Fill the lists for the interface and target language, keeping the choices that are still offered. */
  refresh(): void {
    const presets = availablePresets(this.session.settings.targetLang)
    const chosen = presets.some((p) => p.id === this.preset.value) ? this.preset.value : NO_PRESET
    fillSelect(this.preset, [new Option(t("presetNone"), NO_PRESET), ...presets.map((p) => new Option(t(p.nameKey), p.id))], chosen)
    fillSelect(this.kind, PROMPT_KINDS.map((k) => new Option(t(KIND_NAMES[k]), k)), this.kind.value || promptKindFor(this.session.settings))
    this.showPreset()
  }

  private showPreset(): void {
    const preset = getPromptPreset(this.preset.value)
    const options = preset ? presetOptions(preset, this.session.settings.targetLang) : []
    const chosen = options.some((o) => o.id === this.option.value) ? this.option.value : (options[0]?.id ?? "")
    fillSelect(this.option, options.map((o) => new Option(t(o.nameKey), o.id)), chosen)
    this.optionField.hidden = options.length === 0
    this.hint.textContent = t(preset?.hintKey ?? "presetNoneHint")
    this.showExample()
  }

  /** "Example: source → expected translation". */
  private showExample(): void {
    const { preset, option } = this.current()
    if (!preset) return void this.example.replaceChildren(t("presetNoneExample"))
    const exampleKey = option?.exampleKey ?? preset.exampleKey
    const [source, result] = option?.example ?? [PRESET_EXAMPLE_SOURCE, exampleKey ? t(exampleKey) : ""]
    this.example.replaceChildren(h("span", { text: t("presetExample") }), " ", h("q", {}, source), " → ", h("q", {}, result))
  }

  private apply(): void {
    const { preset, option } = this.current()
    const kind = this.kind.value as PromptKind
    const prompt = promptText(this.session.settings.prompts, kind)
    if (preset) {
      this.setPrompt(kind, applyPreset(prompt, preset, option))
      this.status.textContent = t("presetApplied", [t(KIND_NAMES[kind])])
      return
    }
    // What is left may be the built-in prompt itself, which is stored as "".
    const plain = removePresets(prompt)
    this.setPrompt(kind, plain === DEFAULT_PROMPTS[kind].trim() ? "" : plain)
    this.status.textContent = t("presetRemoved", [t(KIND_NAMES[kind])])
  }
}
