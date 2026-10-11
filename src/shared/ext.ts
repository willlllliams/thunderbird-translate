/**
 * The WebExtension namespace. Thunderbird exposes it as both `messenger` and
 * `browser`; the Thunderbird-only APIs are typed loosely here because
 * @types/firefox-webext-browser does not describe them.
 */

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
  }
  messageDisplay?: {
    getDisplayedMessages?(tabId: number): Promise<unknown>
    getDisplayedMessage?(tabId: number): Promise<unknown>
  }
}

type Ext = typeof browser & ThunderbirdExtras

const g = globalThis as unknown as { messenger?: Ext; browser?: Ext }

export const ext: Ext = (g.messenger ?? g.browser) as Ext

export function t(key: string, substitutions?: string | string[]): string {
  try {
    return ext?.i18n?.getMessage(key, substitutions) || key
  } catch {
    return key
  }
}
