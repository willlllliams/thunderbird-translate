/**
 * The addresses the extension connects to, and the host permissions that
 * cover them.
 *
 * The manifest lists as host permissions (FIXED_HOSTS) the addresses that
 * work without an account: the free routes of Google and Microsoft, Mozilla
 * Remote Settings with its attachment CDN for the Bergamot models, and the
 * GitHub releases with their download host for the dictionary packs. The
 * services that need a key of the user (KEYED_HOSTS: Microsoft with an Azure
 * key, DeepL with the hosts of its free and paid keys, Baidu, Youdao, Caiyun,
 * the default endpoint of every AI preset) are optional host permissions, as
 * is an address the user types (Ollama, LM Studio, DeepLX, a custom or Azure
 * endpoint, a changed endpoint of a preset): the settings page and the setup
 * guide show "Allow access" for a service whose host is missing and ask for
 * it with permissions.request() when the user clicks it or "Test
 * connection", and the background script refuses to send to an address it
 * has no permission for. An update keeps a host permission of the manifest
 * that became optional granted (Firefox 75 and later, bug 1618500), so the
 * users of 3.0 and earlier keep the access to their services.
 */

import { getPreset } from "./providers"
import type { ResolvedProvider } from "./settings"

/** Free route of Microsoft Translator, the one the Edge browser uses. */
export const MS_EDGE_TRANSLATE_URL = "https://edge.microsoft.com/translate/translatetext"

/** Host permissions of the manifest (static/manifest.json, checked by tests/hosts.test.ts). */
export const FIXED_HOSTS: readonly string[] = [
  // Machine translation without a key
  "https://translate.googleapis.com/*",
  "https://edge.microsoft.com/*",
  // Bergamot model list and model files
  "https://firefox.settings.services.mozilla.com/*",
  "https://firefox-settings-attachments.cdn.mozilla.net/*",
  // Dictionary packs: the release download address and the host GitHub redirects it to
  "https://github.com/*",
  "https://release-assets.githubusercontent.com/*",
]

/**
 * The default hosts of the services that need a key of the user, optional host permissions of the manifest
 * (optional_permissions, checked by tests/hosts.test.ts). Each is listed by itself, not only covered by REMOTE_ORIGINS:
 * an update keeps exactly these strings granted for a user who had them as host permissions of the manifest.
 */
export const KEYED_HOSTS: readonly string[] = [
  // Machine translation with a key
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
]

/**
 * The last optional host permissions of the manifest: every http and https host. The settings page and the setup
 * guide ask for the host of one endpoint; the popup and the settings page ask for both patterns at once to read the
 * remote images Thunderbird shows.
 */
export const REMOTE_ORIGINS: readonly string[] = ["http://*/*", "https://*/*"]

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

/**
 * Names that resolve inside a home or company network only: the special-use names of RFC 6761 and RFC 8375
 * (localhost, local, home.arpa), the reserved internal (ICANN, 2024), and the names routers and companies use for their
 * own network.
 */
const PRIVATE_NAMES = ["localhost", "local", "internal", "home.arpa", "localdomain", "lan", "home", "corp", "intranet", "private"]

/**
 * IPv4 ranges outside the public internet, as [first octets, prefix length]: this network, private networks, shared
 * address space (CGNAT), loopback, link-local, IETF protocol assignments, the documentation and benchmark networks,
 * multicast and the reserved range with the broadcast address.
 */
const PRIVATE_V4: [number[], number][] = [
  [[0], 8],
  [[10], 8],
  [[100, 64], 10],
  [[127], 8],
  [[169, 254], 16],
  [[172, 16], 12],
  [[192, 0, 0], 24],
  [[192, 0, 2], 24],
  [[192, 168], 16],
  [[198, 18], 15],
  [[198, 51, 100], 24],
  [[203, 0, 113], 24],
  [[224], 4],
  [[240], 4],
]

/** Whether the IPv4 address `octets` lies on the public internet. */
function isPublicV4(octets: number[]): boolean {
  const value = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  return !PRIVATE_V4.some(([first, prefix]) => {
    const base = ((first[0] << 24) | ((first[1] ?? 0) << 16) | ((first[2] ?? 0) << 8)) >>> 0
    const mask = (0xffffffff << (32 - prefix)) >>> 0
    return ((value & mask) >>> 0) === base
  })
}

/** The eight 16-bit groups of an IPv6 address as the URL parser writes it (lower case, "::" for zeros); null for anything else. */
function v6Groups(address: string): number[] | null {
  const halves = address.split("::")
  if (halves.length > 2) return null
  const parse = (part: string) => (part ? part.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : Number.NaN)) : [])
  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  const zeros = 8 - head.length - tail.length
  if ((halves.length === 2 ? zeros < 1 : zeros !== 0) || [...head, ...tail].some(Number.isNaN)) return null
  return [...head, ...new Array<number>(zeros).fill(0), ...tail]
}

/**
 * Whether the IPv6 address `groups` lies on the public internet: not the unspecified address, loopback or the IPv4
 * compatible addresses (::/96), unique local (fc00::/7), link-local (fe80::/10), site-local (fec0::/10), multicast
 * (ff00::/8), discard (100::/64), documentation (2001:db8::/32) or local NAT64 (64:ff9b:1::/48); an address that
 * carries an IPv4 address (mapped ::ffff:0:0/96, NAT64 64:ff9b::/96, 6to4 2002::/16) is judged by that address.
 */
function isPublicV6(g: number[]): boolean {
  const v4 = (hi: number, lo: number) => isPublicV4([hi >> 8, hi & 255, lo >> 8, lo & 255])
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4(g[6], g[7])
  if (g.slice(0, 6).every((x) => x === 0)) return false
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 0 && g.slice(3, 6).every((x) => x === 0) ? v4(g[6], g[7]) : false
  if (g[0] === 0x2002) return v4(g[1], g[2])
  if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00) return false
  if (g[0] === 0x100 && g.slice(1, 4).every((x) => x === 0)) return false
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false
  return true
}

/**
 * Whether `url` names a host on the public internet. Not: a name without a dot (localhost, a host of the local
 * network), a name under PRIVATE_NAMES, an IPv4 or IPv6 address of a range outside the public internet. The URL
 * parser has already turned every way of writing an IPv4 address (decimal 2130706433, hex 0x7f.1, octal 0177.0.0.1,
 * short 127.1) into the dotted form, and IPv6 into its short form, so the check sees the address the request goes to.
 * A name that the DNS resolves to a private address passes: the extension cannot resolve names.
 */
export function isPublicHost(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (host.endsWith(".")) host = host.slice(0, -1)
  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = v6Groups(host.slice(1, -1))
    return groups !== null && isPublicV6(groups)
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (v4) return isPublicV4(v4.slice(1).map(Number))
  if (!host.includes(".")) return false
  return !PRIVATE_NAMES.some((name) => host === name || host.endsWith(`.${name}`))
}
