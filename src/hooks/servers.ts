/**
 * Hooks of the e2e test build. Every hook under src/hooks/ is undefined here;
 * scripts/build.mjs --e2e replaces each module of src/hooks/ with the module
 * of the same name in src/e2e/hooks/, which defines them. No other build
 * contains code of src/e2e/.
 *
 * Arguments of a hook may only be values already computed or references to
 * objects: `hook?.(expr)` does not evaluate expr when the hook is undefined,
 * so an effect of expr would happen in the test build only.
 */

/** fetch() for the dictionary packs of a GitHub release; undefined: the global fetch. */
export const releaseFetch: typeof fetch | undefined = undefined

/** Remote Settings server of the Bergamot models; undefined: Mozilla's. */
export const bergamotServerUrl: string | undefined = undefined

/** The origin of a server on this computer whose remote images the extension may read; undefined: none, only public hosts. */
export const localImageOrigin: string | undefined = undefined
