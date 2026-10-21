/**
 * The addresses the extension connects to, and the host permissions that
 * cover them.
 *
 * The manifest lists the fixed addresses as host permissions (FIXED_HOSTS):
 * the machine translators (Google, Microsoft, DeepL with the hosts of its
 * free and paid keys, Baidu, Youdao, Caiyun), the default endpoint of every AI preset, Mozilla
 * Remote Settings with its attachment CDN for the Bergamot models, and the
 * GitHub releases with their download hosts for the dictionary packs. An
 * address the user types (Ollama, LM Studio, DeepLX, a custom or Azure
 * endpoint, a changed endpoint of a preset) is covered by the optional host
 * permissions: the settings page and the setup guide ask for it with
 * permissions.request() when the user clicks "Allow access" or "Test
 * connection", and the background script refuses to send to an address it
 * has no permission for.
 */

import { getPreset } from "./providers"
import type { ResolvedProvider } from "./settings"

/** Free route of Microsoft Translator, the one the Edge browser uses. */
export const MS_EDGE_TRANSLATE_URL = "https://edge.microsoft.com/translate/translatetext"

/** Host permissions of the manifest (static/manifest.json, checked by tests/hosts.test.ts). */
export const FIXED_HOSTS: readonly string[] = [
  // Machine translation
  "https://translate.googleapis.com/*",
  "https://edge.microsoft.com/*",
  "https://api.cognitive.microsofttranslator.com/*",
  "https://api-free.deepl.com/*",
  "https://api.deepl.com/*",
  "https://fanyi-api.baidu.com/*",
  "https://openapi.youdao.com/*",
  "https://api.interpreter.caiyunai.com/*",
  // AI presets: their default endpoints
  "https://api.openai.com/*",
  "https://api.anthropic.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://api.deepseek.com/*",
  "https://api.x.ai/*",
  "https://api.groq.com/*",
  "https://api.mistral.ai/*",
  "https://openrouter.ai/*",
  "https://api.together.xyz/*",
  "https://api.fireworks.ai/*",
  "https://api.deepinfra.com/*",
  "https://api.cerebras.ai/*",
  "https://api.perplexity.ai/*",
  "https://api.moonshot.cn/*",
  "https://open.bigmodel.cn/*",
  "https://dashscope.aliyuncs.com/*",
  "https://api.siliconflow.cn/*",
  "https://ark.cn-beijing.volces.com/*",
  // Bergamot model list and model files
  "https://firefox.settings.services.mozilla.com/*",
  "https://firefox-settings-attachments.cdn.mozilla.net/*",
  // Dictionary packs: the release download address and the hosts GitHub redirects it to
  "https://github.com/*",
  "https://release-assets.githubusercontent.com/*",
  "https://objects.githubusercontent.com/*",
]

/** The match pattern of the host of `url` ("https://example.com/*", any port); null for a URL that is not http(s). */
export function originPattern(url: string): string | null {
  try {
    const u = new URL(url.replaceAll("{{apiKey}}", "key"))
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname) return null
    return `${u.protocol}//${u.hostname}/*`
  } catch {
    return null
  }
}

/** Host of a match pattern, for the interface: "https://example.com/*" → "example.com". */
export function patternHost(pattern: string): string {
  return pattern.replace(/^[a-z]+:\/\//, "").replace(/\/\*$/, "")
}

/** The URL that requests of a service go to; null for the offline services. */
export function requestUrl(provider: ResolvedProvider): string | null {
  const kind = getPreset(provider.id)?.kind
  if (kind === undefined || kind === "dictionary" || kind === "bergamot") return null
  if (kind === "microsoft" && provider.mode !== "key") return MS_EDGE_TRANSLATE_URL
  return provider.baseURL
}

/** The host permission a service needs, as a match pattern; null for the offline services and for an endpoint that is not a URL. */
export function providerOrigin(provider: ResolvedProvider): string | null {
  const url = requestUrl(provider)
  return url ? originPattern(url) : null
}

/** Whether a URL points to this computer: localhost, 127.0.0.0/8 or ::1. */
export function isLoopback(url: string): boolean {
  try {
    const host = new URL(url.replaceAll("{{apiKey}}", "key")).hostname
    return host === "localhost" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host) || host === "[::1]"
  } catch {
    return false
  }
}
