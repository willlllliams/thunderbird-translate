import { generateText } from "ai"
import { describe, expect, it } from "vitest"
import { buildProviderSettings, createLanguageModel } from "../src/background/providers/factory"
import { PROVIDER_PRESETS } from "../src/shared/providers"
import { createDefaultSettings, resolveProvider, resolveProviderConfig } from "../src/shared/settings"

const LLM_PRESETS = PROVIDER_PRESETS.filter((p) => p.kind === "llm")

/** Minimal successful responses for each API family. */
function fakeResponse(url: string): Response {
  let body: unknown
  if (url.includes("api.anthropic.com") || url.endsWith("/messages")) {
    body = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "m",
      content: [{ type: "text", text: "你好" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }
  } else if (url.endsWith("/responses") || url.endsWith("/v1/agent")) {
    body = {
      id: "resp_1",
      object: "response",
      created_at: 1,
      status: "completed",
      model: "m",
      output: [
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "你好", annotations: [] }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    }
  } else if (url.includes(":generateContent")) {
    body = {
      candidates: [{ content: { role: "model", parts: [{ text: "你好" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    }
  } else {
    body = {
      id: "c1",
      object: "chat.completion",
      created: 1,
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content: "你好" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

function configFor(id: string) {
  const preset = PROVIDER_PRESETS.find((p) => p.id === id)!
  return resolveProviderConfig(id, {
    apiKey: "test-key",
    baseURL: preset.defaultBaseURL ? "" : "https://custom.example.com/openai",
    model: preset.defaultModel ? "" : "test-model",
  })
}

describe("provider presets", () => {
  it("offers at least 20 LLM presets plus the free services", () => {
    expect(LLM_PRESETS.length).toBeGreaterThanOrEqual(20)
    expect(PROVIDER_PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(["google-free", "microsoft-free", "deeplx", "custom"]))
    expect(new Set(PROVIDER_PRESETS.map((p) => p.id)).size).toBe(PROVIDER_PRESETS.length)
  })

  it("defaults to the free Google service", () => {
    expect(createDefaultSettings().activeProviderId).toBe("google-free")
  })

  it("uses the user's endpoint, model and temperature over preset defaults", () => {
    const s = createDefaultSettings()
    s.providers.openai = { apiKey: " sk ", baseURL: "https://proxy.example.com/v1/", model: "gpt-x", temperature: 0.7 }
    expect(resolveProvider(s, "openai")).toEqual({
      id: "openai",
      apiKey: "sk",
      baseURL: "https://proxy.example.com/v1",
      model: "gpt-x",
      temperature: 0.7,
    })
  })
})

describe("provider factory", () => {
  it.each(LLM_PRESETS.map((p) => [p.id, p]))("%s resolves to its preset base URL", (_id, preset) => {
    const settings = buildProviderSettings(configFor(preset.id))
    expect(settings.baseURL).toBe(preset.defaultBaseURL || "https://custom.example.com/openai")
    expect(settings.sdk).toBe(preset.sdk)
  })

  it("adds the direct-browser-access header for Anthropic only", () => {
    expect(buildProviderSettings(configFor("anthropic")).headers["anthropic-dangerous-direct-browser-access"]).toBe("true")
    expect(buildProviderSettings(configFor("openai")).headers["anthropic-dangerous-direct-browser-access"]).toBeUndefined()
  })

  it("rejects missing key, model or endpoint with a readable message", () => {
    expect(() => buildProviderSettings(resolveProviderConfig("openai", { apiKey: "", baseURL: "", model: "" }))).toThrow(/API key/)
    expect(() => buildProviderSettings(resolveProviderConfig("custom", { apiKey: "", baseURL: "", model: "x" }))).toThrow(/base URL/)
    expect(() => buildProviderSettings(resolveProviderConfig("custom", { apiKey: "", baseURL: "http://x", model: "" }))).toThrow(/model/)
    // Local servers do not need a key.
    expect(() => buildProviderSettings(resolveProviderConfig("ollama", { apiKey: "", baseURL: "", model: "" }))).not.toThrow()
  })

  it.each(LLM_PRESETS.map((p) => [p.id, p]))("%s sends its request to the configured endpoint", async (_id, preset) => {
    const resolved = configFor(preset.id)
    const seen: { url: string; headers: Record<string, string> }[] = []
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const headers = Object.fromEntries(new Headers(init?.headers).entries())
      seen.push({ url, headers })
      return fakeResponse(url)
    }) as typeof fetch
    const model = createLanguageModel(resolved, fetchFn)
    const result = await generateText({ model, prompt: "Hello", maxRetries: 0 })
    expect(result.text).toBe("你好")
    expect(seen).toHaveLength(1)
    expect(seen[0].url.startsWith(`${resolved.baseURL}/`)).toBe(true)
    if (preset.sdk === "anthropic") {
      expect(seen[0].headers["anthropic-dangerous-direct-browser-access"]).toBe("true")
      expect(seen[0].headers["x-api-key"]).toBe("test-key")
    } else if (preset.sdk === "google") {
      expect(seen[0].headers["x-goog-api-key"]).toBe("test-key")
    } else if (preset.sdk === "azure") {
      expect(seen[0].headers["api-key"]).toBe("test-key")
    } else {
      expect(seen[0].headers.authorization).toBe("Bearer test-key")
    }
  })
})
