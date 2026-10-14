/**
 * The mail APIs of Thunderbird that the extension calls on the `browser`
 * namespace by name, so that a review of the shipped code sees which API
 * each call uses. @types/firefox-webext-browser describes the APIs of
 * Firefox only; these declarations add the fields the extension reads.
 */

/** Needs the messagesRead permission. */
declare namespace browser.messageDisplay {
  function getDisplayedMessage(tabId: number): Promise<import("./ext").MessageHeader | null>
}

/** The message list of a mail tab. */
declare namespace browser.mailTabs {
  function getCurrent(): Promise<import("./ext").MailTab | undefined>
  /** Needs the messagesRead permission. */
  function getListedMessages(tabId: number): Promise<import("./ext").MessageList>
  /** Needs the messagesRead and accountsRead permissions. */
  function setSelectedMessages(tabId: number, messageIds: number[]): Promise<void>
  /** Needs the accountsRead permission. */
  const onDisplayedFolderChanged: WebExtEvent<(tab: import("./ext").MailTab, folder: unknown) => void>
}

/** Needs the messagesRead permission. */
declare namespace browser.messages {
  function continueList(messageListId: string): Promise<import("./ext").MessageList>
  function abortList(messageListId: string): Promise<void>
  const onNewMailReceived: WebExtEvent<(folder: unknown, messages: import("./ext").MessageList) => void>
  const onDeleted: WebExtEvent<(messages: import("./ext").MessageList) => void>
  const onMoved: WebExtEvent<(originalMessages: import("./ext").MessageList, movedMessages: import("./ext").MessageList) => void>
}
