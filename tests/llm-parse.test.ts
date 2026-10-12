import { describe, expect, it } from "vitest"
import {
  buildAnalysisPrompt,
  buildBatchPrompt,
  buildContextBlock,
  buildSinglePrompt,
  buildSystemPrompt,
  cleanSingleOutput,
  parseAnalysis,
  parseBatchOutput,
  repairJsonStrings,
} from "../src/background/translators/llm-prompt"
import { modelRejectsTemperature } from "../src/shared/thinking"
import { DEFAULT_PROMPTS, PROMPT_KINDS } from "../src/shared/prompts"

describe("batch prompt", () => {
  it("numbers every segment and states the expected count", () => {
    const p = buildBatchPrompt([{ text: "Hello" }, { text: "Line one\nLine two" }], { target: "Simplified Chinese" })
    expect(p).toContain("exactly 2 strings")
    expect(p).toContain("Detect the source language of each of the following 2 segments and translate it into Simplified Chinese.")
    expect(p).toContain('<seg id="1">\nHello\n</seg>')
    expect(p).toContain('<seg id="2">\nLine one\nLine two\n</seg>')
  })

  it("names the source language when it is set", () => {
    expect(buildSinglePrompt({ text: "Hallo" }, { source: "German", target: "Japanese" })).toBe(
      "Translate the following text from German into Japanese. Output only the translation.\n\nHallo",
    )
    expect(buildBatchPrompt([{ text: "a" }, { text: "b" }], { source: "French", target: "English" })).toContain(
      "Translate each of the following 2 segments from French into English.",
    )
  })

  it("substitutes {{to}} in custom and default system prompts", () => {
    expect(buildSystemPrompt("Translate into {{to}}, formal tone.", "German")).toBe("Translate into German, formal tone.")
    for (const kind of PROMPT_KINDS) {
      const prompt = buildSystemPrompt(DEFAULT_PROMPTS[kind], "Japanese")
      expect(prompt).toContain("into Japanese")
      expect(prompt).not.toContain("{{to}}")
    }
  })
})

describe("parseBatchOutput", () => {
  it("rejects an empty translation, as the single-paragraph path does, unless its source has no letters or digits", () => {
    expect(parseBatchOutput('["", "B"]', 2)).toBeNull()
    expect(parseBatchOutput('["  ", "B"]', 2, ["Hello", "b"])).toBeNull()
    expect(parseBatchOutput('<seg id="1"></seg><seg id="2">B</seg>', 2, ["Hello", "b"])).toBeNull()
    expect(parseBatchOutput('["", "B"]', 2, ["— * —", "b"])).toEqual(["", "B"])
    expect(parseBatchOutput('["", "B"]', 2, ["   ", "b"])).toEqual(["", "B"])
  })

  it("parses a plain JSON array", () => {
    expect(parseBatchOutput('["你好", "再见"]', 2)).toEqual(["你好", "再见"])
  })

  it("parses JSON inside a Markdown fence and surrounding chatter", () => {
    const raw = 'Here you go:\n```json\n["一", "二", "三"]\n```\nHope this helps!'
    expect(parseBatchOutput(raw, 3)).toEqual(["一", "二", "三"])
  })

  it("strips <think> blocks from reasoning models", () => {
    expect(parseBatchOutput('<think>The user wants [x]…</think>\n["甲", "乙"]', 2)).toEqual(["甲", "乙"])
  })

  it("repairs raw newlines inside strings and trailing commas", () => {
    expect(repairJsonStrings('["a\nb"]')).toBe('["a\\nb"]')
    expect(parseBatchOutput('["第一行\n第二行", "二",]', 2)).toEqual(["第一行\n第二行", "二"])
  })

  it("accepts objects with ids, out of order", () => {
    const raw = '[{"id": 2, "translation": "二"}, {"id": 1, "translation": "一"}]'
    expect(parseBatchOutput(raw, 2)).toEqual(["一", "二"])
  })

  it("accepts a wrapping object or a keyed object", () => {
    expect(parseBatchOutput('{"translations": ["一", "二"]}', 2)).toEqual(["一", "二"])
    expect(parseBatchOutput('{"1": "一", "2": "二"}', 2)).toEqual(["一", "二"])
  })

  it("falls back to echoed <seg> blocks", () => {
    const raw = '<seg id="1">\n你好\n</seg>\n<seg id="2">\n世界\n</seg>'
    expect(parseBatchOutput(raw, 2)).toEqual(["你好", "世界"])
  })

  it("falls back to numbered lines", () => {
    expect(parseBatchOutput("1. 你好\n2. 世界\n继续第二段", 2)).toEqual(["你好", "世界\n继续第二段"])
    expect(parseBatchOutput("[1] 你好\n[2] 世界", 2)).toEqual(["你好", "世界"])
  })

  it("falls back to %% separators", () => {
    expect(parseBatchOutput("你好\n%%\n世界", 2)).toEqual(["你好", "世界"])
  })

  it("returns null when the count does not match", () => {
    expect(parseBatchOutput('["一", "二"]', 3)).toBeNull()
    expect(parseBatchOutput("1. 一\n2. 二", 3)).toBeNull()
  })

  it("returns null for unusable output", () => {
    expect(parseBatchOutput("", 2)).toBeNull()
    expect(parseBatchOutput("I cannot help with that.", 2)).toBeNull()
    expect(parseBatchOutput('["一", {"foo": 1}]', 2)).toBeNull()
    expect(parseBatchOutput("1. 一\n3. 三", 2)).toBeNull()
  })
})

describe("single output cleanup", () => {
  it("removes fences, think blocks and an echoed segment envelope", () => {
    expect(cleanSingleOutput("```\n你好\n```")).toBe("你好")
    expect(cleanSingleOutput("<think>hmm</think>你好")).toBe("你好")
    expect(cleanSingleOutput('<seg id="1">\n你好\n</seg>')).toBe("你好")
  })
})

describe("temperature support", () => {
  it("omits temperature for Claude models that reject it", () => {
    expect(modelRejectsTemperature("anthropic", "claude-haiku-5-5")).toBe(true)
    expect(modelRejectsTemperature("anthropic", "claude-opus-4-8")).toBe(true)
    expect(modelRejectsTemperature("anthropic", "claude-haiku-4-5")).toBe(false)
    expect(modelRejectsTemperature("openai", "gpt-4.1-mini")).toBe(false)
  })
})

describe("parsing details", () => {
  it("keeps escaped quotes and escapes raw tabs and carriage returns inside strings", () => {
    expect(repairJsonStrings('["say \\"hi\\"\tnow\r\nok"]')).toBe(String.raw`["say \"hi\"\tnow\r\nok"]`)
    expect(parseBatchOutput('["a \\"b\\"\n c", "d\te"]', 2)).toEqual(['a "b"\n c', "d\te"])
  })

  it("reads numbers and objects with a text field as translations", () => {
    expect(parseBatchOutput("[1, 2]", 2)).toEqual(["1", "2"])
    expect(parseBatchOutput('[{"content": "一"}, {"value": "二"}]', 2)).toEqual(["一", "二"])
    expect(parseBatchOutput('{"1": "一", "2": "二"}', 2)).toEqual(["一", "二"])
    expect(parseBatchOutput('{"1": "一"}', 2)).toBeNull()
  })

  it("keeps the order of the answer when ids are out of range", () => {
    expect(parseBatchOutput('[{"id": 5, "text": "一"}, {"id": 1, "text": "二"}]', 2)).toEqual(["一", "二"])
  })

  it("joins continuation lines of numbered answers and rejects chatter before the first number", () => {
    expect(parseBatchOutput("1. 一\n续\n2. 二", 2)).toEqual(["一\n续", "二"])
    expect(parseBatchOutput("Here you go:\n1. 一\n2. 二", 2)).toBeNull()
  })
})

describe("mail analysis", () => {
  it("reads the analysis from fenced or wrapped JSON and drops incomplete glossary entries", () => {
    const raw = 'Sure!\n```json\n{"summary": " A request. ", "tone": "formal", "glossary": [{"source": "Acme", "target": "艾克米"}, {"source": "x"}, null]}\n```'
    expect(parseAnalysis(raw)).toEqual({ summary: "A request.", tone: "formal", glossary: [{ source: "Acme", target: "艾克米" }] })
    expect(parseAnalysis('Result: {"tone": "casual"} done')).toEqual({ summary: "", tone: "casual", glossary: [] })
  })

  it("returns null for answers without content", () => {
    for (const raw of ["", "no json here", "[1, 2]", '{"summary": "", "glossary": []}', "{broken"]) expect(parseAnalysis(raw), raw).toBeNull()
  })

  it("builds no context block from nothing, and the analysis prompt around the text", () => {
    expect(buildContextBlock(null, "")).toBe("")
    const block = buildContextBlock({ summary: "", tone: "Friendly", glossary: [] }, "Hi")
    expect(block).toContain("Tone and form of address: Friendly")
    expect(block).toContain("<email>\nHi\n</email>")
    expect(buildAnalysisPrompt("Hi")).toBe("<email>\nHi\n</email>")
  })
})
