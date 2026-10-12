/** Small DOM builder for the settings page; avoids innerHTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean>> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue
    if (k === "className") el.className = String(v)
    else if (k === "text") el.textContent = String(v)
    else el.setAttribute(k, v === true ? "" : String(v))
  }
  for (const c of children) if (c !== null) el.append(c)
  return el
}

/** A button that runs `onClick`; `primary` for the main action of its row, `title` its hover text. */
export function button(text: string, onClick: () => void, primary = false, title?: string): HTMLButtonElement {
  const b = h("button", { type: "button", className: primary ? "primary" : undefined, text, title })
  b.addEventListener("click", onClick)
  return b
}

/**
 * Hover text of an element. On a <label> it goes to the control the label
 * holds as well: the text then shows over the label's words and over the
 * control, and the control takes it as its accessible description while its
 * name still comes from the label.
 */
export function setTitle(el: HTMLElement, text: string): void {
  el.title = text
  const control = el.tagName === "LABEL" ? (el as HTMLLabelElement).control : null
  if (control) control.title = text
}
