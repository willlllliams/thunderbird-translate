/** The background hook of the e2e build (see src/hooks/background.ts): the settings and data of the scenario. */
import type * as Hooks from "../../hooks/background"
import { setUpE2e } from "../background"

export const beforeSettingsRead: NonNullable<typeof Hooks.beforeSettingsRead> = setUpE2e
