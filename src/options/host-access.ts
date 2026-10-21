/**
 * The permission to connect to the endpoint of a service, on the settings
 * page and in the setup guide. The fixed addresses are host permissions of
 * the manifest; an address the user typed needs an optional host permission,
 * which Thunderbird grants only from a click (permissions.request() needs a
 * user action, so it is the first call of the click handler).
 */

import { ext } from "../shared/ext"
import { patternHost, providerOrigin } from "../shared/hosts"
import { t } from "../shared/i18n"
import { getPreset } from "../shared/providers"
import { type ProviderConfig, resolveProviderConfig } from "../shared/settings"
import { button, h } from "../shared/dom"

/** The match pattern a service needs with this configuration; null for the offline services and for an endpoint that is not a URL. */
function originOf(providerId: string, cfg: Omit<ProviderConfig, "enabled">): string | null {
  if (!getPreset(providerId)) return null
  return providerOrigin(resolveProviderConfig(providerId, cfg))
}

/** Whether the extension may connect to `origin`. */
async function hasHostAccess(origin: string): Promise<boolean> {
  try {
    return await ext.permissions.contains({ origins: [origin] })
  } catch {
    return false
  }
}

/**
 * Ask for the permission a service needs; call it first thing in a click
 * handler. Resolves to whether the extension may connect: true at once for
 * a fixed address or one granted before, false when the user refuses.
 */
export function requestHostAccess(providerId: string, cfg: Omit<ProviderConfig, "enabled">): Promise<boolean> {
  const origin = originOf(providerId, cfg)
  if (!origin) return Promise.resolve(true)
  try {
    return ext.permissions.request({ origins: [origin] }).catch(() => false)
  } catch {
    return Promise.resolve(false)
  }
}

/** The lines on screen, drawn again when a permission is granted or removed anywhere. */
const lines = new Set<() => void>()
let listening = false

function listen(): void {
  if (listening) return
  listening = true
  const redraw = () => {
    for (const refresh of lines) refresh()
  }
  try {
    ext.permissions.onAdded.addListener(redraw)
    ext.permissions.onRemoved.addListener(redraw)
  } catch {
    // No permission events: the line is drawn again after its own button.
  }
}

/**
 * A line under the endpoint while the extension may not connect to it: the
 * host and "Allow access". `refresh()` checks again, e.g. after the endpoint changed.
 */
export function hostAccessLine(providerId: string, cfg: ProviderConfig): { el: HTMLElement; refresh: () => void } {
  const text = h("span")
  const el = h("div", { className: "host-access row", role: "status", hidden: true }, text)
  let checks = 0
  const refresh = () => {
    if (checks > 0 && !el.isConnected) {
      lines.delete(refresh)
      return
    }
    const check = ++checks
    const origin = originOf(providerId, cfg)
    if (!origin) {
      el.hidden = true
      return
    }
    void hasHostAccess(origin).then((allowed) => {
      if (check !== checks) return
      text.textContent = t("hostAccessMissing", [patternHost(origin)])
      el.hidden = allowed
    })
  }
  el.append(button(t("buttonAllowHost"), () => void requestHostAccess(providerId, cfg).then(refresh), false, t("tipAllowHost")))
  lines.add(refresh)
  listen()
  refresh()
  return { el, refresh }
}
