/** The content script probe of the e2e build (see src/hooks/content.ts and src/e2e/content.ts). */
import type * as Hooks from "../../hooks/content"
import { createContentProbe } from "../content"

export const contentProbe: NonNullable<typeof Hooks.contentProbe> = createContentProbe()
