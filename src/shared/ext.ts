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
  /** A Date in the background script and the pages; a structured clone of it elsewhere. */
  date: Date | string | number
}

/** A page of messages (MessageList); `id` names the next page for messages.continueList(), null after the last one. */
export interface MessageList {
  id: string | null
  messages: MessageHeader[]
}

/** A mail tab (MailTab): a folder pane, the message list and the message pane. */
export interface MailTab {
  id: number
  windowId: number
  active: boolean
}

/** A Thunderbird event: the listener gets the arguments of the event. */
interface ThunderbirdEvent<A extends unknown[]> {
  addListener(listener: (...args: A) => void): void
  removeListener(listener: (...args: A) => void): void
}

interface ThunderbirdExtras {
  messageDisplayScripts: {
    register(options: {
      js?: { file?: string; code?: string }[]
      css?: { file?: string; code?: string }[]
      runAt?: "document_start" | "document_end" | "document_idle"
    }): Promise<{ unregister(): Promise<void> }>
  }
  /** Needs the messagesRead permission. */
  messageDisplay: {
    getDisplayedMessage(tabId: number): Promise<MessageHeader | null>
  }
  /** The message list of a mail tab; the messages need the messagesRead permission. */
  mailTabs: {
    getCurrent(): Promise<MailTab | undefined>
    get(tabId: number): Promise<MailTab>
    getListedMessages(tabId: number): Promise<MessageList>
    setSelectedMessages(tabId: number, messageIds: number[]): Promise<void>
    onDisplayedFolderChanged: ThunderbirdEvent<[MailTab, unknown]>
  }
  /** Needs the messagesRead permission. */
  messages: {
    continueList(messageListId: string): Promise<MessageList>
    abortList(messageListId: string): Promise<void>
    onNewMailReceived: ThunderbirdEvent<[unknown, MessageList]>
    onDeleted: ThunderbirdEvent<[MessageList]>
    onMoved: ThunderbirdEvent<[MessageList, MessageList]>
  }
  messageDisplayAction: {
    setBadgeText(details: { text: string | null; tabId?: number }): Promise<void>
    setBadgeBackgroundColor(details: { color: string | null; tabId?: number }): Promise<void>
    setTitle(details: { title: string | null; tabId?: number }): Promise<void>
  }
}

export type Ext = typeof browser & ThunderbirdExtras

const g = globalThis as unknown as { messenger?: Ext; browser?: Ext }

/**
 * Read at every access (`ext.tabs` looks up the namespace of that moment).
 * In Thunderbird the namespace exists before any script runs and never
 * changes; the unit tests install a fake one per test.
 */
export const ext: Ext = new Proxy({} as Ext, {
  get: (_target, key) => Reflect.get((g.messenger ?? g.browser) as Ext, key),
})
