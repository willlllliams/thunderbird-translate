/** The interface texts as packaged with the extension (_locales/<locale>/messages.json), served to fetch(). */
import { vi } from "vitest"
import { readLocaleSources, toMessagesJson } from "../../scripts/locales.mjs"

export const localeSources = readLocaleSources()

/** The text of `key` in `locale`'s locales/<locale>.json. */
export const localeText = (locale: string, key: string): string => localeSources[locale][key]

/** The packaged messages.json at `url` (moz-extension://…/_locales/<locale>/messages.json); undefined for any other URL. */
export function packagedMessages(url: string): Response | undefined {
  const locale = url.startsWith("moz-extension://") ? localeSources[url.split("/").at(-2)!] : undefined
  return locale ? new Response(JSON.stringify(toMessagesJson(locale))) : undefined
}

/** fetch() that serves the packaged messages; other URLs go to `other`, and fail like an unreachable server without it. */
export const packagedFetch = (other?: (url: string, init?: RequestInit) => Promise<Response>) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    const messages = packagedMessages(url)
    if (messages) return messages
    if (other) return other(url, init)
    throw new TypeError("NetworkError when attempting to fetch resource.")
  })
