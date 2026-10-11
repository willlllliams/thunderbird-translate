/** Present in every e2e hook; scripts/build.mjs refuses a regular build whose bundles contain it. */
export const E2E_MARKER = "tt-e2e-hook"

/** A "welcome" scenario opens the setup guide with ?e2e=<scenario>; only then does it run the probe of src/e2e/welcome.ts. */
export const WELCOME_PROBE_PARAM = "e2e"
