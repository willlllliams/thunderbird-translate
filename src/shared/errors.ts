/**
 * Errors that carry a message key, so the text can be shown in the interface
 * language chosen by the user. `message` holds the English text for logs
 * and for code that only looks at Error.message.
 */

import { ENGLISH, type I18n, type MessageKey } from "./i18n"

export interface ErrorText {
  key: MessageKey
  args?: string[]
  /** Untranslated detail appended after the message, e.g. a server response. */
  detail?: string
}

export function renderErrorText(text: ErrorText, i18n: I18n): string {
  const base = i18n.t(text.key, text.args ?? [])
  return text.detail ? `${base} - ${text.detail}` : base
}

export class LocalizedError extends Error {
  readonly i18nText: ErrorText

  constructor(key: MessageKey, args: string[] = [], detail?: string) {
    const text: ErrorText = { key, args, detail }
    super(renderErrorText(text, ENGLISH))
    this.name = "LocalizedError"
    this.i18nText = text
  }
}

/** Error text in the given language; errors without a key keep their own message. */
export function describeError(error: unknown, i18n: I18n): string {
  const text = (error as { i18nText?: ErrorText } | null | undefined)?.i18nText
  if (text && typeof text.key === "string") return renderErrorText(text, i18n)
  if (error instanceof Error) return error.message
  return String(error)
}
