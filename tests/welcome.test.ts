// @vitest-environment jsdom
/** Welcome page: opening after installation, steps and navigation, saving, offline downloads, prompts and the trial. */
import { IDBFactory } from "fake-indexeddb"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest, PortReport } from "../src/shared/messages"
import { getPromptPreset, NO_PRESET, presetBlock, removePresets } from "../src/shared/prompt-presets"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"
import { createDefaultSettings, type Settings, toPublicSettings } from "../src/shared/settings"
import { neighbourStep, resumeStep, stepNeeded, trialLanguage, WELCOME_KEY } from "../src/welcome/steps"
import { readLocaleSources } from "../scripts/locales.mjs"
import { pagePort, stubBrowser } from "./fixtures/browser"
import { jsonResponse, openPage } from "./helpers"

afterEach(() => {
  vi.resetModules()
})

const tiers = (t: Partial<Settings["tiers"]>) => ({ tiers: { dictionary: null, machine: null, ai: null, ...t } })

describe("installation", () => {
  async function stubTabs() {
    const { api } = stubBrowser()
    vi.resetModules()
    const { openWelcomeOnInstall } = await import("../src/background/welcome")
    return { create: api.tabs.create, openWelcomeOnInstall }
  }

  it("opens the welcome page after a new installation", async () => {
    const { create, openWelcomeOnInstall } = await stubTabs()
    await openWelcomeOnInstall({ reason: "install" })
    expect(create).toHaveBeenCalledWith({ url: "moz-extension://test/welcome.html" })
  })

  it("is registered by the background script", async () => {
    const { api, events } = stubBrowser({ uiLanguage: "en" })
    const { listeners } = events.installed
    vi.resetModules()
    await import("../src/background/index")
    expect(listeners).toHaveLength(1)
    listeners[0]({ reason: "update" })
    expect(api.tabs.create).not.toHaveBeenCalled()
    listeners[0]({ reason: "install" })
    expect(api.tabs.create).toHaveBeenCalledWith({ url: "moz-extension://test/welcome.html" })
  })

  it("does not open it after an update of the extension or of Thunderbird", async () => {
    const { create, openWelcomeOnInstall } = await stubTabs()
    for (const reason of ["update", "browser_update", "shared_module_update"]) await openWelcomeOnInstall({ reason })
    expect(create).not.toHaveBeenCalled()
  })
})

describe("steps", () => {
  it("needs the offline step only with an offline service, the online step only with an online translator, AI and prompts only with the AI tier", () => {
    expect(stepNeeded("offline", tiers({ machine: "google-free" }))).toBe(false)
    expect(stepNeeded("offline", tiers({ dictionary: "dictionary" }))).toBe(true)
    expect(stepNeeded("offline", tiers({ machine: "bergamot" }))).toBe(true)
    expect(stepNeeded("machine", tiers({ machine: "bergamot" }))).toBe(false)
    expect(stepNeeded("machine", tiers({ machine: "deeplx" }))).toBe(true)
    expect(stepNeeded("ai", tiers({ machine: "google-free" }))).toBe(false)
    expect(stepNeeded("prompts", tiers({ ai: "openai" }))).toBe(true)
    expect(stepNeeded("finish", tiers({}))).toBe(true)
  })

  it("passes over the steps that are not needed", () => {
    const s = tiers({ machine: "google-free" })
    expect(neighbourStep("tiers", s, 1)).toBe("machine")
    expect(neighbourStep("machine", s, 1)).toBe("finish")
    expect(neighbourStep("finish", s, 1)).toBeNull()
    expect(neighbourStep("finish", s, -1)).toBe("machine")
    expect(neighbourStep("language", s, -1)).toBeNull()
  })

  it("resumes at the stored step, at the next needed one when it is no longer needed, and from the start after finishing", () => {
    const s = tiers({ machine: "google-free" })
    expect(resumeStep(undefined, s)).toBe("language")
    expect(resumeStep({ step: "display" }, s)).toBe("display")
    expect(resumeStep({ step: "ai" }, s)).toBe("finish")
    expect(resumeStep({ step: "offline" }, s)).toBe("machine")
    expect(resumeStep({ step: "tiers", finished: true }, s)).toBe("language")
    expect(resumeStep({ step: "nonsense" }, s)).toBe("language")
  })

  it("writes the trial message in English, or in German into English", () => {
    expect(trialLanguage({ sourceLang: "auto", targetLang: "zh-CN" })).toBe("en")
    expect(trialLanguage({ sourceLang: "auto", targetLang: "en" })).toBe("de")
    expect(trialLanguage({ sourceLang: "de", targetLang: "fr" })).toBe("de")
  })
})


describe("welcome page", () => {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
  const current = () => document.querySelector<HTMLElement>("section.step:not([hidden])")?.dataset.step
  const stepButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>("#stepList button"))
  const choose = (id: string, value: string) => {
    const el = $<HTMLSelectElement>(id)
    el.value = value
    el.dispatchEvent(new Event("change"))
  }
  const ready = () => vi.waitFor(() => expect(current()).toBeDefined())

  function settings(change: (s: Settings) => void = () => {}): Settings {
    const s = createDefaultSettings("en")
    s.targetLang = "zh-CN"
    change(s)
    return s
  }

  it("starts at the first step, marks the steps the choices do not need, and moves with Next, Skip and Back", async () => {
    await openPage("welcome", settings())
    await ready()
    expect(current()).toBe("language")
    expect(document.documentElement.lang).toBe("en")
    const skipped = stepButtons().filter((b) => b.disabled).map((b) => b.textContent)
    expect(skipped).toEqual([`4. ${ENGLISH.t("stepOffline")}`, `6. ${ENGLISH.t("stepAi")}`, `7. ${ENGLISH.t("stepPrompts")}`])
    expect($<HTMLButtonElement>("prevStep").disabled).toBe(true)

    $("nextStep").click()
    await vi.waitFor(() => expect(current()).toBe("display"))
    $("skipStep").click()
    await vi.waitFor(() => expect(current()).toBe("tiers"))
    $("nextStep").click()
    await vi.waitFor(() => expect(current()).toBe("machine"))
    $("nextStep").click()
    await vi.waitFor(() => expect(current()).toBe("finish"))
    expect($("nextStep").textContent).toBe(ENGLISH.t("buttonFinish"))
    expect($("skipStep").hidden).toBe(true)
    $("prevStep").click()
    await vi.waitFor(() => expect(current()).toBe("machine"))
    expect($("progressBar").style.width).toBe("80%")
  })

  it("saves every choice as it is made and remembers the step", async () => {
    const page = await openPage("welcome", settings())
    await ready()
    choose("targetLang", "ja")
    choose("sourceLang", "de")
    await vi.waitFor(() => expect(page.stored()).toMatchObject({ targetLang: "ja", sourceLang: "de" }))

    stepButtons()[1].click()
    await vi.waitFor(() => expect(page.local(WELCOME_KEY)).toEqual({ step: "display" }))
    const only = document.querySelector<HTMLInputElement>('input[name="mode"][value="translation-only"]')!
    only.checked = true
    only.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(page.stored().mode).toBe("translation-only"))
    // The preview is drawn by the content script's renderer in the chosen mode.
    expect(document.querySelectorAll("#modePreview .tt-translation.tt-only")).toHaveLength(2)

    stepButtons()[2].click()
    choose("tier-ai", "deepseek")
    choose("tier-dictionary", "dictionary")
    await vi.waitFor(() => expect(page.stored().tiers).toEqual({ dictionary: "dictionary", machine: "google-free", ai: "deepseek" }))
    expect(page.stored().providers.deepseek.enabled).toBe(true)
    expect(stepButtons().filter((b) => b.disabled)).toHaveLength(0)

    // Every tier "Not used" is refused.
    choose("tier-dictionary", "")
    choose("tier-machine", "")
    choose("tier-ai", "")
    expect($<HTMLSelectElement>("tier-ai").value).toBe("deepseek")
    expect($("tiersEmpty").hidden).toBe(false)
  })

  it("goes on after a failed save: shows the failure, moves to the next step and saves with the next change", async () => {
    const page = await openPage("welcome", settings())
    await ready()
    const local = (globalThis as unknown as { browser: { storage: { local: { set: (v: Record<string, unknown>) => Promise<void> } } } }).browser.storage.local
    const write = local.set
    let refuse = true
    local.set = async (v) => {
      if ("settings" in v && refuse) throw new Error("quota exceeded")
      return write(v)
    }
    choose("targetLang", "ja")
    await vi.waitFor(() => expect($("saved").textContent).toBe(ENGLISH.t("errSaveFailed", ["quota exceeded"])))
    expect($("saved").classList.contains("error")).toBe(true)
    // The failed save does not hold up the guide.
    $("nextStep").click()
    await vi.waitFor(() => expect(current()).toBe("display"))
    refuse = false
    const only = document.querySelector<HTMLInputElement>('input[name="mode"][value="translation-only"]')!
    only.checked = true
    only.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(page.stored()).toMatchObject({ targetLang: "ja", mode: "translation-only" }))
    expect($("saved").textContent).toBe(ENGLISH.t("saved"))
    expect($("saved").classList.contains("error")).toBe(false)
  })

  it("continues at the stored step and saves it when the user leaves", async () => {
    const page = await openPage("welcome", settings(), { stored: { [WELCOME_KEY]: { step: "tiers" } } })
    await vi.waitFor(() => expect(current()).toBe("tiers"))
    $("exitGuide").click()
    await vi.waitFor(() => expect(page.removed).toEqual([7]))
    expect(page.local(WELCOME_KEY)).toEqual({ step: "tiers" })
  })

  it("M3: stays open with the failure on screen when the settings cannot be saved on leaving or finishing", async () => {
    const page = await openPage("welcome", settings(), { stored: { [WELCOME_KEY]: { step: "finish" } } })
    await vi.waitFor(() => expect(current()).toBe("finish"))
    const local = (globalThis as unknown as { browser: { storage: { local: { set: (v: Record<string, unknown>) => Promise<void> } } } }).browser.storage.local
    const write = local.set
    let refuse = true
    local.set = async (v) => {
      if ("settings" in v && refuse) throw new Error("quota exceeded")
      return write(v)
    }
    $<HTMLInputElement>("autoTranslate").click()
    for (const button of ["exitGuide", "nextStep"]) {
      $(button).click()
      await vi.waitFor(() => expect($("saved").textContent).toBe(ENGLISH.t("errSaveFailed", ["quota exceeded"])))
      await new Promise((r) => setTimeout(r, 20))
      expect(page.removed).toEqual([])
      $("saved").textContent = ""
    }
    refuse = false
    $("nextStep").click()
    await vi.waitFor(() => expect(page.removed).toEqual([7]))
    expect(page.stored().autoTranslate).toBe(true)
    expect(page.local(WELCOME_KEY)).toEqual({ step: "finish", finished: true })
  })

  it("marks the guide as finished on the last step", async () => {
    const page = await openPage("welcome", settings(), { stored: { [WELCOME_KEY]: { step: "finish" } } })
    await vi.waitFor(() => expect(current()).toBe("finish"))
    $("nextStep").click()
    await vi.waitFor(() => expect(page.removed).toEqual([7]))
    expect(page.local(WELCOME_KEY)).toEqual({ step: "finish", finished: true })
  })

  it("configures the AI service of the tier with the shared service fields and connection test", async () => {
    const page = await openPage("welcome", settings((s) => (s.tiers.ai = "openai")), {
      stored: { [WELCOME_KEY]: { step: "ai" } },
      respond: (req) => (req.type === "testProvider" ? { ok: true, text: "你好" } : undefined),
    })
    await vi.waitFor(() => expect(current()).toBe("ai"))
    expect($<HTMLSelectElement>("aiService").value).toBe("openai")
    choose("aiService", "deepseek")
    const key = document.querySelector<HTMLInputElement>('#aiPanel input[type="password"]')!
    key.value = "sk-test"
    key.dispatchEvent(new Event("input"))
    await vi.waitFor(() => expect(page.stored().tiers.ai).toBe("deepseek"))
    await vi.waitFor(() => expect(page.stored().providers.deepseek.apiKey).toBe("sk-test"))
    Array.from(document.querySelectorAll<HTMLButtonElement>("#aiPanel button")).find((b) => b.textContent === ENGLISH.t("buttonTest"))!.click()
    await vi.waitFor(() => expect(document.querySelector("#aiPanel .test-result.ok")?.textContent).toBe(ENGLISH.t("testOk", ["你好"])))
    expect(page.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "testProvider", providerId: "deepseek" }))
    $<HTMLInputElement>("preciseEnabled").click()
    await vi.waitFor(() => expect(page.stored().precise.enabled).toBe(true))
  })

  it("shows the online translator's fields only for the service of the machine tier", async () => {
    await openPage("welcome", settings((s) => (s.tiers.machine = "microsoft-free")), { stored: { [WELCOME_KEY]: { step: "machine" } } })
    await vi.waitFor(() => expect(current()).toBe("machine"))
    expect(document.querySelector("#machinePanel h3")!.textContent).toBe("Microsoft Translator (free)")
    expect(document.querySelectorAll('#machinePanel input[name="microsoftMode"]')).toHaveLength(2)
  })

  /** Release index and Bergamot list of the offline step: `installed` Bergamot pairs; records the requests and fetched URLs. */
  function offlineServices(installed: string[] = []) {
    const pack = (src: string, tgt: string) => ({
      src,
      tgt,
      file: `dict-${src}-${tgt}.tsv.gz`,
      bytes: 1048576,
      rawBytes: 1,
      entries: 1000,
      forms: 0,
      sha256: "00".repeat(32),
      source: "Wiktionary",
      license: "CC BY-SA 4.0",
      attribution: `Wiktionary ${src}-${tgt}`,
    })
    const index = { version: 1, packs: [pack("ja", "en"), pack("en", "zh-Hans"), pack("zh-Hans", "en"), pack("fr", "en"), pack("en", "de")] }
    const urls: string[] = []
    const requests: BackgroundRequest[] = []
    const waiting: (() => void)[] = []
    const respond = (req: BackgroundRequest) => {
      requests.push(req)
      switch (req.type) {
        case "bergamotList": {
          const pair = (src: string, tgt: string) => ({ src, tgt, version: "1", architecture: "base", bytes: 30e6, rawBytes: 1, installed: installed.includes(`${src}>${tgt}`) })
          return { ok: true, pairs: [pair("ja", "en"), pair("en", "zh-Hans"), pair("zh-Hans", "en"), pair("fr", "en"), pair("en", "fr")] }
        }
        case "bergamotInstall":
          return new Promise((resolve) => waiting.push(() => resolve({ ok: true })))
        case "bergamotProgress":
          return {}
      }
      return undefined
    }
    const fetchUrl = async (url: string) => {
      urls.push(url)
      return url.endsWith("dict-index.json") ? jsonResponse(index) : new Response("missing", { status: 404 })
    }
    return { urls, requests, respond, fetchUrl, finish: () => waiting.splice(0).forEach((done) => done()) }
  }

  it("with automatic detection lists everything, the recommended languages first and ticked, and reports the download", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const services = offlineServices()
    const s = settings((s) => (s.tiers = { dictionary: "dictionary", machine: "bergamot", ai: null }))
    await openPage("welcome", s, { stored: { [WELCOME_KEY]: { step: "offline" } }, respond: services.respond, fetchUrl: services.fetchUrl, systemLanguages: ["fr-FR"] })
    const names = (list: string) => Array.from(document.querySelectorAll(`#${list} .dict-name`)).map((el) => el.textContent)
    const ticked = (list: string) => Array.from(document.querySelectorAll<HTMLInputElement>(`#${list} input[type=checkbox]`)).filter((b) => b.checked).length
    await vi.waitFor(() => expect(names("dictList")).toHaveLength(5))
    await vi.waitFor(() => expect(names("bergamotList")).toHaveLength(5))
    expect($("offlineAutoHint").hidden).toBe(false)
    // Target language (Simplified Chinese), then the system's French; Japanese and German are not recommended.
    expect(names("dictList")).toEqual(["English → Simplified Chinese (简体中文)", "Simplified Chinese (简体中文) → English", "French (Français) → English", "English → German (Deutsch)", "Japanese (日本語) → English"])
    expect(ticked("dictList")).toBe(3)
    expect(ticked("bergamotList")).toBe(4)
    expect($<HTMLButtonElement>("downloadPicked").disabled).toBe(false)
    expect($("downloadStatus").textContent).toBe("")

    $("downloadPicked").click()
    expect($<HTMLButtonElement>("downloadPicked").disabled).toBe(true)
    expect($("downloadStatus").textContent).toBe(ENGLISH.t("downloadRunning", [7]))
    // The packs fail (the server has no files), the models are installed once the background script answers.
    await vi.waitFor(() => expect(services.urls.filter((u) => u.endsWith(".tsv.gz"))).toHaveLength(3))
    // The models are downloaded two at a time.
    await vi.waitFor(() => {
      services.finish()
      expect($("downloadStatus").textContent).toBe(ENGLISH.t("downloadFailed", [3]))
    })
    expect(services.requests.filter((r) => r.type === "bergamotInstall")).toHaveLength(4)
  })

  it("says that nothing is ticked and keeps Download selected disabled until something is", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const services = offlineServices(["en>zh-Hans"])
    const s = settings((s) => {
      s.sourceLang = "fr"
      s.tiers = { dictionary: null, machine: "bergamot", ai: null }
    })
    await openPage("welcome", s, { stored: { [WELCOME_KEY]: { step: "offline" } }, respond: services.respond, fetchUrl: services.fetchUrl })
    await vi.waitFor(() => expect(document.querySelectorAll("#bergamotList input[type=checkbox]")).toHaveLength(4))
    const box = () => Array.from(document.querySelectorAll<HTMLInputElement>("#bergamotList input[type=checkbox]")).find((b) => b.checked)!
    // fr → zh-CN needs fr → en (ticked) and en → zh-Hans (installed).
    box().click()
    expect($<HTMLButtonElement>("downloadPicked").disabled).toBe(true)
    expect($("downloadStatus").textContent).toBe(ENGLISH.t("downloadNothingPicked"))
    document.querySelector<HTMLInputElement>("#bergamotList input[type=checkbox]")!.click()
    expect($<HTMLButtonElement>("downloadPicked").disabled).toBe(false)
    expect($("downloadStatus").textContent).toBe("")
  })

  it("recommends the dictionary packs and offline models the languages need and downloads the ticked ones", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const pack = (src: string, tgt: string) => ({
      src,
      tgt,
      file: `dict-${src}-${tgt}.tsv.gz`,
      bytes: 1048576,
      rawBytes: 1,
      entries: 1000,
      forms: 0,
      sha256: "00".repeat(32),
      source: "Wiktionary",
      license: "CC BY-SA 4.0",
      attribution: `Wiktionary ${src}-${tgt}`,
    })
    const index = { version: 1, packs: [pack("ja", "en"), pack("en", "zh-Hans"), pack("en", "de")] }
    const urls: string[] = []
    const requests: BackgroundRequest[] = []
    const respond = (req: BackgroundRequest) => {
      requests.push(req)
      switch (req.type) {
        case "bergamotList":
          return {
            ok: true,
            pairs: [
              { src: "ja", tgt: "en", version: "1", architecture: "base", bytes: 30e6, rawBytes: 1, installed: false },
              { src: "en", tgt: "zh-Hans", version: "1", architecture: "base", bytes: 35e6, rawBytes: 1, installed: true },
              { src: "fr", tgt: "en", version: "1", architecture: "base", bytes: 30e6, rawBytes: 1, installed: false },
            ],
          }
        case "bergamotInstall":
          return { ok: true }
        case "bergamotProgress":
          return {}
      }
      return undefined
    }
    const s = settings((s) => {
      s.sourceLang = "ja"
      s.tiers = { dictionary: "dictionary", machine: "bergamot", ai: null }
    })
    await openPage("welcome", s, {
      stored: { [WELCOME_KEY]: { step: "offline" } },
      respond,
      fetchUrl: async (url) => {
        urls.push(url)
        return url.endsWith("dict-index.json") ? jsonResponse(index) : new Response("missing", { status: 404 })
      },
    })
    const names = (list: string) => Array.from(document.querySelectorAll(`#${list} .dict-name`)).map((el) => el.textContent)
    await vi.waitFor(() => expect(names("dictList")).toHaveLength(3))
    // The target language first, then the source language, then the rest.
    expect(names("dictList")[0]).toMatch(/^English → .*简体中文/)
    expect(names("dictList")[1]).toMatch(/^Japanese .*→ English$/)
    expect(names("dictList")[2]).toMatch(/^English → German/)
    expect(document.querySelector("#dictList")!.textContent).toContain("Wiktionary ja-en")
    expect(document.querySelector("#dictList")!.textContent).toContain(ENGLISH.t("dictPackMeta", ["1.0", "1,000", "CC BY-SA 4.0"]))
    await vi.waitFor(() => expect(names("bergamotList")).toHaveLength(3))
    expect($("offlineAutoHint").hidden).toBe(true)
    // The installed direction has no check box; the missing one is ticked, the one the languages do not need is not.
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('#bergamotList input[type="checkbox"]')).map((b) => b.checked)).toEqual([true, false])
    expect(document.querySelector("#bergamotList")!.textContent).toContain(ENGLISH.t("dictInstalled"))

    // Untick the second dictionary pack, then download.
    const dictBoxes = Array.from(document.querySelectorAll<HTMLInputElement>('#dictList input[type="checkbox"]'))
    expect(dictBoxes.map((b) => b.checked)).toEqual([true, true, false])
    dictBoxes[0].click()
    $("downloadPicked").click()
    await vi.waitFor(() => expect(requests).toContainEqual({ type: "bergamotInstall", src: "ja", tgt: "en" }))
    await vi.waitFor(() => expect(urls.some((u) => u.endsWith("/dict-ja-en.tsv.gz"))).toBe(true))
    expect(urls.some((u) => u.endsWith("/dict-en-zh-Hans.tsv.gz"))).toBe(false)
    expect(requests.some((r) => r.type === "bergamotInstall" && r.src === "fr")).toBe(false)
  })

  it("applies a preset to a prompt with the shared prompt editor", async () => {
    const page = await openPage("welcome", settings((s) => (s.tiers.ai = "openai")), { stored: { [WELCOME_KEY]: { step: "prompts" } } })
    await vi.waitFor(() => expect(current()).toBe("prompts"))
    expect($<HTMLSelectElement>("presetId").value).toBe(NO_PRESET)
    choose("presetId", "style")
    choose("presetOption", "plain")
    choose("presetKind", "precise")
    expect($("presetExample").textContent).toContain(ENGLISH.t("presetStylePlainExample"))
    $("presetApply").click()
    const preset = getPromptPreset("style")!
    const expected = `${DEFAULT_PROMPTS.precise}\n\n${presetBlock(preset, preset.options!.find((o) => o.id === "plain"))}`
    expect($<HTMLTextAreaElement>("prompt-precise").value).toBe(expected)
    await vi.waitFor(() => expect(page.stored().prompts.precise).toBe(expected))
    expect($("presetStatus").textContent).toBe(ENGLISH.t("presetApplied", [ENGLISH.t("labelPrecise")]))
  })

  it("removes the preset rules with Plain and keeps the user's own text", async () => {
    const own = "Always keep the greeting short."
    const dialect = getPromptPreset("dialect")!
    const style = getPromptPreset("style")!
    const prompt = [DEFAULT_PROMPTS.bilingual, own, presetBlock(dialect, dialect.options![1]), presetBlock(style, style.options![0])].join("\n\n")
    const page = await openPage("welcome", settings((s) => {
      s.tiers.ai = "openai"
      s.prompts.bilingual = prompt
    }), { stored: { [WELCOME_KEY]: { step: "prompts" } } })
    await vi.waitFor(() => expect(current()).toBe("prompts"))
    choose("presetId", NO_PRESET)
    expect($("presetHint").textContent).toBe(ENGLISH.t("presetNoneHint"))
    expect($("presetExample").textContent).toBe(ENGLISH.t("presetNoneExample"))
    expect(document.querySelector<HTMLElement>("#presetOption")!.closest("label")!.hidden).toBe(true)
    choose("presetKind", "bilingual")
    $("presetApply").click()
    expect($<HTMLTextAreaElement>("prompt-bilingual").value).toBe(`${DEFAULT_PROMPTS.bilingual}\n\n${own}`)
    await vi.waitFor(() => expect(page.stored().prompts.bilingual).toBe(`${DEFAULT_PROMPTS.bilingual}\n\n${own}`))
    expect($("presetStatus").textContent).toBe(ENGLISH.t("presetRemoved", [ENGLISH.t("modeBilingual")]))
    // Without the user's text the prompt is the built-in one again, stored as empty.
    $<HTMLTextAreaElement>("prompt-bilingual").value = `${DEFAULT_PROMPTS.bilingual}\n\n${presetBlock(style, style.options![1])}`
    $("prompt-bilingual").dispatchEvent(new Event("input"))
    $("presetApply").click()
    await vi.waitFor(() => expect(page.stored().prompts.bilingual).toBe(""))
    expect($<HTMLTextAreaElement>("prompt-bilingual").value).toBe(DEFAULT_PROMPTS.bilingual)
    expect(removePresets(prompt)).toBe(`${DEFAULT_PROMPTS.bilingual}\n\n${own}`)
  })

  /** The background script's end of the content script Port: answers every paragraph with "[zh] <text>". */
  function answeringPort() {
    const port = pagePort()
    port.postMessage.mockImplementation((m: PortReport) => {
      if (m.type !== "translate") return
      queueMicrotask(() => {
        for (const tier of m.request.tiers) port.push({ type: "tier", id: m.id, tier, result: { ok: true, text: `[zh] ${m.request.text}` } })
        port.push({ type: "done", id: m.id })
      })
    })
    return { port, emit: port.push, connect: vi.fn(() => port) }
  }

  it("translates the sample message with the content script's modules through the background script", async () => {
    const { port, emit, connect } = answeringPort()
    const s = settings()
    await openPage("welcome", s, { stored: { [WELCOME_KEY]: { step: "finish" } }, connect })
    await vi.waitFor(() => expect(current()).toBe("finish"))
    $("tryIt").click()
    expect(connect).toHaveBeenCalledWith({ name: "tt-content" })
    // The background script answers the connection with the settings.
    emit({ type: "settings", settings: toPublicSettings(s) })
    await vi.waitFor(() => expect(document.querySelectorAll("#trySample .tt-translation")).toHaveLength(4))
    const requests = port.posted("translate")
    expect(requests.map((m) => m.request.text)[1]).toContain("Thanks for sending the draft")
    expect(requests.every((m) => m.request.targetLang === "zh-CN" && m.request.tiers.join() === "machine")).toBe(true)
    expect(document.querySelector("#trySample .tt-translation")!.textContent).toBe("[zh] Hi Anna,")
    expect($("tryIt").textContent).toBe(ENGLISH.t("popupShowOriginal"))
    $("tryIt").click()
    expect(document.querySelectorAll("#trySample .tt-translation")).toHaveLength(0)
  })

  it("keeps the trial button in the new interface language while the trial runs", async () => {
    const { emit, connect } = answeringPort()
    const s = settings()
    await openPage("welcome", s, { stored: { [WELCOME_KEY]: { step: "finish" } }, connect })
    await vi.waitFor(() => expect(current()).toBe("finish"))
    $("tryIt").click()
    emit({ type: "settings", settings: toPublicSettings(s) })
    await vi.waitFor(() => expect(document.querySelectorAll("#trySample .tt-translation")).toHaveLength(4))
    choose("uiLanguage", "ko")
    await vi.waitFor(() => expect(document.documentElement.lang).toBe("ko"))
    expect($("tryIt").textContent).toBe(readLocaleSources().ko.popupShowOriginal)
  })

  it("switches the interface language on the first step and saves it", async () => {
    const de = readLocaleSources().de
    const page = await openPage("welcome", settings())
    await ready()
    choose("uiLanguage", "de")
    await vi.waitFor(() => expect(document.documentElement.lang).toBe("de"))
    expect(stepButtons()[0].textContent).toBe(`1. ${de.stepLanguage}`)
    expect($("nextStep").textContent).toBe(de.buttonNext)
    await vi.waitFor(() => expect(page.stored().uiLanguage).toBe("de"))
  })

  it("explains the skipped steps and marks the current one", async () => {
    await openPage("welcome", settings())
    await ready()
    const [first, , , offline] = stepButtons()
    expect(first.getAttribute("aria-current")).toBe("step")
    expect(offline.title).toBe(ENGLISH.t("stepNotNeeded"))
    expect(offline.parentElement!.className).toBe("skipped")
    expect($("progressTrack").getAttribute("aria-valuemax")).toBe("5")
    expect($("progressTrack").getAttribute("aria-valuenow")).toBe("1")
  })

  it("takes over changes made in another page", async () => {
    const ja = readLocaleSources().ja
    const page = await openPage("welcome", settings(), { stored: { [WELCOME_KEY]: { step: "display" } } })
    await vi.waitFor(() => expect(current()).toBe("display"))
    page.external((s) => (s.mode = "translation-only"))
    expect(document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value).toBe("translation-only")
    expect(document.querySelectorAll("#modePreview .tt-translation.tt-only")).toHaveLength(2)
    page.external((s) => {
      s.tiers.ai = "openai"
      s.sourceLang = "zh-CN"
    })
    expect($<HTMLSelectElement>("tier-ai").value).toBe("openai")
    expect(stepButtons().filter((b) => b.disabled)).toHaveLength(1)
    expect($("sameLanguage").hidden).toBe(false)
    page.external((s) => (s.uiLanguage = "ja"))
    await vi.waitFor(() => expect(document.documentElement.lang).toBe("ja"))
    expect(stepButtons()[1].textContent).toBe(`2. ${ja.stepDisplay}`)
  })

  it("does not redraw the step the user is typing in", async () => {
    const page = await openPage("welcome", settings((s) => (s.tiers.ai = "openai")), { stored: { [WELCOME_KEY]: { step: "ai" } } })
    await vi.waitFor(() => expect(current()).toBe("ai"))
    const key = document.querySelector<HTMLInputElement>('#aiPanel input[type="password"]')!
    key.focus()
    page.external((s) => (s.mode = "translation-only"))
    expect(document.querySelector('#aiPanel input[type="password"]')).toBe(key)
  })

  it("saves the switch of the last step and opens the settings page", async () => {
    const page = await openPage("welcome", settings(), { stored: { [WELCOME_KEY]: { step: "finish" } } })
    await vi.waitFor(() => expect(current()).toBe("finish"))
    $<HTMLInputElement>("autoTranslate").click()
    await vi.waitFor(() => expect(page.stored().autoTranslate).toBe(true))
    $("openOptions").click()
    expect(page.openOptionsPage).toHaveBeenCalledTimes(1)
  })

  it("closes the window when the page has no tab of its own", async () => {
    const page = await openPage("welcome", settings(), { currentTab: {} })
    await ready()
    $("exitGuide").click()
    await vi.waitFor(() => expect(page.close).toHaveBeenCalledTimes(1))
    expect(page.removed).toEqual([])
  })

  it("adds the online translator when its endpoint is typed, and ignores an emptied field", async () => {
    const s = settings((s) => (s.tiers.machine = "deeplx"))
    const page = await openPage("welcome", s, { stored: { [WELCOME_KEY]: { step: "machine" } } })
    await vi.waitFor(() => expect(current()).toBe("machine"))
    const endpoint = document.querySelector<HTMLInputElement>('#machinePanel input[type="text"]')!
    endpoint.value = ""
    endpoint.dispatchEvent(new Event("input"))
    endpoint.value = "https://deeplx.example.com/translate"
    endpoint.dispatchEvent(new Event("input"))
    await vi.waitFor(() => expect(page.stored().providers.deeplx).toMatchObject({ enabled: true, baseURL: "https://deeplx.example.com/translate" }))
  })

  it("shows only the offline lists of the offline services in use", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const requests: BackgroundRequest[] = []
    const respond = (req: BackgroundRequest) => {
      requests.push(req)
      return req.type === "bergamotList" ? { ok: true, pairs: [] } : undefined
    }
    await openPage("welcome", settings((s) => (s.tiers.dictionary = "dictionary")), { stored: { [WELCOME_KEY]: { step: "offline" } }, respond })
    await vi.waitFor(() => expect(current()).toBe("offline"))
    expect($("offlineDictionary").hidden).toBe(false)
    expect($("offlineBergamot").hidden).toBe(true)
    // Nothing to tick (the release index cannot be fetched): the button stays disabled and says why.
    await vi.waitFor(() => expect($("dictStatus").textContent).toContain(ENGLISH.t("dictIndexFailed", [""]).trim()))
    expect($<HTMLButtonElement>("downloadPicked").disabled).toBe(true)
    expect($("downloadStatus").textContent).toBe(ENGLISH.t("downloadNothingPicked"))
    expect(requests.some((r) => r.type === "bergamotInstall")).toBe(false)
  })
})
