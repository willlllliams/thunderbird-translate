import { releaseUrl } from "../background/dictionary/download"

declare const __E2E_SERVER__: string

/** Release tag the e2e build asks for; the fetch below answers it from the mock server. */
export const DICT_TAG = "e2e"

/** GitHub release URLs of the dictionary packs, answered by the mock server. */
export const releaseFetch: typeof fetch = (input, init) => {
  const url = String(input).replace(releaseUrl(DICT_TAG, ""), `${__E2E_SERVER__}/releases/`)
  return fetch(url, init)
}
