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

/** A button that runs `onClick`; `primary` for the main action of its row. */
export function button(text: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = h("button", { type: "button", className: primary ? "primary" : undefined, text })
  b.addEventListener("click", onClick)
  return b
}
