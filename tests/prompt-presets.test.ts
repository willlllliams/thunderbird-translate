/** Prompt presets: options by target language, composition with a prompt, and the batch format with every preset applied. */
import { describe, expect, it, vi } from "vitest"
import { llmAnalyzeMail, llmTranslateBatch, llmTranslateSingle } from "../src/background/translators/llm"
import { applyPreset, availablePresets, getPromptPreset, presetBlock, presetOptions, PROMPT_PRESETS, type PromptPreset } from "../src/shared/prompt-presets"
import { ENGLISH } from "../src/shared/i18n"
import { LANGUAGES } from "../src/shared/languages"
import { DEFAULT_PROMPTS, PROMPT_KINDS } from "../src/shared/prompts"
import { createDefaultSettings } from "../src/shared/settings"
import { chatCompletion, createService } from "./helpers"

const preset = (id: string) => getPromptPreset(id)!
const option = (p: PromptPreset, id: string) => p.options!.find((o) => o.id === id)!
const optionIds = (id: string, target: string) => presetOptions(preset(id), target).map((o) => o.id)

describe("preset options", () => {
  it("offers the regional varieties of the target language only", () => {
    expect(optionIds("dialect", "zh-CN")).toEqual(["yue-HK", "sichuan"])
    expect(optionIds("dialect", "zh-TW")).toEqual(["yue-HK", "zh-TW"])
    expect(optionIds("dialect", "en")).toEqual(["en-GB", "en-US"])
    expect(optionIds("dialect", "pt")).toEqual(["pt-BR", "pt-PT"])
    expect(optionIds("dialect", "es")).toEqual(["es-MX", "es-ES"])
    expect(optionIds("dialect", "fr")).toEqual(["fr-CA"])
    expect(optionIds("dialect", "de")).toEqual(["de-CH"])
    expect(optionIds("dialect", "ja")).toEqual([])
  })

  it("offers every style, and leaves out the dialect preset for a target language without varieties", () => {
    expect(optionIds("style", "ja")).toEqual(["formal", "casual", "plain", "literary"])
    expect(availablePresets("ja").map((p) => p.id)).toEqual(["keepTerms", "explainTerms", "style"])
    expect(availablePresets("zh-CN").map((p) => p.id)).toEqual(["dialect", "keepTerms", "explainTerms", "style"])
  })

  it("has English rules, with the target language as {{to}} where it is named", () => {
    for (const p of PROMPT_PRESETS) {
      expect(p.heading).toMatch(/^[A-Z][a-z].*:$/)
      expect(presetBlock(p, p.options?.[0])).not.toContain("{{option}}")
    }
    expect(presetBlock(preset("keepTerms"))).toContain("{{to}}")
    expect(presetBlock(preset("explainTerms"))).toContain("〔Note: term: explanation; term: explanation〕")
  })
})

describe("applying a preset", () => {
  const base = DEFAULT_PROMPTS.translationOnly

  it("appends the block after a blank line", () => {
    const out = applyPreset(base, preset("keepTerms"))
    expect(out).toBe(`${base}\n\n${presetBlock(preset("keepTerms"))}`)
  })

  it("replaces the block of the same preset and keeps the blocks of other presets", () => {
    const style = preset("style")
    let out = applyPreset(base, style, option(style, "formal"))
    out = applyPreset(out, preset("dialect"), option(preset("dialect"), "sichuan"))
    out = applyPreset(out, style, option(style, "casual"))
    expect(out.split(style.heading)).toHaveLength(2)
    expect(out).not.toContain(option(style, "formal").rule)
    expect(out).toContain(option(style, "casual").rule)
    expect(out).toContain(option(preset("dialect"), "sichuan").rule)
    expect(out.startsWith(base)).toBe(true)
  })

  it("works on a custom prompt and on each of the three prompts", () => {
    expect(applyPreset("Translate into {{to}}.\n\n", preset("explainTerms"))).toBe(`Translate into {{to}}.\n\n${presetBlock(preset("explainTerms"))}`)
    for (const kind of PROMPT_KINDS) {
      const out = applyPreset(DEFAULT_PROMPTS[kind], preset("keepTerms"))
      expect(out.startsWith(DEFAULT_PROMPTS[kind])).toBe(true)
      expect(out.endsWith(presetBlock(preset("keepTerms")))).toBe(true)
    }
  })

  it("finds its own block again after edits of the white space around it", () => {
    const keep = preset("keepTerms")
    const edited = `${base}\n \t\n  ${presetBlock(keep)}\n\nMy own rule.`
    const out = applyPreset(edited, keep)
    expect(out.split(keep.heading)).toHaveLength(2)
    expect(out).toBe(`${base}\n\nMy own rule.\n\n${presetBlock(keep)}`)
  })

  it("inserts the rule of the option literally and leaves no placeholder without an option", () => {
    const style = preset("style")
    const dollar = { ...option(style, "plain"), rule: "Write $& and $1 as they are." }
    expect(presetBlock(style, dollar)).toContain("- Write $& and $1 as they are.")
    expect(presetBlock(style)).toBe(`${style.heading}\n${style.rules.replace("{{option}}", "")}`)
  })
})

describe("batch format with presets", () => {
  /** The translation-only prompt with all four presets, as the AI tier sends it. */
  function setup(content: (call: number) => string) {
    const settings = createDefaultSettings()
    settings.tiers.ai = "openai"
    settings.providers.openai.apiKey = "sk-test"
    settings.mode = "translation-only"
    let prompt = DEFAULT_PROMPTS.translationOnly
    prompt = applyPreset(prompt, preset("dialect"), option(preset("dialect"), "yue-HK"))
    prompt = applyPreset(prompt, preset("keepTerms"))
    prompt = applyPreset(prompt, preset("explainTerms"))
    prompt = applyPreset(prompt, preset("style"), option(preset("style"), "plain"))
    settings.prompts.translationOnly = prompt
    const bodies: { messages: { role: string; content: unknown }[] }[] = []
    let call = 0
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return chatCompletion(content(++call))
    })
    const { service } = createService(settings, { fetchFn, llm: { batch: llmTranslateBatch, single: llmTranslateSingle, analyze: llmAnalyzeMail } })
    const translate = () =>
      Promise.all(
        ["We finished the due diligence.", "The term sheet is attached.", "Thanks!"].map((text) => service.translate({ text, targetLang: "zh-TW", providerId: "openai" })),
      )
    return { translate, bodies, fetchFn }
  }

  const outputs = ["我哋做完咗盡職調查（due diligence）。〔注：盡職調查：交易前對公司嘅全面檢查〕", "條款書（term sheet）喺附件度。", "多謝！"]

  it("sends the composed prompt once and maps a JSON array back onto the paragraphs, notes included", async () => {
    const { translate, bodies, fetchFn } = setup(() => JSON.stringify(outputs))
    expect(await translate()).toEqual(outputs)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const system = bodies[0].messages.find((m) => m.role === "system")!.content as string
    for (const id of ["dialect", "keepTerms", "explainTerms", "style"]) expect(system).toContain(preset(id).heading)
    expect(system).not.toContain("{{to}}")
    expect(system).toContain("explain each difficult word or technical term of that paragraph briefly in Traditional Chinese")
    expect(JSON.stringify(bodies[0].messages)).toContain("exactly 3 strings")
  })

  it("still reads numbered segments whose notes run over several lines", async () => {
    const numbered = `1. ${outputs[0].replace("〔", "\n〔")}\n2. ${outputs[1]}\n3. ${outputs[2]}`
    const { translate, fetchFn } = setup(() => numbered)
    const out = await translate()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(out[0]).toBe(outputs[0].replace("〔", "\n〔"))
    expect(out.slice(1)).toEqual(outputs.slice(1))
  })
})

describe("preset texts", () => {
  it("have a name, a description and an example for every preset and option, and unique ids", () => {
    const keys = PROMPT_PRESETS.flatMap((p) => [p.nameKey, p.hintKey, ...(p.options ? [] : [p.exampleKey]), ...(p.options ?? []).flatMap((o) => [o.nameKey, o.exampleKey ?? null])])
    for (const key of keys.filter((k) => k !== null)) expect(ENGLISH.t(key!), key).not.toBe(key)
    for (const p of PROMPT_PRESETS) {
      for (const o of p.options ?? []) expect(o.example ?? o.exampleKey, `${p.id}/${o.id}`).toBeTruthy()
      const ids = (p.options ?? []).map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(new Set(PROMPT_PRESETS.map((p) => p.heading)).size).toBe(PROMPT_PRESETS.length)
  })

  it("offer only target languages of the settings", () => {
    const codes = new Set(LANGUAGES.map((l) => l.code))
    for (const o of PROMPT_PRESETS.flatMap((p) => p.options ?? [])) for (const t of o.targets ?? []) expect(codes.has(t), t).toBe(true)
  })
})
