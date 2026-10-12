/**
 * Controls of the translation style, shared by the settings page and the
 * display step of the welcome page: preset, accent colour, text colour with
 * "Restore default", opacity and font size. Their texts carry data-i18n, so
 * the page's localizeDocument() writes them.
 */

import type { MessageKey } from "../shared/i18n"
import type { StylePreset } from "../shared/settings"
import { h } from "../shared/dom"
import type { Control, SettingsSession } from "./session"

const PRESETS: Record<StylePreset, MessageKey> = { border: "styleBorder", dashed: "styleDashed", highlight: "styleHighlight", plain: "stylePlain" }

/** "#rrggbb" of a computed colour such as "rgb(32, 33, 36)"; black when it cannot be read. */
function hexColor(computed: string): string {
  const hex = `#${(computed.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`
  return hex.length === 7 ? hex : "#000000"
}

/** Build the controls into `box` and bind them to the style of the session's settings; `changed` redraws the preview. */
export function mountStyleControls(box: HTMLElement, session: SettingsSession, changed: () => void): void {
  const st = session.settings.style
  const field = (key: MessageKey, control: HTMLElement) => h("label", {}, h("span", { "data-i18n": key }), control)
  const input = (id: string, props: Record<string, string>) => h("input", { id, ...props })
  const range = (id: string, min: string, max: string) => input(id, { type: "range", min, max, step: "0.05" })
  const reset = h("button", { type: "button", id: "styleTextColorReset", "data-i18n": "buttonResetDefault" })
  const auto = h("span", { id: "styleTextColorAuto", className: "hint", "data-i18n": "textColorAuto" })
  box.replaceChildren(
    field("labelStylePreset", h("select", { id: "stylePreset" }, ...Object.entries(PRESETS).map(([value, key]) => h("option", { value, "data-i18n": key })))),
    field("labelColor", input("styleColor", { type: "color" })),
    h("div", {}, field("labelTextColor", input("styleTextColor", { type: "color" })), h("span", { className: "row" }, reset, auto)),
    field("labelOpacity", range("styleOpacity", "0.3", "1")),
    field("labelFontScale", range("styleFontScale", "0.7", "1.5")),
  )
  // Without a colour of its own the field shows the colour of the page text, next to "Follows the message".
  const showTextColor = (el: Control) => {
    el.value = st.textColor || hexColor(getComputedStyle(box).color)
    reset.disabled = !st.textColor
    auto.hidden = Boolean(st.textColor)
  }
  const apply = (change: (el: Control) => void) => (el: Control) => {
    change(el)
    changed()
  }
  session.bind("stylePreset", "change", (el) => (el.value = st.preset), apply((el) => (st.preset = el.value as StylePreset)))
  session.bind("styleColor", "input", (el) => (el.value = st.color), apply((el) => (st.color = el.value)))
  const text = session.bind("styleTextColor", "input", showTextColor, apply((el) => {
    st.textColor = el.value
    showTextColor(el)
  }))
  session.bind("styleOpacity", "input", (el) => (el.value = String(st.opacity)), apply((el) => (st.opacity = Number(el.value))))
  session.bind("styleFontScale", "input", (el) => (el.value = String(st.fontScale)), apply((el) => (st.fontScale = Number(el.value))))
  reset.addEventListener("click", () => {
    st.textColor = ""
    showTextColor(text)
    changed()
    session.save()
  })
}
