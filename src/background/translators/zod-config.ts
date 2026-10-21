/**
 * zod neither probes nor uses the Function constructor, which the content
 * security policy blocks: set before the AI SDK builds its first schema.
 */
import { config } from "zod/v4/core"

config({ jitless: true })
