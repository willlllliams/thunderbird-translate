/**
 * What the translation service (service.ts) and the image service (images.ts) share about a request: the check of
 * its endpoint, its timeout, the error of a request nobody waits for, and what an error message may name of its
 * service.
 */

import { type ErrorContext, LocalizedError } from "../shared/errors"
import { patternHost, providerOrigin, requestUrl } from "../shared/hosts"
import type { I18n } from "../shared/i18n"
import { getPreset, providerDisplayName } from "../shared/providers"
import type { ResolvedProvider } from "../shared/settings"

/** Local models (Ollama, LM Studio) and models that reason first answer slowly: their requests get this multiple of the request timeout. */
const SLOW_MODEL_TIMEOUT_FACTOR = 3

/** The request timeout `ms` for `provider`, multiplied for a local model and for one that reasons first. */
export function requestTimeout(provider: ResolvedProvider, ms: number): number {
  return provider.thinking || getPreset(provider.id)?.local ? ms * SLOW_MODEL_TIMEOUT_FACTOR : ms
}

/** Throws errEndpointInvalid for an endpoint that is no http(s) URL, errHostPermission when the extension may not connect to it. */
export async function checkOrigin(provider: ResolvedProvider, hasOrigin: ((origin: string) => Promise<boolean>) | undefined, i18n: I18n): Promise<void> {
  const origin = providerOrigin(provider)
  if (!origin && requestUrl(provider)) throw new LocalizedError("errEndpointInvalid", [providerDisplayName(getPreset(provider.id)!, i18n)])
  if (!origin || !hasOrigin) return
  if (!(await hasOrigin(origin).catch(() => false))) throw new LocalizedError("errHostPermission", [patternHost(origin)])
}

/** The error of a request no page waits for any more; it is not retried. */
export const aborted = () => new DOMException("No page waits for the answer any more.", "AbortError")

/** What describeError() needs to know about the provider of a failed request. */
export function errorContext(provider: ResolvedProvider): ErrorContext {
  const preset = getPreset(provider.id)
  const secrets = provider.apiKey ? [provider.apiKey] : []
  if (!preset) return { baseURL: provider.baseURL, secrets }
  return {
    service: preset.name,
    kind: preset.kind,
    baseURL: preset.kind === "microsoft" && provider.mode === "free" ? undefined : provider.baseURL,
    defaultBaseURL: preset.defaultBaseURL,
    model: preset.kind === "llm" ? provider.model : undefined,
    keyMode: provider.mode === "key",
    secrets,
  }
}
