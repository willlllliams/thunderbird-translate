/**
 * Image translation in the shared layer: which models read images and what an image costs them (shared/vision.ts),
 * the prompts (shared/image-prompt.ts), the filters of the content script (shared/image.ts), and the image settings
 * with their defaults, migration and the part the content script sees (shared/settings.ts).
 */
import { describe, expect, it } from "vitest"
import { buildImageSystem, buildImageUserText, imageOutputTokens, imagePromptTokens, NO_TEXT, outputRules, SUMMARY_MAX_TOKENS } from "../src/shared/image-prompt"
import { filterImage, type ImageCandidate, imageSource } from "../src/shared/image"
import { ENGLISH, setI18n } from "../src/shared/i18n"
import { visionHint } from "../src/shared/page"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"
import { PROVIDER_PRESETS } from "../src/shared/providers"
import { createDefaultSettings, defaultImageSettings, IMAGE_RANGES, imageStatus, normalizeSettings, resolveVisionProvider, type Settings, toPublicSettings, visionProvider } from "../src/shared/settings"
import { imageDetailOptions, imageTokens, SUGGESTED_VISION_MODELS, uploadFormat, visionSupport } from "../src/shared/vision"

setI18n(ENGLISH)

describe("models that read images", () => {
  it("knows the default model of every AI preset as the design checked it", () => {
    const expected: Record<string, string> = {
      openai: "yes",
      anthropic: "yes",
      gemini: "yes",
      deepseek: "yes",
      xai: "yes",
      mistral: "yes",
      openrouter: "yes",
      doubao: "yes",
      zhipu: "no",
      dashscope: "unknown",
      siliconflow: "no",
      moonshot: "unknown",
      ollama: "no",
      groq: "no",
      togetherai: "no",
      fireworks: "no",
      deepinfra: "no",
      cerebras: "no",
      perplexity: "unknown",
      azure: "yes",
      lmstudio: "unknown",
      custom: "unknown",
    }
    for (const p of PROVIDER_PRESETS.filter((preset) => preset.kind === "llm")) expect([p.id, visionSupport(p.id, p.defaultModel)]).toEqual([p.id, expected[p.id]])
  })

  it("never refuses the model it suggests, and names one for the services whose default does not read images", () => {
    for (const [id, model] of Object.entries(SUGGESTED_VISION_MODELS)) expect([id, visionSupport(id, model)]).not.toEqual([id, "no"])
    for (const id of ["zhipu", "siliconflow", "ollama", "groq"]) expect(SUGGESTED_VISION_MODELS[id]).toBeTruthy()
  })

  it.each([
    ["deepseek", "deepseek-v4-pro", "no"],
    ["zhipu", "glm-4v-flash", "no"],
    ["zhipu", "glm-4.6v-flash", "yes"],
    ["ollama", "qwen3:8b", "no"],
    ["ollama", "qwen3-vl:8b", "yes"],
    ["ollama", "llava:13b", "yes"],
    ["siliconflow", "Qwen/Qwen2.5-VL-72B-Instruct", "yes"],
    ["moonshot", "moonshot-v1-8k", "no"],
    ["moonshot", "kimi-k3", "yes"],
    ["custom", "my-own-model", "unknown"],
    ["lmstudio", "gemma-3-12b", "yes"],
    ["openrouter", "anthropic/claude-haiku-4.5", "yes"],
    ["openai", "o4-mini", "yes"],
  ])("%s %s: %s", (id, model, support) => {
    expect(visionSupport(id, model)).toBe(support)
  })

  it("uploads JPEG to a service that refuses the chosen format", () => {
    expect(uploadFormat("xai", "image/webp")).toBe("image/jpeg")
    expect(uploadFormat("zhipu", "image/webp")).toBe("image/jpeg")
    expect(uploadFormat("xai", "image/png")).toBe("image/png")
    expect(uploadFormat("gemini", "image/webp")).toBe("image/webp")
  })

  it("sends the detail only where the SDK puts it into the image, and never for auto", () => {
    expect(imageDetailOptions("openai", "high")).toEqual({ openai: { imageDetail: "high" } })
    expect(imageDetailOptions("deepseek", "low")).toEqual({ deepseek: { imageDetail: "low" } })
    expect(imageDetailOptions("openai", "auto")).toBeNull()
    expect(imageDetailOptions("doubao", "high")).toBeNull()
  })

  it.each([
    ["openai", "gpt-4.1-mini", "auto", 1245],
    ["openai", "gpt-4.1-nano", "auto", 1890],
    ["openai", "gpt-5-mini", "auto", 922],
    ["openai", "gpt-5-nano", "auto", 1152],
    ["openai", "gpt-4o-mini", "auto", 25501],
    ["openai", "gpt-4o-mini", "low", 2833],
    ["openai", "gpt-4o", "auto", 765],
    ["openai", "gpt-4.1", "low", 85],
    ["openrouter", "openai/gpt-4.1-mini", "auto", 1245],
    ["anthropic", "claude-haiku-5-5", "auto", 1036],
    ["gemini", "gemini-2.5-flash-lite", "auto", 516],
    ["dashscope", "qwen3-vl-plus", "auto", 770],
    ["doubao", "doubao-seed-2-0-mini-260428", "high", 1280],
    ["doubao", "doubao-seed-2-0-mini-260428", "auto", 446],
    ["mistral", "mistral-small-latest", "auto", 1003],
  ] as const)("%s %s (%s): %i tokens for 1024 × 768", (id, model, detail, tokens) => {
    expect(imageTokens(id, model, 1024, 768, detail)).toBe(tokens)
  })

  it("has the small and the large cases of the formulas, and no estimate without a formula", () => {
    expect(imageTokens("gemini", "gemini-2.5-flash", 300, 200)).toBe(258)
    expect(imageTokens("anthropic", "claude-sonnet-5-5", 4000, 3000)).toBe(1568)
    // The example of OpenAI: 2048 × 4096 is fitted into 2048 × 2048, then its short side scaled down to 768: six tiles.
    expect(imageTokens("openai", "gpt-4o", 2048, 4096)).toBe(85 + 170 * 6)
    expect(imageTokens("openai", "gpt-4o", 4096, 1024)).toBe(85 + 170 * 4)
    expect(imageTokens("deepseek", "deepseek-flash", 1024, 768)).toBeNull()
  })
})

describe("prompts of an image", () => {
  const output = (over: Partial<ReturnType<typeof defaultImageSettings>> = {}) => ({ ...defaultImageSettings(), ...over })

  it.each([
    ["table with the original", output(), [/^Give a table with the header row "\| Original \| Translation \|"/, /NO_TEXT and nothing else/]],
    ["list without the original", output({ showSource: false }), [/^Give a list with one translated label/, /NO_TEXT/]],
    ["summary", output({ output: "summary" }), [/^Give one or two sentences in \{\{to\}\}/, /NO_TEXT/]],
    ["both", output({ output: "both" }), [/^Start with one line "\*\*Summary:\*\* "/, /^Then, after a blank line: Give a table/, /NO_TEXT/]],
    ["both without the original", output({ output: "both", showSource: false }), [/^Start with one line/, /^Then, after a blank line: Give a list/, /NO_TEXT/]],
    ["a sentence for images without text", output({ noText: "describe" }), [/^Give a table/, /^For an OTHER image give one sentence in \{\{to\}\}, at most 20 words/]],
  ])("adds the rules of %s", (_name, settings, patterns) => {
    const rules = outputRules(settings)
    expect(rules).toHaveLength(patterns.length)
    rules.forEach((rule, i) => expect(rule).toMatch(patterns[i]))
  })

  it("puts the rules after the prompt and the target language for every {{to}}", () => {
    const system = buildImageSystem(DEFAULT_PROMPTS.image, "German", output({ output: "summary" }))
    expect(system.startsWith(DEFAULT_PROMPTS.image.replaceAll("{{to}}", "German"))).toBe(true)
    expect(system).toContain("\n\nOutput format (follow exactly):\n- Give one or two sentences in German")
    expect(system).not.toContain("{{to}}")
    expect(DEFAULT_PROMPTS.image).toContain("Do not describe trends")
    expect(DEFAULT_PROMPTS.image).toContain("[?]")
    expect(NO_TEXT).toBe("NO_TEXT")
  })

  it("names the image and the language, with the glossary of precise translation", () => {
    expect(buildImageUserText(2, "Japanese")).toBe("Image 2 of the email. Target language: Japanese.")
    expect(buildImageUserText(1, "Japanese", [{ source: "Acme", target: "アクメ" }])).toBe("Image 1 of the email. Target language: Japanese.\nGlossary, use these translations:\n- Acme → アクメ")
  })

  it("asks for at most 200 tokens for a summary, else the setting", () => {
    expect(imageOutputTokens(output())).toBe(1024)
    expect(imageOutputTokens(output({ output: "summary" }))).toBe(SUMMARY_MAX_TOKENS)
    expect(imageOutputTokens(output({ output: "summary", maxOutputTokens: 150 }))).toBe(150)
  })

  it("estimates the tokens of the prompts by their length", () => {
    const tokens = imagePromptTokens(DEFAULT_PROMPTS.image, "English", output())
    expect(tokens).toBe(Math.round((buildImageSystem(DEFAULT_PROMPTS.image, "English", output()).length + buildImageUserText(1, "English").length) / 4))
    expect(tokens).toBeGreaterThan(300)
    expect(tokens).toBeLessThan(600)
  })
})

describe("images the content script considers", () => {
  const settings = { ...defaultImageSettings() }
  const image = (over: Partial<ImageCandidate> = {}): ImageCandidate => ({ width: 400, height: 200, src: "mailbox:///C:/Inbox?number=3&part=1.2&filename=chart.png", inSignature: false, attachment: false, ...over })

  it("reads the part of a message part, the bytes of a data: URI, and nothing of other addresses", () => {
    expect(imageSource("mailbox:///C:/Inbox?number=3&part=1.2&filename=chart.png")).toEqual({ kind: "part", part: "1.2" })
    expect(imageSource("imap://anna@mail.example:993/fetch%3EUID%3E/INBOX%3E42?part=1.1.3&type=image/png")).toEqual({ kind: "part", part: "1.1.3" })
    expect(imageSource("data:image/png;base64,iVBORw0KGgo=")).toEqual({ kind: "data", data: "data:image/png;base64,iVBORw0KGgo=" })
    expect(imageSource("https://tracker.example/p.gif")).toEqual({ kind: "remote" })
    for (const src of ["cid:logo@example", "mailbox:///x?part=../1", "mailbox:///x", "not an address", ""]) expect(imageSource(src)).toEqual({ kind: "other" })
  })

  it.each<[string, Partial<ImageCandidate>, string | null]>([
    ["a chart", {}, null],
    ["a remote image", { src: "http://example.com/a.png" }, "remote"],
    ["an unreplaced cid:", { src: "cid:a@b" }, "source"],
    ["a tracking pixel of 2 px", { width: 2, height: 2 }, "tracking"],
    ["a line of 1 px", { width: 600, height: 1 }, "tracking"],
    ["a logo in the signature", { inSignature: true }, "signature"],
    ["a short side of 99 px", { width: 600, height: 99 }, "small"],
    ["a short side of 100 px", { width: 400, height: 100 }, null],
    ["an area below 200 × 200", { width: 199, height: 200 }, "area"],
    ["an area of 200 × 200", { width: 200, height: 200 }, null],
    ["a ratio of 8.0", { width: 1600, height: 200 }, null],
    ["a ratio of 8.01", { width: 1602, height: 200 }, "aspect"],
  ])("%s", (_name, over, reason) => {
    expect(filterImage(image(over), settings)).toBe(reason)
  })

  it("follows the sources and the signature switch of the settings", () => {
    expect(filterImage(image({ attachment: true }), { ...settings, sources: { inline: true, attachments: false } })).toBe("source")
    expect(filterImage(image(), { ...settings, sources: { inline: false, attachments: true } })).toBe("source")
    expect(filterImage(image({ attachment: true }), { ...settings, sources: { inline: false, attachments: true } })).toBeNull()
    expect(filterImage(image({ inSignature: true }), { ...settings, skipSignature: false })).toBeNull()
    expect(filterImage(image({ width: 50, height: 50 }), { ...settings, minSide: 16, minArea: 0 })).toBeNull()
  })
})

describe("image settings", () => {
  /** Precise translation with OpenAI as the AI tier. */
  const precise = (): Settings => {
    const s = createDefaultSettings("en")
    s.tiers.ai = "openai"
    s.providers.openai = { enabled: true, apiKey: "sk-1", baseURL: "", model: "" }
    s.precise.enabled = true
    return s
  }

  it("default to a button under each image, the limits of the design and no consent", () => {
    const s = createDefaultSettings("en")
    expect(s.image).toEqual(defaultImageSettings())
    expect(s.image).toMatchObject({ mode: "ask", maxPerMessage: 5, minSide: 100, minArea: 40000, minKB: 4, maxAspect: 8, maxLongEdge: 1568, format: "jpeg", quality: 0.85, maxImageKB: 1500, maxMessageMB: 6, output: "table", noText: "skip", maxOutputTokens: 1024, timeoutSeconds: 90, concurrency: 2 })
    expect(s.imageConsent).toEqual([])
    expect(s.prompts.image).toBe("")
  })

  it("take the defaults for settings saved before 2.4.0", () => {
    const s = normalizeSettings({ tiers: { dictionary: null, machine: "google-free", ai: null }, prompts: { bilingual: "", translationOnly: "", precise: "", summary: "" } })
    expect(s.image).toEqual(defaultImageSettings())
    expect(s.imageConsent).toEqual([])
  })

  it("keep valid values, replace unknown ones and clamp numbers to their ranges", () => {
    const s = normalizeSettings({
      image: {
        mode: "auto",
        provider: "gemini",
        model: " gemini-2.5-flash ",
        sources: { inline: false },
        maxPerMessage: 99,
        minSide: 1,
        quality: "0.7",
        maxImageKB: Number.NaN,
        animated: "firstFrame",
        format: "gif",
        detail: "high",
        output: "both",
        noText: "describe",
        showSource: false,
        useContext: false,
        display: "collapsed",
        showUsage: false,
        confirmEachMessage: true,
        skipSignature: false,
      },
      imageConsent: ["openai", "openai", "google-free", "dictionary", 7, "no-such"],
    })
    expect(s.image).toEqual({
      ...defaultImageSettings(),
      mode: "auto",
      provider: "gemini",
      model: "gemini-2.5-flash",
      sources: { inline: false, attachments: true },
      maxPerMessage: IMAGE_RANGES.maxPerMessage[1],
      minSide: IMAGE_RANGES.minSide[0],
      quality: 0.7,
      animated: "firstFrame",
      detail: "high",
      output: "both",
      noText: "describe",
      showSource: false,
      useContext: false,
      display: "collapsed",
      showUsage: false,
      confirmEachMessage: true,
      skipSignature: false,
    })
    // Only online AI services can be allowed to receive images.
    expect(s.imageConsent).toEqual(["openai"])
    expect(normalizeSettings({ image: { mode: "sometimes", provider: "google-free", sources: "all" }, imageConsent: "openai" }).image).toEqual(defaultImageSettings())
    expect(normalizeSettings({ image: "on" }).imageConsent).toEqual([])
  })

  it("read the images with the service chosen for them when it is added, else with the AI tier, without thinking", () => {
    const s = precise()
    expect(visionProvider(s)).toBe("openai")
    s.image.provider = "gemini"
    expect(visionProvider(s)).toBe("openai")
    s.providers.gemini.enabled = true
    expect(visionProvider(s)).toBe("gemini")
    s.providers.openai.thinking = true
    s.image.model = "gpt-4.1"
    expect(resolveVisionProvider(s, "openai")).toMatchObject({ model: "gpt-4.1", thinking: false })
    s.image.model = ""
    expect(resolveVisionProvider(s, "openai").model).toBe("gpt-4.1-mini")
  })

  it("apply only with precise translation and a model that does not refuse images", () => {
    const s = precise()
    expect(imageStatus(s)).toEqual({ id: "openai", model: "gpt-4.1-mini", support: "yes", active: true })
    expect(toPublicSettings(s).image.mode).toBe("ask")
    s.precise.enabled = false
    expect(imageStatus(s).active).toBe(false)
    expect(toPublicSettings(s).image.mode).toBe("off")
    s.precise.enabled = true
    s.image.model = "gpt-3.5-turbo"
    expect(imageStatus(s)).toMatchObject({ support: "unknown", active: true })
    s.tiers.ai = "zhipu"
    s.providers.zhipu.enabled = true
    s.image.model = ""
    expect(imageStatus(s)).toEqual({ id: "zhipu", model: "glm-4-flash", support: "no", active: false })
    expect(toPublicSettings(s).image.mode).toBe("off")
    expect(imageStatus(createDefaultSettings("en"))).toEqual({ id: null, model: "", support: null, active: false })
  })

  it("show the content script the filters, the consent with the host and what is sent, and a signature of the result", () => {
    const s = precise()
    s.image.mode = "auto"
    const pub = toPublicSettings(s).image
    expect(pub).toEqual({
      mode: "auto",
      sources: { inline: true, attachments: true },
      maxPerMessage: 5,
      minSide: 100,
      minArea: 40000,
      maxAspect: 8,
      skipSignature: true,
      collapsed: false,
      showUsage: true,
      consent: { id: "openai", host: "api.openai.com" },
      confirmEachMessage: false,
      maxLongEdge: 1568,
      format: "image/jpeg",
      signature: pub.signature,
    })
    expect(JSON.stringify(pub)).not.toContain("sk-1")
    s.imageConsent = ["openai"]
    expect(toPublicSettings(s).image.consent).toBeNull()
    // With "confirm each message" the content script asks every time.
    s.image.confirmEachMessage = true
    expect(toPublicSettings(s).image.consent).toEqual({ id: "openai", host: "api.openai.com" })
    s.image.confirmEachMessage = false
    // Whatever changes the answer changes the signature; the filters of the content script do not need to.
    const signature = toPublicSettings(s).image.signature
    for (const change of [
      (x: Settings) => (x.image.output = "both"),
      (x: Settings) => (x.image.quality = 0.6),
      (x: Settings) => (x.image.model = "gpt-4.1"),
      (x: Settings) => (x.prompts.image = "Read {{to}}."),
      (x: Settings) => (x.targetLang = "ja"),
      (x: Settings) => (x.providers.openai.baseURL = "https://proxy.example/v1"),
    ]) {
      const t = structuredClone(s)
      change(t)
      expect(toPublicSettings(t).image.signature).not.toBe(signature)
    }
    s.image.minSide = 50
    expect(toPublicSettings(s).image.signature).toBe(signature)
    // xAI takes no WebP: the panel says JPEG.
    s.tiers.ai = "xai"
    s.providers.xai.enabled = true
    s.image.format = "webp"
    expect(toPublicSettings(s).image.format).toBe("image/jpeg")
    expect(toPublicSettings(createDefaultSettings("en")).image).toMatchObject({ mode: "off", consent: null, format: "image/jpeg" })
  })

  it("name a model that refuses images with a model that reads them, and a model nobody knows", () => {
    expect(visionHint({ id: "zhipu", model: "glm-4-flash", support: "no", active: false })).toBe(ENGLISH.t("hintVisionNo", ["glm-4-flash", "glm-4.6v-flash"]))
    expect(visionHint({ id: "cerebras", model: "gpt-oss-120b", support: "no", active: false })).toBe(ENGLISH.t("hintVisionNoSuggestion", ["gpt-oss-120b"]))
    expect(visionHint({ id: "custom", model: "m", support: "unknown", active: true })).toBe(ENGLISH.t("hintVisionUnknown", ["m"]))
    expect(visionHint({ id: "openai", model: "gpt-4.1-mini", support: "yes", active: true })).toBe("")
    expect(visionHint({ id: null, model: "", support: null, active: false })).toBe("")
  })
})
