/**
 * The window of the popup page that shows the consent questions of a tab when the message header button is not in a
 * toolbar, so the popup cannot open. A tab has at most one: a question asked while it is open focuses it, and it
 * closes once no question of the tab is left.
 */

import { ext } from "../shared/ext"

export interface ConsentWindows {
  /** The popup page of `tabId` in a window of its own; the window of an earlier question is focused instead of a second one. */
  show(tabId: number): Promise<void>
  /** No question of `tabId` is left: its window closes. */
  close(tabId: number): void
}

type WindowsApi = Pick<typeof browser.windows, "create" | "update" | "remove" | "onRemoved">

/** `api`: the extension API, read at every call (shared/ext.ts). */
export function createConsentWindows(api: { windows: WindowsApi } = ext, url: (tabId: number) => string = (tabId) => ext.runtime.getURL(`popup.html?tab=${tabId}`)): ConsentWindows {
  /** The window of each tab; a promise, as a second question can come while the first window is being created. */
  const open = new Map<number, Promise<number | undefined>>()
  api.windows.onRemoved.addListener((windowId) => {
    for (const [tabId, shown] of open) {
      void shown.then((id) => {
        if (id === windowId && open.get(tabId) === shown) open.delete(tabId)
      })
    }
  })
  return {
    async show(tabId) {
      const before = open.get(tabId)
      const shown = (before ?? Promise.resolve(undefined)).then(async (id) => {
        if (id !== undefined && (await api.windows.update(id, { focused: true }).then(() => true, () => false))) return id
        return (await api.windows.create({ type: "popup", url: url(tabId), width: 420, height: 640 })).id
      })
      // A window that failed to open is kept as none, so the next question tries again.
      open.set(tabId, shown.catch(() => undefined))
      await shown
    },
    close(tabId) {
      const shown = open.get(tabId)
      open.delete(tabId)
      void shown
        ?.then(async (id) => {
          if (id !== undefined) await api.windows.remove(id)
        })
        .catch(() => {})
    },
  }
}
