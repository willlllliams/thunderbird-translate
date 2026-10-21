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

/** Needs the messagesRead permission. */
declare namespace browser.messages {
  /** A part of a message by its part name, e.g. "1.2"; Thunderbird 88 and later. */
  function getAttachmentFile(messageId: number, partName: string): Promise<File>
}
