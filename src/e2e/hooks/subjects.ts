/** The probe of the page of translated subjects in the e2e build (see src/hooks/subjects.ts and src/e2e/subjects.ts). */
import type * as Hooks from "../../hooks/subjects"
import { ext } from "../../shared/ext"
import { WELCOME_PROBE_PARAM } from "../marker"
import { runSubjectsProbe } from "../subjects"

const probed = new URLSearchParams(location.search).get(WELCOME_PROBE_PARAM) === "subjects"

// A failure of the page itself goes to the log of the run.
if (probed) {
  addEventListener("unhandledrejection", (event) => void ext.runtime.sendMessage({ e2e: "log", message: `page of translated subjects: ${event.reason?.stack ?? event.reason}` }))
  addEventListener("error", (event) => void ext.runtime.sendMessage({ e2e: "log", message: `page of translated subjects: ${event.message}` }))
}

/** The background script opens the page with ?tab=<mail tab>&e2e=subjects to have it checked. */
export const subjectsProbe: NonNullable<typeof Hooks.subjectsProbe> = (parts) => {
  if (probed) void runSubjectsProbe(parts)
}
