/**
 * Failure details inside the offline engine (storage, model list, worker).
 * They never reach the interface on their own: the public functions wrap
 * them in a BergamotError (a LocalizedError) and keep this text as detail.
 */
export class BergamotInternalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BergamotInternalError"
  }
}
