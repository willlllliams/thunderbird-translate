/** The servers of the e2e build (see src/hooks/servers.ts): dictionary packs and Bergamot models of the local mock server. */
import type * as Hooks from "../../hooks/servers"
import { releaseFetch as mockReleaseFetch } from "../release"

declare const __E2E_SERVER__: string

export const releaseFetch: NonNullable<typeof Hooks.releaseFetch> = mockReleaseFetch

export const bergamotServerUrl: NonNullable<typeof Hooks.bergamotServerUrl> = `${__E2E_SERVER__}/bergamot/v1/`

/** The remote images of the "image-remote" run come from the mock server on 127.0.0.1. */
export const localImageOrigin: NonNullable<typeof Hooks.localImageOrigin> = new URL(__E2E_SERVER__).origin
