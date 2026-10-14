/** The probe of the page of translated subjects in the e2e build (see src/hooks/subjects.ts and src/e2e/subjects.ts). */
import type * as Hooks from "../../hooks/subjects"
import { WELCOME_PROBE_PARAM } from "../marker"
import { runSubjectsProbe } from "../subjects"

/** The background script opens the page with ?tab=<mail tab>&e2e=subjects to have it checked. */
export const subjectsProbe: NonNullable<typeof Hooks.subjectsProbe> = (parts) => {
  if (new URLSearchParams(location.search).get(WELCOME_PROBE_PARAM) === "subjects") void runSubjectsProbe(parts)
}
