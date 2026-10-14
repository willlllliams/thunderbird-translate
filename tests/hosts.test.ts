/** The addresses the extension connects to (shared/hosts.ts) and the host permissions of the manifest. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_ATTACHMENTS_BASE, DEFAULT_SERVER_URL } from "../src/offline/bergamot/manager"
import { RELEASES } from "../src/offline/dictionary/download"
import { FIXED_HOSTS, isFixedHost, isLoopback, MS_EDGE_TRANSLATE_URL, OPTIONAL_HOSTS, originPattern, patternHost, providerOrigin, requestUrl } from "../src/shared/hosts"
import { PROVIDER_PRESETS } from "../src/shared/providers"
import { emptyProviderConfig, resolveProviderConfig } from "../src/shared/settings"

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "static", "manifest.json"), "utf8")) as { permissions: string[]; optional_permissions: string[] }
const hostPermissions = manifest.permissions.filter((p) => p.includes("://"))
const resolved = (id: string, over: Partial<ReturnType<typeof emptyProviderConfig>> = {}) => resolveProviderConfig(id, { ...emptyProviderConfig(), ...over })

describe("host permissions of the manifest", () => {
  it("list the fixed hosts and nothing broader, and leave out tabs and <all_urls>", () => {
    expect(hostPermissions).toEqual([...FIXED_HOSTS])
    expect(manifest.permissions.filter((p) => !p.includes("://"))).toEqual(["messagesModify", "messagesRead", "sensitiveDataUpload", "storage", "unlimitedStorage"])
    for (const host of hostPermissions) expect(host).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]+\/\*$/)
    expect(manifest.optional_permissions).toEqual([...OPTIONAL_HOSTS])
  })

  it("cover the default endpoint of every preset that is not on this computer", () => {
    const online = PROVIDER_PRESETS.filter((p) => p.defaultBaseURL && !isLoopback(p.defaultBaseURL))
    // Google, Microsoft (Azure key mode) and 18 AI presets; Azure OpenAI, DeepLX and the custom endpoint have no default.
    expect(online).toHaveLength(20)
    for (const preset of online) expect([preset.id, isFixedHost(originPattern(preset.defaultBaseURL)!)]).toEqual([preset.id, true])
    for (const preset of PROVIDER_PRESETS.filter((p) => p.defaultBaseURL && isLoopback(p.defaultBaseURL))) expect(isFixedHost(originPattern(preset.defaultBaseURL)!)).toBe(false)
  })

  it("cover the free Microsoft route, the Bergamot model list and files, and the dictionary releases", () => {
    for (const url of [MS_EDGE_TRANSLATE_URL, DEFAULT_SERVER_URL, DEFAULT_ATTACHMENTS_BASE, RELEASES, "https://release-assets.githubusercontent.com/x", "https://objects.githubusercontent.com/x"]) {
      expect([url, isFixedHost(originPattern(url)!)]).toEqual([url, true])
    }
  })
})

describe("addresses of the services", () => {
  it("turn a URL into the match pattern of its host, for any port, and back into the host", () => {
    expect(originPattern("http://localhost:11434/v1")).toBe("http://localhost/*")
    expect(originPattern("https://API.example.com:8443/v1?x=1")).toBe("https://api.example.com/*")
    expect(originPattern("https://deeplx.example/{{apiKey}}/translate")).toBe("https://deeplx.example/*")
    expect(originPattern("http://[::1]:1234/v1")).toBe("http://[::1]/*")
    expect(originPattern("ftp://example.com/")).toBeNull()
    expect(originPattern("not a url")).toBeNull()
    expect(patternHost("https://api.example.com/*")).toBe("api.example.com")
  })

  it("name the URL each kind of service sends to; the offline services send nothing", () => {
    expect(requestUrl(resolved("dictionary"))).toBeNull()
    expect(requestUrl(resolved("bergamot"))).toBeNull()
    expect(requestUrl(resolved("google-free"))).toBe("https://translate.googleapis.com")
    expect(requestUrl(resolved("microsoft-free"))).toBe(MS_EDGE_TRANSLATE_URL)
    expect(requestUrl(resolved("microsoft-free", { mode: "key", baseURL: "https://my.cognitiveservices.azure.com/translator/text/v3.0/translate" }))).toBe(
      "https://my.cognitiveservices.azure.com/translator/text/v3.0/translate",
    )
    expect(requestUrl(resolved("deeplx", { baseURL: "https://deeplx.example/translate" }))).toBe("https://deeplx.example/translate")
    expect(requestUrl(resolved("openai"))).toBe("https://api.openai.com/v1")
    expect(providerOrigin(resolved("openai", { baseURL: "https://proxy.example/v1" }))).toBe("https://proxy.example/*")
    expect(providerOrigin(resolved("ollama"))).toBe("http://localhost/*")
    expect(providerOrigin(resolved("custom"))).toBeNull()
    expect(providerOrigin({ ...resolved("openai"), id: "no-such-service" })).toBeNull()
  })

  it("tell the addresses of this computer", () => {
    for (const url of ["http://localhost:11434/v1", "http://api.localhost/", "http://127.0.0.1:1234/v1", "http://127.1.2.3/", "http://[::1]:8080/"]) expect([url, isLoopback(url)]).toEqual([url, true])
    for (const url of ["https://api.openai.com/v1", "http://192.168.0.2/", "http://localhost.example.com/", "nonsense"]) expect([url, isLoopback(url)]).toEqual([url, false])
  })
})
