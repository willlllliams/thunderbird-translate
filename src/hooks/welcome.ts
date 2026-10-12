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

/** Called once the setup guide shows its first step. */
export const welcomeProbe: (() => void) | undefined = undefined
