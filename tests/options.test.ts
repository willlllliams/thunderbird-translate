// @vitest-environment jsdom
/** Settings page: general, batching, style and cache fields, the service panel of each kind, and the interface language. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readLocaleSources } from "../scripts/locales.mjs"
import { describeError } from "../src/shared/errors"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest } from "../src/shared/messages"
import { createDefaultSettings, type Settings } from "../src/shared/settings"
import { flushSave } from "./fixtures/pages"
import { openPage, useFakeTimers } from "./helpers"

// Fake timers in every test: a page left open by a test cannot fire its timers into the next one.
beforeEach(() => useFakeTimers())

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const set = (id: string, value: string, type: "change" | "input" = "change") => {
  const el = $<HTMLInputElement>(id)
  el.value = value
  el.dispatchEvent(new Event(type))
}
const fire = (el: HTMLInputElement, value: string, type: "change" | "input" = "input") => {
  el.value = value
  el.dispatchEvent(new Event(type))
}

async function options(change: (s: Settings) => void = () => {}, opts: Parameters<typeof openPage>[2] = {}) {
  const s = createDefaultSettings("en")
  change(s)
  const page = await openPage("options", s, opts)
  await vi.waitFor(() => expect(document.querySelector("#providerPanel h3")).not.toBeNull())
  return page
}

describe("general settings", () => {
  it("saves source language, display mode and automatic translation, and warns about equal languages", async () => {
    const page = await options()
    set("sourceLang", "en")
    expect($("sameLanguage").hidden).toBe(false)
    set("mode", "translation-only")
    $<HTMLInputElement>("autoTranslate").click()
    await flushSave()
    expect(page.stored()).toMatchObject({ sourceLang: "en", mode: "translation-only", autoTranslate: true })
    set("sourceLang", "auto")
    expect($("sameLanguage").hidden).toBe(true)
  })

  it("shows the saved note for a moment, and a failed save until a save succeeds", async () => {
    const page = await options()
    const note = () => [$("saved").classList.contains("show"), $("saved").classList.contains("error")]
    $<HTMLInputElement>("autoTranslate").click()
    await flushSave()
    expect(note()).toEqual([true, false])
    await vi.advanceTimersByTimeAsync(1200)
    expect(note()).toEqual([false, false])
    // A save fails while the note of the save before is still shown: the failure stays.
    $<HTMLInputElement>("autoTranslate").click()
    await flushSave()
    page.browser.local.failWrites()
    $<HTMLInputElement>("autoTranslate").click()
    await flushSave()
    await vi.advanceTimersByTimeAsync(1200)
    expect(note()).toEqual([true, true])
  })

  it("switches the interface language at once and saves it", async () => {
    const fr = readLocaleSources().fr
    const page = await options()
    expect($<HTMLSelectElement>("uiLanguage").options[0].textContent).toBe(ENGLISH.t("uiLanguageAuto", ["English"]))
    set("uiLanguage", "fr")
    await vi.waitFor(() => expect(document.documentElement.lang).toBe("fr"))
    expect(document.querySelector("h1")!.textContent).toBe(fr.optionsTitle)
    expect($("tierLabel-machine").textContent).toContain(fr.tierMachine)
    await flushSave()
    expect(page.stored().uiLanguage).toBe("fr")
    expect($<HTMLSelectElement>("uiLanguage").value).toBe("fr")
  })

  it("follows an interface language chosen in another page", async () => {
    const ja = readLocaleSources().ja
    const page = await options()
    page.external((s) => (s.uiLanguage = "ja"))
    await vi.waitFor(() => expect(document.documentElement.lang).toBe("ja"))
    expect(document.querySelector("h1")!.textContent).toBe(ja.optionsTitle)
  })

  it("enables precise translation only with an AI tier", async () => {
    const page = await options()
    expect($<HTMLInputElement>("preciseEnabled").disabled).toBe(true)
    // The popup chooses an AI service.
    page.external((s) => (s.tiers.ai = "openai"))
    expect($<HTMLInputElement>("preciseEnabled").disabled).toBe(false)
    expect($<HTMLSelectElement>("tier-ai").value).toBe("openai")
    $<HTMLInputElement>("preciseEnabled").click()
    await flushSave()
    expect(page.stored().precise.enabled).toBe(true)
  })

  it("shows that the settings were saved", async () => {
    await options()
    $<HTMLInputElement>("autoTranslate").click()
    await vi.waitFor(() => expect($("saved").classList.contains("show")).toBe(true))
  })

  it("scrolls to the section named in the address, e.g. #providers from the popup", async () => {
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    history.replaceState(null, "", "#providers")
    try {
      await options()
      expect(scrolled).toEqual(["providers"])
    } finally {
      history.replaceState(null, "", "#")
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })
})

describe("batching, style and cache", () => {
  it.each([
    ["batchDelayMs", "batch", "120", 120],
    ["batchDelayMs", "batch", "-5", 0],
    ["maxCharsPerBatch", "batch", "100", 200],
    ["maxCharsPerBatch", "batch", "90000", 50000],
    ["maxItemsPerBatch", "batch", "0", 1],
    ["concurrency", "batch", "64", 20],
    ["maxRetries", "batch", "2", 2],
    ["cacheMax", "cache", "250000", 100000],
  ])("%s %s → %s", async (id, group, value, expected) => {
    const page = await options()
    set(id, value)
    expect($<HTMLInputElement>(id).value).toBe(String(expected))
    const key = id === "cacheMax" ? "maxEntries" : id
    await flushSave()
    expect((page.stored()[group as "batch"] as unknown as Record<string, number>)[key]).toBe(expected)
  })

  it.each(["batchDelayMs", "maxCharsPerBatch", "concurrency", "cacheMax"])("%s: an empty or invalid entry keeps the value", async (id) => {
    const page = await options()
    const before = $<HTMLInputElement>(id).value
    set(id, "")
    expect($<HTMLInputElement>(id).value).toBe(before)
    set(id, "lots")
    expect($<HTMLInputElement>(id).value).toBe(before)
    await flushSave()
    // The page saved after the delay, with the value as it was.
    expect(page.browser.local.set).toHaveBeenCalledTimes(1)
    expect(page.stored()).toEqual(createDefaultSettings("en"))
  })

  it("saves the switches of batching and cache", async () => {
    const page = await options()
    $<HTMLInputElement>("llmBatchEnabled").click()
    $<HTMLInputElement>("cacheEnabled").click()
    await flushSave()
    expect([page.stored().batch.llmBatchEnabled, page.stored().cache.enabled]).toEqual([false, false])
  })

  it("previews and saves the translation style", async () => {
    const page = await options()
    const preview = $("preview")
    expect(preview.style.getPropertyValue("--tt-color")).toBe("#4c8bf5")
    set("stylePreset", "highlight")
    expect($("previewTranslation").className).toBe("tt-translation tt-bilingual tt-flow tt-style-highlight")
    set("styleColor", "#ff0000", "input")
    set("styleOpacity", "0.5", "input")
    set("styleFontScale", "1.2", "input")
    expect(preview.style.getPropertyValue("--tt-color")).toBe("#ff0000")
    expect(preview.style.getPropertyValue("--tt-opacity")).toBe("0.5")
    expect(preview.style.getPropertyValue("--tt-scale")).toBe("1.2")
    await flushSave()
    expect(page.stored().style).toEqual({ preset: "highlight", color: "#ff0000", textColor: "", opacity: 0.5, fontScale: 1.2 })
  })

  it("sets the text colour of the translations and restores the colour of the message", async () => {
    const page = await options()
    const preview = $("preview")
    const reset = $<HTMLButtonElement>("styleTextColorReset")
    // By default the translation has the colour of the message text; the field shows the colour of the page text.
    expect(preview.style.getPropertyValue("--tt-text-color")).toBe("")
    expect($<HTMLInputElement>("styleTextColor").value).toBe("#000000")
    expect([reset.disabled, $("styleTextColorAuto").hidden, $("styleTextColorAuto").textContent]).toEqual([true, false, ENGLISH.t("textColorAuto")])
    expect(document.querySelector('label:has(#styleTextColor) > span')!.textContent).toBe(ENGLISH.t("labelTextColor"))

    set("styleTextColor", "#202124", "input")
    expect(preview.style.getPropertyValue("--tt-text-color")).toBe("#202124")
    expect([reset.disabled, $("styleTextColorAuto").hidden]).toEqual([false, true])
    await flushSave()
    expect(page.stored().style.textColor).toBe("#202124")

    reset.click()
    expect(preview.style.getPropertyValue("--tt-text-color")).toBe("")
    expect([reset.disabled, $("styleTextColorAuto").hidden]).toEqual([true, false])
    await flushSave()
    expect(page.stored().style.textColor).toBe("")

    // Set in another page.
    page.external((s) => (s.style = { ...s.style, textColor: "#336699" }))
    expect($<HTMLInputElement>("styleTextColor").value).toBe("#336699")
    expect(reset.disabled).toBe(false)
  })

  it("leaves the field that has the focus alone and ignores other storage areas", async () => {
    const page = await options()
    $("targetLang").focus()
    page.external((s) => {
      s.targetLang = "ko"
      s.mode = "translation-only"
    })
    expect($<HTMLSelectElement>("targetLang").value).toBe("en")
    expect($<HTMLSelectElement>("mode").value).toBe("translation-only")
    page.emitChange({ settings: { newValue: { ...createDefaultSettings("en"), autoTranslate: true } } }, "sync")
    page.emitChange({ welcome: { newValue: { step: "ai" } } }, "local")
    expect($<HTMLInputElement>("autoTranslate").checked).toBe(false)
  })

  it("shows a style changed in another page", async () => {
    const page = await options()
    page.external((s) => (s.style = { ...s.style, preset: "dashed", color: "#00ff00" }))
    expect($<HTMLSelectElement>("stylePreset").value).toBe("dashed")
    expect($("previewTranslation").classList.contains("tt-style-dashed")).toBe(true)
    expect($("preview").style.getPropertyValue("--tt-color")).toBe("#00ff00")
  })

  it("shows the number of cached translations and clears the cache", async () => {
    let size = 1234
    const requests: BackgroundRequest[] = []
    await options(undefined, {
      respond: (req) => {
        requests.push(req)
        if (req.type === "clearCache") size = 0
        return req.type === "cacheStats" ? { size } : undefined
      },
    })
    await vi.waitFor(() => expect($("cacheCount").textContent).toBe(ENGLISH.t("cacheCount", [1234])))
    $("clearCache").click()
    await vi.waitFor(() => expect($("cacheCount").textContent).toBe(`${ENGLISH.t("cacheCount", [0])} · ${ENGLISH.t("cacheCleared")}`))
    expect(requests.map((r) => r.type)).toContain("clearCache")
  })

  it("counts 0 when the background script does not answer", async () => {
    await options(undefined, { respond: () => null })
    await vi.waitFor(() => expect($("cacheCount").textContent).toBe(ENGLISH.t("cacheCount", [0])))
  })
})

describe("service panel", () => {
  const pick = (name: string) => Array.from(document.querySelectorAll<HTMLLIElement>("#providerList li")).find((li) => li.firstChild?.textContent === name)!.click()
  const panel = () => $("providerPanel")
  const inputs = () => Array.from(panel().querySelectorAll<HTMLInputElement>("input"))
  const input = (type: string, n = 0) => inputs().filter((i) => i.type === type)[n]
  const button = (text: string) => Array.from(panel().querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === text)!

  it.each([
    ["Google Translate (free)", "hintFree"],
    ["Bergamot (offline)", "hintBergamot"],
    ["Azure OpenAI", "hintAzure"],
    ["Ollama (local)", "hintOllama"],
    ["DeepLX", "hintDeeplx"],
  ] as const)("%s explains its configuration", async (name, hint) => {
    await options()
    pick(name)
    expect(panel().textContent).toContain(ENGLISH.t(hint))
  })

  it("switches the Microsoft mode only on the radio button that becomes checked", async () => {
    const page = await options()
    pick("Microsoft Translator (free)")
    const key = panel().querySelector<HTMLInputElement>('input[name="microsoftMode"][value="key"]')!
    key.dispatchEvent(new Event("change"))
    expect(panel().querySelector<HTMLElement>(".azure-fields")!.hidden).toBe(true)
    await flushSave()
    expect(page.browser.local.set).not.toHaveBeenCalled()
    expect(page.stored().providers["microsoft-free"].mode).toBeUndefined()
  })

  it("shows and hides the key", async () => {
    await options()
    pick("OpenAI")
    const key = input("password")
    button(ENGLISH.t("buttonShowKey")).click()
    expect(key.type).toBe("text")
    button(ENGLISH.t("buttonHideKey")).click()
    expect(key.type).toBe("password")
  })

  it("warns about a malformed endpoint or a website, and restores the default endpoint", async () => {
    const page = await options()
    pick("OpenAI")
    const endpoint = input("text")
    const warning = panel().querySelector<HTMLElement>(".field-warning")!
    expect(warning.hidden).toBe(true)
    fire(endpoint, "api.openai.com/v1")
    fire(endpoint, "api.openai.com/v1", "change")
    expect(warning.textContent).toContain(ENGLISH.t("warnBaseUrlInvalid"))
    fire(endpoint, " https://platform.openai.com/ ")
    fire(endpoint, endpoint.value, "change")
    expect(warning.textContent).toContain(ENGLISH.t("hintWebHost", ["platform.openai.com"]))
    expect(warning.textContent).toContain(ENGLISH.t("warnBaseUrlDefault", ["https://api.openai.com/v1"]))
    await flushSave()
    expect(page.stored().providers.openai.baseURL).toBe("https://platform.openai.com/")
    button(ENGLISH.t("buttonRestoreBaseUrl")).click()
    expect(endpoint.value).toBe("")
    expect(warning.hidden).toBe(true)
    await flushSave()
    expect(page.stored().providers.openai.baseURL).toBe("")
  })

  it("offers no default endpoint for a service without one", async () => {
    await options()
    pick("DeepLX")
    fire(input("text"), "deeplx", "change")
    const warning = panel().querySelector<HTMLElement>(".field-warning")!
    expect(warning.textContent).toBe(ENGLISH.t("warnBaseUrlInvalid"))
    expect(warning.querySelector("button")).toBeNull()
  })

  it("adds DeepLX when its endpoint is typed", async () => {
    const page = await options()
    pick("DeepLX")
    expect(button(ENGLISH.t("buttonAddProvider"))).toBeDefined()
    fire(input("text"), "https://deeplx.example.com/translate")
    expect(button(ENGLISH.t("buttonUse"))).toBeDefined()
    expect(Array.from($<HTMLSelectElement>("tier-machine").options).map((o) => o.value)).toContain("deeplx")
    await flushSave()
    expect(page.stored().providers.deeplx).toMatchObject({ enabled: true, baseURL: "https://deeplx.example.com/translate" })
  })

  it("saves model, temperature and thinking mode of an AI service", async () => {
    const page = await options((s) => (s.providers.openai.enabled = true))
    pick("OpenAI")
    const [, model] = inputs().filter((i) => i.type === "text")
    expect(model.placeholder).toBe("gpt-4.1-mini")
    expect(panel().querySelectorAll("datalist option").length).toBeGreaterThan(1)
    const temperature = input("number")
    expect(temperature.value).toBe("0.3")
    fire(model, " gpt-4.1 ")
    fire(temperature, "5")
    input("checkbox").click()
    await flushSave()
    expect(page.stored().providers.openai).toMatchObject({ model: "gpt-4.1", temperature: 2, thinking: true })
    fire(temperature, "")
    await flushSave()
    expect(page.stored().providers.openai.temperature).toBeNull()
  })

  it("shows an empty temperature field for a service that sends none", async () => {
    await options((s) => (s.providers.anthropic = { enabled: true, apiKey: "k", baseURL: "", model: "", temperature: null }))
    pick("Anthropic Claude")
    expect(input("number").value).toBe("")
  })

  it("disables Use this service for the service of its tier", async () => {
    const page = await options()
    pick("Microsoft Translator (free)")
    button(ENGLISH.t("buttonUse")).click()
    expect(button(ENGLISH.t("buttonUse")).disabled).toBe(true)
    await flushSave()
    expect(page.stored().tiers.machine).toBe("microsoft-free")
  })

  describe("connection test", () => {
    const run = async (respond: (req: BackgroundRequest) => unknown) => {
      await options((s) => (s.providers.openai = { enabled: true, apiKey: "sk-unsaved", baseURL: "", model: "" }), { respond })
      pick("OpenAI")
      const test = button(ENGLISH.t("buttonTest"))
      test.click()
      expect(test.disabled).toBe(true)
      expect(panel().querySelector(".test-result")!.textContent).toBe(ENGLISH.t("testRunning"))
      await vi.waitFor(() => expect(test.disabled).toBe(false))
      return panel().querySelector<HTMLElement>(".test-result")!
    }

    it("shows the sample translation", async () => {
      const box = await run((req) => (req.type === "testProvider" ? { ok: true, text: "Bonjour" } : undefined))
      expect(box.className).toBe("test-result ok")
      expect(box.textContent).toBe(ENGLISH.t("testOk", ["Bonjour"]))
    })

    it("shows a failure on several lines", async () => {
      const box = await run((req) => (req.type === "testProvider" ? { ok: false, error: "HTTP 401 Unauthorized\n\nInvalid key\nCheck the key." } : undefined))
      expect(box.className).toBe("test-result fail")
      expect(Array.from(box.children).map((el) => [el.className, el.textContent])).toEqual([
        ["test-title", ENGLISH.t("testFailed")],
        ["test-reason", "HTTP 401 Unauthorized"],
        ["test-line", "Invalid key"],
        ["test-line", "Check the key."],
      ])
    })

    it("describes a failure without a description and a failed request", async () => {
      const empty = await run((req) => (req.type === "testProvider" ? { ok: false, error: " " } : undefined))
      expect(empty.querySelector(".test-reason")!.textContent).toBe(describeError(undefined, ENGLISH))
      vi.resetModules()
      const thrown = await run((req) => {
        if (req.type === "testProvider") throw new Error("Could not establish connection. Receiving end does not exist.")
        return undefined
      })
      expect(thrown.querySelector(".test-reason")!.textContent).toBe("Could not establish connection. Receiving end does not exist.")
    })
  })
})
