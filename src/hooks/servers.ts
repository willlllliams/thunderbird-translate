/** Hooks of the e2e test build, undefined in every other build; docs/development.md (End-to-end tests) says how they are replaced and called. */

/** fetch() for the dictionary packs of a GitHub release; undefined: the global fetch. */
export const releaseFetch: typeof fetch | undefined = undefined

/** Remote Settings server of the Bergamot models; undefined: Mozilla's. */
export const bergamotServerUrl: string | undefined = undefined

/** The origin of a server on this computer whose remote images the extension may read; undefined: none, only public hosts. */
export const localImageOrigin: string | undefined = undefined
