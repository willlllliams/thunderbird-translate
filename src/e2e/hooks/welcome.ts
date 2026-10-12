/** The setup guide probe of the e2e build (see src/hooks/welcome.ts and src/e2e/welcome.ts). */
import type * as Hooks from "../../hooks/welcome"
import { WELCOME_PROBE_PARAM } from "../marker"
import { runWelcomeProbe } from "../welcome"

/** The background script opens the page with ?e2e=<scenario> to have the offline step walked through. */
export const welcomeProbe: NonNullable<typeof Hooks.welcomeProbe> = () => {
  const scenario = new URLSearchParams(location.search).get(WELCOME_PROBE_PARAM)
  if (scenario) void runWelcomeProbe(scenario)
}
