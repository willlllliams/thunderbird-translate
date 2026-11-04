/**
 * The WebExtension namespace. Thunderbird exposes it as both `messenger` and
 * `browser`; the Thunderbird-only APIs are typed loosely here because
 * @types/firefox-webext-browser does not describe them.
 */

/** A message as the messages API describes it (MessageHeader): the fields the extension reads. */
export interface MessageHeader {
  id: number
  subject: string
  author: string
  /** A Date in the background script; a structured clone of it elsewhere. */
  date: Date | string | number
}

interface ThunderbirdExtras {
  messageDisplayScripts: {
    register(options: {
      js?: { file?: string; code?: string }[]
      css?: { file?: string; code?: string }[]
      runAt?: "document_start" | "document_end" | "document_idle"
    }): Promise<{ unregister(): Promise<void> }>
  }
  messageDisplayAction: {
    setBadgeText(details: { text: string | null; tabId?: number }): Promise<void>
    setBadgeBackgroundColor(details: { color: string | null; tabId?: number }): Promise<void>
    setTitle(details: { title: string | null; tabId?: number }): Promise<void>
    /** Thunderbird 113 and later: opens the popup of the button without a user action; false when the button is not in a toolbar. */
    openPopup(options?: { windowId?: number }): Promise<boolean>
  }
}

export type Ext = typeof browser & ThunderbirdExtras

const g = globalThis as unknown as { messenger?: Ext; browser?: Ext }

/**
 * Read at every access (`ext.tabs` looks up the namespace of that moment).
 * In Thunderbird the namespace exists before any script runs and never
 * changes; the unit tests install a fake one per test.
 */
/** Whether a message comes from a page of the extension (popup, settings page, setup guide); a content script has the address of its message. */
export function isExtensionPage(sender: { url?: string } | undefined): boolean {
  return typeof sender?.url === "string" && sender.url.startsWith(ext.runtime.getURL(""))
}

export const ext: Ext = new Proxy({} as Ext, {
  get: (_target, key) => Reflect.get((g.messenger ?? g.browser) as Ext, key),
})
