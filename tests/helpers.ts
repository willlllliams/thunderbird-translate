/** Test doubles shared by the test files. */
import { createHash } from "node:crypto"
import { vi } from "vitest"
import { type KeyValueStorage, PersistentCache } from "../src/background/cache"
import { type ServiceDeps, TranslationService } from "../src/background/service"
import type { TranslateRequest, TranslateResponse } from "../src/shared/messages"
import { getPreset, PROVIDER_PRESETS, tierOf } from "../src/shared/providers"
import { isOnlineService, type Settings } from "../src/shared/settings"

/**
 * Fake setTimeout and setInterval (and Date with `now`). setImmediate stays
 * real: fake-indexeddb runs its requests on it, and nextTask() waits for it.
 */
export function useFakeTimers(now?: Date): void {
  vi.useFakeTimers(now ? { toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"], now } : { toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
}

/** One turn of the event loop: every promise chain that waits for no timer has run. Works with fake timers too. */
export const nextTask = () => new Promise<void>((resolve) => setImmediate(resolve))

/** Hex SHA-256, as in dict-index.json and the Bergamot model records. */
export const sha256Hex = (data: Uint8Array) => createHash("sha256").update(data).digest("hex")

/** A vi.fn() or any other stand-in used as fetch. */
export const asFetch = (f: unknown) => f as typeof fetch

/** JSON response; a string body is sent as it is. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** Chat Completions answer (OpenAI and compatible APIs). */
export const chatCompletion = (content: string) =>
  jsonResponse({
    id: "c1",
    object: "chat.completion",
    created: 1,
    model: "m",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })

/** Anthropic Messages answer. */
export const anthropicMessage = (text: string) =>
  jsonResponse({ id: "msg_1", type: "message", role: "assistant", model: "m", content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })

/** storage.local stand-in; `data` shows what was written. */
export function memoryStorage(): KeyValueStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async (k) => data.get(k),
    set: async (k, v) => void data.set(k, structuredClone(v)),
    remove: async (k) => void data.delete(k),
  }
}

/** Dictionary stand-in that answers D(<text>), once `gate` resolves. */
export function fakeDictionary(gate?: Promise<void>) {
  return {
    translate: vi.fn(async (texts: string[], _source: string, _target: string) => {
      await gate
      return texts.map((t): PromiseSettledResult<string> => ({ status: "fulfilled", value: `D(${t})` }))
    }),
    signature: vi.fn(async () => "packs"),
  }
}

const serviceSettings = new WeakMap<TranslationService, Settings>()

/** Every online service, allowed to receive message text: what a user has after answering the consent panel once per service. */
export const ALL_CONSENT = PROVIDER_PRESETS.map((p) => p.id).filter(isOnlineService)

/**
 * Translation service over `settings`: 5 ms batch window, in-memory cache, retries without waiting. Every online service
 * is allowed to receive message text unless `consent` is false (the tests of the consent itself).
 */
export function createService(settings: Settings, deps: Partial<ServiceDeps> = {}, { consent = true }: { consent?: boolean } = {}) {
  settings.batch.batchDelayMs = 5
  if (consent) settings.onlineConsent = [...ALL_CONSENT]
  const cache = deps.cache ?? new PersistentCache(memoryStorage(), 100, 10)
  const service = new TranslationService({ getSettings: () => settings, sleep: async () => {}, ...deps, cache })
  serviceSettings.set(service, settings)
  return { settings, service, cache }
}

/** One paragraph for one service: `providerId` becomes the service of its tier. */
export interface OneRequest extends Partial<Omit<TranslateRequest, "tiers">> {
  text: string
  providerId: string
}

/**
 * Translate one paragraph the way the page does (translateForPage), asking
 * only the tier of `providerId`. Resolves with the translation, rejects with
 * the error text the page would show.
 */
export async function translateOne(service: TranslationService, { providerId, ...req }: OneRequest): Promise<string> {
  const settings = serviceSettings.get(service)!
  const tier = tierOf(getPreset(providerId)!)
  settings.tiers[tier] = providerId
  let result: TranslateResponse | undefined
  await service.translateForPage({ sourceLang: "auto", targetLang: "zh-CN", ...req, tiers: [tier] }, (_tier, r) => (result = r))
  if (!result?.ok) throw new Error(result?.error)
  return result.text
}

/** Moved to tests/fixtures/pages.ts; imported from here until the test files import it from there. */
export { openPage } from "./fixtures/pages"
