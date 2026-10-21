import { generateText } from "ai"
import { describe, expect, it, vi } from "vitest"
import { buildProviderSettings, createLanguageModel } from "../src/background/providers/factory"
import { supportsThinkingControl, thinkingOptions } from "../src/shared/thinking"
import { llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle } from "../src/background/translators/llm"
import { BatchParseError } from "../src/background/translators/llm-prompt"
import { PROVIDER_PRESETS } from "../src/shared/providers"
import { createDefaultSettings, DEFAULT_DEEPL, resolveProvider, resolveProviderConfig } from "../src/shared/settings"
import { anthropicMessage, chatCompletion, jsonResponse, useFakeTimers } from "./helpers"

const LLM_PRESETS = PROVIDER_PRESETS.filter((p) => p.kind === "llm")

/** Minimal successful responses for each API family. */
function fakeResponse(url: string): Response {
  if (url.includes("api.anthropic.com") || url.endsWith("/messages")) return anthropicMessage("你好")
  if (url.endsWith("/responses") || url.endsWith("/v1/agent")) {
    return jsonResponse({
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
    })
  }
  if (url.includes(":generateContent")) {
    return jsonResponse({
      candidates: [{ content: { role: "model", parts: [{ text: "你好" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    })
  }
  return chatCompletion("你好")
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

  it("defaults to the free Google service as machine translation tier", () => {
    expect(createDefaultSettings().tiers).toEqual({ dictionary: null, machine: "google-free", ai: null })
  })

  it("uses the user's endpoint, model and temperature over preset defaults", () => {
    const s = createDefaultSettings()
    s.providers.openai = { enabled: true, apiKey: " sk ", baseURL: "https://proxy.example.com/v1/", model: "gpt-x", temperature: 0.7 }
    expect(resolveProvider(s, "openai")).toEqual({
      id: "openai",
      apiKey: "sk",
      baseURL: "https://proxy.example.com/v1",
      model: "gpt-x",
      temperature: 0.7,
      thinking: false,
      mode: "free",
      region: "",
      appId: "",
      edition: "standard",
      deepl: DEFAULT_DEEPL,
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
    const seen: { url: string; headers: Record<string, string>; body: string }[] = []
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const headers = Object.fromEntries(new Headers(init?.headers).entries())
      seen.push({ url, headers, body: String(init?.body) })
      return fakeResponse(url)
    }) as typeof fetch
    const model = createLanguageModel(resolved, fetchFn)
    const result = await generateText({ model, prompt: "Hello", maxRetries: 0 })
    expect(result.text).toBe("你好")
    expect(seen).toHaveLength(1)
    expect(seen[0].url.startsWith(`${resolved.baseURL}/`)).toBe(true)
    // The model goes in the body, or in the URL for Gemini and Azure deployments.
    const body = JSON.parse(seen[0].body) as { model?: string }
    if (preset.sdk === "google" || (preset.sdk === "azure" && body.model === undefined)) expect(decodeURIComponent(seen[0].url)).toContain(resolved.model)
    else expect(body.model).toBe(resolved.model)
    expect(JSON.stringify(body)).toContain("Hello")
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

describe("thinking switch", () => {
  const off = (id: string, model: string) => thinkingOptions(id, model, false).providerOptions
  const on = (id: string, model: string) => thinkingOptions(id, model, true).providerOptions

  it.each([
    // [preset, model, off, on]
    ["openai", "gpt-4.1-mini", undefined, undefined],
    ["openai", "gpt-5-mini", { openai: { reasoningEffort: "minimal" } }, { openai: { reasoningEffort: "medium" } }],
    ["openai", "gpt-5.1", { openai: { reasoningEffort: "none" } }, { openai: { reasoningEffort: "medium" } }],
    ["openai", "o4-mini", { openai: { reasoningEffort: "low" } }, { openai: { reasoningEffort: "medium" } }],
    ["azure", "gpt-5-nano", { openai: { reasoningEffort: "minimal" } }, { openai: { reasoningEffort: "medium" } }],
    ["anthropic", "claude-haiku-5-5", { anthropic: { thinking: { type: "disabled" } } }, { anthropic: { thinking: { type: "adaptive" } } }],
    ["anthropic", "claude-haiku-4-5", undefined, { anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } } }],
    ["gemini", "gemini-2.5-flash-lite", { google: { thinkingConfig: { thinkingBudget: 0 } } }, { google: { thinkingConfig: { thinkingBudget: -1 } } }],
    ["gemini", "gemini-2.5-pro", { google: { thinkingConfig: { thinkingBudget: 128 } } }, { google: { thinkingConfig: { thinkingBudget: -1 } } }],
    ["gemini", "gemini-3-flash", { google: { thinkingConfig: { thinkingLevel: "low" } } }, { google: { thinkingConfig: { thinkingLevel: "high" } } }],
    ["deepseek", "deepseek-flash", { deepseek: { thinking: { type: "disabled" } } }, { deepseek: { thinking: { type: "enabled" } } }],
    ["xai", "grok-4.5", { xai: { reasoningEffort: "low" } }, { xai: { reasoningEffort: "high" } }],
    ["xai", "grok-4.7", { xai: { reasoningEffort: "low" } }, { xai: { reasoningEffort: "high" } }],
    ["xai", "grok-4.3", { xai: { reasoningEffort: "none" } }, { xai: { reasoningEffort: "high" } }],
    ["xai", "grok-4.20-0309-non-reasoning", undefined, undefined],
    ["groq", "llama-3.3-70b-versatile", undefined, undefined],
    ["groq", "qwen/qwen3-32b", { groq: { reasoningEffort: "none" } }, { groq: { reasoningEffort: "default", reasoningFormat: "parsed" } }],
    ["groq", "openai/gpt-oss-20b", { groq: { reasoningEffort: "low" } }, { groq: { reasoningEffort: "medium" } }],
    ["mistral", "mistral-small-latest", { mistral: { reasoningEffort: "none" } }, { mistral: { reasoningEffort: "high" } }],
    ["togetherai", "meta-llama/Llama-3.3-70B-Instruct-Turbo", undefined, undefined],
    ["togetherai", "Qwen/Qwen3-235B-A22B", { togetherai: { reasoning: { enabled: false } } }, { togetherai: { reasoning: { enabled: true } } }],
    ["fireworks", "accounts/fireworks/models/deepseek-v3p1", { fireworks: { reasoningEffort: "none" } }, { fireworks: { reasoningEffort: "medium" } }],
    ["deepinfra", "deepseek-ai/DeepSeek-V3", { deepinfra: { reasoningEffort: "none" } }, { deepinfra: { reasoningEffort: "high" } }],
    ["cerebras", "gpt-oss-120b", { cerebras: { reasoningEffort: "low" } }, { cerebras: { reasoningEffort: "medium" } }],
    ["moonshot", "kimi-k2-turbo-preview", undefined, undefined],
    ["moonshot", "kimi-k2.6", { moonshotai: { thinking: { type: "disabled" } } }, { moonshotai: { thinking: { type: "enabled" } } }],
    ["dashscope", "qwen-plus", { alibaba: { enableThinking: false } }, { alibaba: { enableThinking: true } }],
    ["ollama", "qwen3:8b", { ollama: { reasoningEffort: "none" } }, { ollama: { reasoningEffort: "medium" } }],
    ["openrouter", "openai/gpt-4.1-mini", { openrouter: { reasoning: { enabled: false } } }, { openrouter: { reasoning: { enabled: true } } }],
    ["openrouter", "openai/gpt-5-mini", { openrouter: { reasoning: { effort: "low" } } }, { openrouter: { reasoning: { enabled: true } } }],
    ["zhipu", "glm-4-flash", undefined, undefined],
    ["zhipu", "glm-4.5-air", { zhipu: { thinking: { type: "disabled" } } }, { zhipu: { thinking: { type: "enabled" } } }],
    ["siliconflow", "Qwen/Qwen3-8B", { siliconflow: { enable_thinking: false } }, { siliconflow: { enable_thinking: true } }],
    ["doubao", "doubao-seed-2-0-mini-260428", { doubao: { thinking: { type: "disabled" } } }, { doubao: { thinking: { type: "enabled" } } }],
    ["doubao", "doubao-1-5-pro-32k-250115", undefined, undefined],
  ])("%s %s", (id, model, expectedOff, expectedOn) => {
    expect(off(id, model)).toEqual(expectedOff)
    expect(on(id, model)).toEqual(expectedOn)
  })

  it("is not offered by providers without a thinking parameter", () => {
    for (const id of ["perplexity", "lmstudio", "custom", "google-free", "deeplx"]) {
      expect(supportsThinkingControl(id), id).toBe(false)
      expect(thinkingOptions(id, "any-model", true)).toEqual({ dropTemperature: false })
    }
    for (const p of LLM_PRESETS.filter((p) => !["perplexity", "lmstudio", "custom"].includes(p.id))) {
      expect(supportsThinkingControl(p.id), p.id).toBe(true)
    }
  })

  it("leaves the temperature out only while thinking is on", () => {
    expect(thinkingOptions("deepseek", "deepseek-flash", true).dropTemperature).toBe(true)
    expect(thinkingOptions("deepseek", "deepseek-flash", false).dropTemperature).toBe(false)
  })

  async function requestBody(id: string, thinking: boolean): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> = {}
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return fakeResponse(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    }) as typeof fetch
    await llmTranslateSingle({ text: "Hello" }, { provider: { ...configFor(id), thinking }, systemPrompt: "", targetLanguageName: "Chinese", fetchFn })
    return body
  }

  it("turns DeepSeek thinking off by default, so the temperature applies", async () => {
    const body = await requestBody("deepseek", false)
    expect(body.thinking).toEqual({ type: "disabled" })
    expect(body.temperature).toBe(1.3)
    const thinkingBody = await requestBody("deepseek", true)
    expect(thinkingBody.thinking).toEqual({ type: "enabled" })
    expect(thinkingBody.temperature).toBeUndefined()
  })

  it("sends the switch in each provider's own format", async () => {
    expect((await requestBody("anthropic", false)).thinking).toEqual({ type: "disabled" })
    expect(((await requestBody("gemini", false)).generationConfig as Record<string, unknown>).thinkingConfig).toEqual({ thinkingBudget: 0 })
    expect((await requestBody("openai", false)).reasoning_effort).toBeUndefined()
    expect((await requestBody("dashscope", false)).enable_thinking).toBe(false)
    expect((await requestBody("ollama", false)).reasoning_effort).toBe("none")
  })
})

describe("LLM calls", () => {
  /** Chat Completions endpoint that records request bodies and answers `content`. */
  function recorder(content = "你好") {
    const bodies: Record<string, unknown>[] = []
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return chatCompletion(content)
    }) as typeof fetch
    return { bodies, fetchFn }
  }
  const opts = (provider: ReturnType<typeof configFor>, fetchFn: typeof fetch) => ({ provider, systemPrompt: "Into {{to}}.", targetLanguageName: "Chinese", fetchFn })

  it("refuses services that are not AI services", () => {
    for (const id of ["google-free", "deeplx", "no-such"]) {
      expect(() => buildProviderSettings({ ...configFor("openai"), id })).toThrow(/no-such|google-free|deeplx/)
    }
  })

  it("sends a placeholder key to local servers without a key", async () => {
    const seen: Headers[] = []
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers))
      return chatCompletion("你好")
    }) as typeof fetch
    const provider = resolveProviderConfig("ollama", { apiKey: "", baseURL: "", model: "" })
    await generateText({ model: createLanguageModel(provider, fetchFn), prompt: "Hello", maxRetries: 0 })
    expect(seen[0].get("authorization")).toBe("Bearer not-needed")
  })

  it("sends the temperature of the settings, and none when it is null", async () => {
    const { bodies, fetchFn } = recorder()
    await llmTranslateSingle({ text: "Hello" }, opts({ ...configFor("openai"), temperature: 0.2 }, fetchFn))
    await llmTranslateSingle({ text: "Hello" }, opts({ ...configFor("openai"), temperature: null }, fetchFn))
    expect(bodies.map((b) => b.temperature)).toEqual([0.2, undefined])
    expect((bodies[0].messages as { role: string; content: string }[])[0]).toEqual({ role: "system", content: "Into Chinese." })
  })

  it("leaves the temperature out for Claude models that reject it", async () => {
    let body: Record<string, unknown> = {}
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return anthropicMessage("你好")
    }) as typeof fetch
    await llmTranslateSingle({ text: "Hello" }, opts({ ...configFor("anthropic"), model: "claude-haiku-5-5", temperature: 0.3 }, fetchFn))
    expect(body.temperature).toBeUndefined()
    await llmTranslateSingle({ text: "Hello" }, opts({ ...configFor("anthropic"), model: "claude-haiku-4-5", temperature: 0.3 }, fetchFn))
    expect(body.temperature).toBe(0.3)
  })

  it("leaves no timer behind a request with a timeout, answered or failed", async () => {
    useFakeTimers()
    try {
      const { fetchFn } = recorder()
      await llmTranslateSingle({ text: "Hello" }, { ...opts(configFor("openai"), fetchFn), timeoutMs: 60_000 })
      expect(vi.getTimerCount()).toBe(0)
      const failing = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch
      await llmTranslateSingle({ text: "Hello" }, { ...opts(configFor("openai"), failing), timeoutMs: 60_000 }).catch(() => {})
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects an empty answer", async () => {
    const { fetchFn } = recorder("```\n```")
    await expect(llmTranslateSingle({ text: "Hello" }, opts(configFor("openai"), fetchFn))).rejects.toThrow(/empty/i)
  })

  it("sends a batch of one as a single request and reports a batch that does not line up", async () => {
    const one = recorder("你好")
    expect(await llmTranslateBatch([{ text: "Hello" }], opts(configFor("openai"), one.fetchFn))).toEqual(["你好"])
    expect(JSON.stringify(one.bodies[0])).not.toContain("exactly")
    const bad = recorder('["只有一条"]')
    await expect(llmTranslateBatch([{ text: "a" }, { text: "b" }], opts(configFor("openai"), bad.fetchFn))).rejects.toBeInstanceOf(BatchParseError)
  })

  it("asks for the analysis in the target language and reads it", async () => {
    const { bodies, fetchFn } = recorder('{"summary": "Greeting.", "tone": "", "glossary": []}')
    expect(await llmAnalyzeMail("Hello", opts(configFor("openai"), fetchFn))).toEqual({ summary: "Greeting.", tone: "", glossary: [] })
    const messages = bodies[0].messages as { role: string; content: string }[]
    expect(messages[0].content).toContain("Chinese")
    expect(messages[0].content).not.toContain("{{to}}")
  })
})
