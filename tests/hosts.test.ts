/** The addresses the extension connects to (shared/hosts.ts) and the host permissions of the manifest. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_ATTACHMENTS_BASE, DEFAULT_SERVER_URL } from "../src/offline/bergamot/manager"
import { RELEASES } from "../src/offline/dictionary/download"
import { FIXED_HOSTS, isLoopback, isPublicHost, KEYED_HOSTS, MS_EDGE_TRANSLATE_URL, originPattern, patternHost, providerOrigin, REMOTE_ORIGINS, requestUrl } from "../src/shared/hosts"
import { PROVIDER_PRESETS } from "../src/shared/providers"
import { DEEPL_FREE_URL, emptyProviderConfig, resolveProviderConfig } from "../src/shared/settings"

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "static", "manifest.json"), "utf8")) as { permissions: string[]; optional_permissions: string[] }
const hostPermissions = manifest.permissions.filter((p) => p.includes("://"))
const isFixedHost = (pattern: string) => FIXED_HOSTS.includes(pattern)
const isKeyedHost = (pattern: string) => KEYED_HOSTS.includes(pattern)
const resolved = (id: string, over: Partial<ReturnType<typeof emptyProviderConfig>> = {}) => resolveProviderConfig(id, { ...emptyProviderConfig(), ...over })

describe("host permissions of the manifest", () => {
  it("list the fixed hosts and nothing broader, and leave out tabs and <all_urls>", () => {
    expect(hostPermissions).toEqual([...FIXED_HOSTS])
    expect(manifest.permissions.filter((p) => !p.includes("://"))).toEqual(["messagesModify", "messagesRead", "sensitiveDataUpload", "storage", "unlimitedStorage"])
    for (const host of [...hostPermissions, ...KEYED_HOSTS]) expect(host).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]+\/\*$/)
    // The hosts of the key services, each by itself, then any address the user types and the access to the remote images Thunderbird shows.
    expect(manifest.optional_permissions).toEqual([...KEYED_HOSTS, "http://*/*", "https://*/*"])
    expect(manifest.optional_permissions.slice(-2)).toEqual([...REMOTE_ORIGINS])
    expect(FIXED_HOSTS.filter(isKeyedHost)).toEqual([])
  })

  it("hold the free routes from the start and leave the default endpoint of every preset with a key to its permission", () => {
    const online = PROVIDER_PRESETS.filter((p) => p.defaultBaseURL && !isLoopback(p.defaultBaseURL))
    // Google, Microsoft (Azure key mode), DeepL, Baidu, Youdao, Caiyun and 18 AI presets; Azure OpenAI, DeepLX and the custom endpoint have no default.
    expect(online).toHaveLength(24)
    // Google translates without a key; every other default endpoint needs one, and its host is optional.
    for (const preset of online) {
      const host = originPattern(preset.defaultBaseURL)!
      expect([preset.id, isFixedHost(host), isKeyedHost(host)]).toEqual([preset.id, preset.id === "google-free", preset.id !== "google-free"])
    }
    // The other default of DeepL, for the keys of its free plan.
    expect(isKeyedHost(originPattern(DEEPL_FREE_URL)!)).toBe(true)
    // Every key host is the default of a preset: none is left over.
    const defaults = new Set([...online.map((p) => originPattern(p.defaultBaseURL)), originPattern(DEEPL_FREE_URL)])
    expect(KEYED_HOSTS.filter((host) => !defaults.has(host))).toEqual([])
    for (const preset of PROVIDER_PRESETS.filter((p) => p.defaultBaseURL && isLoopback(p.defaultBaseURL))) expect([isFixedHost(originPattern(preset.defaultBaseURL)!), isKeyedHost(originPattern(preset.defaultBaseURL)!)]).toEqual([false, false])
  })

  it("cover the free Microsoft route, the Bergamot model list and files, and the dictionary releases", () => {
    for (const url of [MS_EDGE_TRANSLATE_URL, DEFAULT_SERVER_URL, DEFAULT_ATTACHMENTS_BASE, RELEASES, "https://release-assets.githubusercontent.com/x"]) {
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

describe("the hosts of the public internet", () => {
  it("leave out this computer, the local network and the special ranges, however the address is written", () => {
    const local = [
      "http://localhost/x.png",
      "http://LOCALHOST./x.png",
      "http://cam.localhost/x.png",
      "http://printer.local/x.png",
      "http://nas.internal/x.png",
      "http://router.home.arpa/x.png",
      "http://intranet/x.png",
      "http://127.0.0.1:8080/x.png",
      "http://127.1/x.png",
      "http://2130706433/x.png",
      "http://0x7f000001/x.png",
      "http://0177.0.0.1/x.png",
      "http://0.0.0.0/x.png",
      "http://10.1.2.3/x.png",
      "http://100.64.0.1/x.png",
      "http://100.127.255.255/x.png",
      "http://169.254.169.254/latest/meta-data",
      "http://172.16.0.1/x.png",
      "http://172.31.255.255/x.png",
      "http://192.168.1.1/x.png",
      "http://198.18.0.1/x.png",
      "http://224.0.0.1/x.png",
      "http://255.255.255.255/x.png",
      "http://[::1]/x.png",
      "http://[::]/x.png",
      "http://[fc00::1]/x.png",
      "http://[fd12:3456::1]/x.png",
      "http://[fe80::1]/x.png",
      "http://[ff02::1]/x.png",
      "http://[::ffff:127.0.0.1]/x.png",
      "http://[::ffff:192.168.0.2]/x.png",
      "http://[64:ff9b::a00:1]/x.png",
      "http://[64:ff9b:1::1]/x.png",
      "http://[2002:c0a8:1::1]/x.png",
      "http://[2001:db8::1]/x.png",
      "http://[100::1]/x.png",
      "not a url",
    ]
    for (const url of local) expect([url, isPublicHost(url)]).toEqual([url, false])
    const internet = [
      "https://cdn.example.com/x.png",
      "https://CDN.Example.COM./x.png",
      "http://93.184.216.34/x.png",
      "http://100.63.255.255/x.png",
      "http://100.128.0.1/x.png",
      "http://172.15.0.1/x.png",
      "http://172.32.0.1/x.png",
      "http://8.8.8.8/x.png",
      "http://[2606:4700::1111]/x.png",
      "http://[::ffff:8.8.8.8]/x.png",
      "http://[64:ff9b::808:808]/x.png",
      "http://[2002:808:808::1]/x.png",
      "https://localhost.example.com/x.png",
      "https://mail.local-news.com/x.png",
    ]
    for (const url of internet) expect([url, isPublicHost(url)]).toEqual([url, true])
  })
})

describe("the privacy policy", () => {
  it("I8: names every fixed host of the machine translators and the offline data, in English and in Chinese", () => {
    // The endpoints of the AI presets are covered by "the endpoint of that service shown in the settings".
    const ai = new Set(PROVIDER_PRESETS.filter((p) => p.kind === "llm").map((p) => originPattern(p.defaultBaseURL)))
    const hosts = [...FIXED_HOSTS, ...KEYED_HOSTS].filter((pattern) => !ai.has(pattern)).map(patternHost)
    expect(hosts.length).toBeGreaterThan(10)
    for (const file of ["privacy-policy.md", "privacy-policy.zh-CN.md"]) {
      const policy = readFileSync(join(__dirname, "..", "store", file), "utf8")
      expect(hosts.filter((host) => !policy.includes(host)), file).toEqual([])
    }
  })
})
