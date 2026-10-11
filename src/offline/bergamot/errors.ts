/**
 * Errors of the offline engine. They are LocalizedError instances, so
 * describeError() shows them in the interface language once the keys below
 * exist in locales/*.json. Until then the English text here is used as
 * Error.message.
 */

import { LocalizedError } from "../../shared/errors"
import { EN_MESSAGES, formatMessage, type MessageKey } from "../../shared/i18n"

/** Message keys and their English text (also listed in docs/bergamot.md). */
export const BERGAMOT_MESSAGES = {
  bergamotModelMissing: "The offline translation model for $1 → $2 is not installed. Install these language pairs in the settings: $3",
  bergamotUnsupportedPair: "Offline translation does not support $1 → $2.",
  bergamotDetectFailed: "Could not detect the language of the text. Choose the source language for offline translation.",
  bergamotRecordsFailed: "Could not load the list of offline translation models from Mozilla.",
  bergamotDownloadFailed: "Could not download the offline model file $1.",
  bergamotChecksumMismatch: "The downloaded model file $1 is damaged (checksum mismatch). Try the installation again.",
  bergamotStorageFailed: "Could not save or read the offline models in the extension storage.",
  bergamotEngineFailed: "The offline translation engine failed.",
} as const

export type BergamotMessageKey = keyof typeof BERGAMOT_MESSAGES

export class BergamotError extends LocalizedError {
  readonly bergamotKey: BergamotMessageKey

  constructor(key: BergamotMessageKey, args: string[] = [], detail?: string) {
    super(key as unknown as MessageKey, args, detail)
    this.bergamotKey = key
    if (!EN_MESSAGES[key]) {
      const base = formatMessage(BERGAMOT_MESSAGES[key], args)
      this.message = detail ? `${base} - ${detail}` : base
    }
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}
