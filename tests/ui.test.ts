// @vitest-environment jsdom
/** Popup and settings page: tiers, source language, added services, prompts, dictionaries and offline models. */
import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ENGLISH } from "../src/shared/i18n"
import type { BackgroundRequest, OfflineStatus } from "../src/shared/messages"
import { applyPreset, getPromptPreset, NO_PRESET } from "../src/shared/prompt-presets"
import { DEFAULT_PROMPTS, PROMPT_KINDS } from "../src/shared/prompts"
import { ADD_SERVICE } from "../src/shared/page"
import { createDefaultSettings } from "../src/shared/settings"
import { bergamotStandIn } from "./fixtures/offline"
import { flushSave } from "./fixtures/pages"
import { jsonResponse, nextTask, openPage, useFakeTimers } from "./helpers"

// Fake timers in every test: a page left open by a test cannot fire its timers into the next one.
beforeEach(() => useFakeTimers())

afterEach(() => vi.useRealTimers())

const optionTexts = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.value)
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#providerPanel button")).find((b) => b.textContent === text)!
const select = (id: string) => document.querySelector<HTMLSelectElement>(`#${id}`)!
const choose = (el: HTMLSelectElement, value: string) => {
  el.value = value
  el.dispatchEvent(new Event("change"))
}

describe("popup", () => {
  it("offers the added services of each tier, with Not used, and as last entry the services of the tier on the settings page", async () => {
    const s = createDefaultSettings("en")
    s.providers.openai.enabled = true
    s.providers.openai.apiKey = "sk"
    const { created, close, stored } = await openPage("popup", s)
    await vi.waitFor(() => expect(optionTexts(select("tier-machine"))).toEqual(["", "google-free", "microsoft-free", ADD_SERVICE]))
    expect(optionTexts(select("tier-ai"))).toEqual(["", "openai", ADD_SERVICE])
    expect(optionTexts(select("tier-dictionary"))).toEqual(["", ADD_SERVICE])
    expect(select("tier-ai").options[0].textContent).toBe(ENGLISH.t("tierNotUsed"))
    expect(select("tier-ai").options[2].textContent).toBe(ENGLISH.t("tierAddService"))
    expect(document.querySelector("#tierLabel-machine")!.textContent).toBe(ENGLISH.t("tierLabel", ["2", ENGLISH.t("tierMachine")]))
    expect(document.querySelector<HTMLElement>("#preciseRow")!.hidden).toBe(true)
    expect(document.querySelector("#addProvider")).toBeNull()
    choose(select("tier-ai"), ADD_SERVICE)
    expect(created).toEqual(["moz-extension://test/options.html?tier=ai#providers"])
    expect(close).toHaveBeenCalled()
    // The selector shows the service of the tier again, and nothing was saved.
    expect(select("tier-ai").value).toBe("")
    expect(stored().tiers.ai).toBeNull()
  })

  describe("offline services without their data", () => {
    const offlineSettings = () => {
      const s = createDefaultSettings("en")
      s.targetLang = "zh-CN"
      s.tiers = { dictionary: "dictionary", machine: "bergamot", ai: null }
      return s
    }
    const ZH = "English → Simplified Chinese (简体中文)"

    it("marks the selected offline service in its selector, in words and in red, and follows installations elsewhere", async () => {
      const s = offlineSettings()
      let status: OfflineStatus = { dictionary: { missing: ["en>zh-Hans"], unsupported: false }, bergamot: { missing: [], unsupported: false } }
      const page = await openPage("popup", s, { respond: (req) => (req.type === "offlineStatus" ? status : undefined) })
      await vi.waitFor(() => expect(select("tier-dictionary").classList.contains("missing")).toBe(true))
      expect(page.sendMessage).toHaveBeenCalledWith({ type: "offlineStatus", sourceLang: "auto", targetLang: "zh-CN", tiers: s.tiers })
      const option = select("tier-dictionary").selectedOptions[0]
      expect(option.textContent).toBe(ENGLISH.t("tierModelMissing", [ENGLISH.t("tierDictionary")]))
      expect(option.className).toBe("missing")
      expect(select("tier-machine").classList.contains("missing")).toBe(false)
      const hint = document.querySelector<HTMLElement>("#offlineMissing")!
      expect(hint.hidden).toBe(false)
      expect(hint.querySelector(".missing")!.textContent).toBe(ENGLISH.t("offlineMissing", [ENGLISH.t("tierDictionary"), ZH]))

      status = { dictionary: { missing: [], unsupported: false }, bergamot: { missing: ["en>zh-Hans"], unsupported: false } }
      page.notify({ type: "offlineDataChanged" })
      page.notify({ type: "something else" })
      await vi.waitFor(() => expect(select("tier-machine").classList.contains("missing")).toBe(true))
      expect(select("tier-machine").selectedOptions[0].textContent).toBe(ENGLISH.t("tierModelMissing", ["Bergamot"]))
      expect(select("tier-dictionary").classList.contains("missing")).toBe(false)
      expect(select("tier-dictionary").selectedOptions[0].textContent).toBe(ENGLISH.t("providerDictionary"))
    })

    it("links to the downloads of the settings page, filtered to what is missing", async () => {
      const status: OfflineStatus = { dictionary: { missing: [], unsupported: false, anyInto: "en" }, bergamot: { missing: ["ja>en", "en>de"], unsupported: false } }
      const { created, close } = await openPage("popup", offlineSettings(), { respond: (req) => (req.type === "offlineStatus" ? status : undefined) })
      const link = () => document.querySelector<HTMLAnchorElement>("#offlineMissing a")
      await vi.waitFor(() => expect(link()).not.toBeNull())
      expect(document.querySelector("#offlineMissing")!.textContent).toContain(ENGLISH.t("offlineMissingAnyInto", [ENGLISH.t("tierDictionary"), "English"]))
      expect(link()!.textContent).toBe(ENGLISH.t("offlineDownload"))
      link()!.click()
      expect(created).toEqual(["moz-extension://test/options.html?dict=%3Een&bergamot=ja%3Een%2Cen%3Ede#dictionaries"])
      expect(close).toHaveBeenCalled()
    })

    it("says when the service does not support the languages, without red and without a link, and asks nothing without an offline service", async () => {
      const status: OfflineStatus = { bergamot: { missing: [], unsupported: true } }
      await openPage("popup", offlineSettings(), { respond: (req) => (req.type === "offlineStatus" ? status : undefined) })
      await vi.waitFor(() => expect(document.querySelector<HTMLElement>("#offlineMissing")!.hidden).toBe(false))
      expect(document.querySelector("#offlineMissing")!.textContent).toBe(ENGLISH.t("offlineUnsupported", ["Bergamot"]))
      expect(document.querySelector("#offlineMissing")!.classList.contains("missing")).toBe(false)
      expect(select("tier-machine").classList.contains("missing")).toBe(false)

      const page = await openPage("popup", createDefaultSettings("en"), { respond: () => ({ dictionary: { missing: ["x>y"], unsupported: false } }) })
      await vi.waitFor(() => expect(optionTexts(select("tier-machine"))).toContain("google-free"))
      expect(page.sendMessage.mock.calls.some(([req]) => req.type === "offlineStatus")).toBe(false)
      expect(document.querySelector<HTMLElement>("#offlineMissing")!.hidden).toBe(true)
    })

    it("L3: marks in red only what a service lacks, not that another one does not support the languages", async () => {
      const status: OfflineStatus = { dictionary: { missing: [], unsupported: true }, bergamot: { missing: ["en>zh-Hans"], unsupported: false } }
      await openPage("popup", offlineSettings(), { respond: (req) => (req.type === "offlineStatus" ? status : undefined) })
      const hint = document.querySelector<HTMLElement>("#offlineMissing")!
      await vi.waitFor(() => expect(hint.hidden).toBe(false))
      const statements = Array.from(hint.querySelectorAll("span"), (el) => [el.textContent, el.classList.contains("missing")])
      expect(statements).toEqual([
        [ENGLISH.t("offlineUnsupported", [ENGLISH.t("tierDictionary")]), false],
        [ENGLISH.t("offlineMissing", ["Bergamot", ZH]), true],
      ])
      expect(hint.classList.contains("missing")).toBe(false)
      expect(hint.textContent).toBe(`${statements[0][0]} ${statements[1][0]} ${ENGLISH.t("offlineDownload")}`)
    })

    it("asks again when the languages or the tiers change", async () => {
      const page = await openPage("popup", offlineSettings(), { respond: () => undefined })
      await vi.waitFor(() => expect(page.sendMessage.mock.calls.filter(([req]) => req.type === "offlineStatus")).toHaveLength(1))
      page.external((s) => (s.targetLang = "ja"))
      await vi.waitFor(() => expect(page.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "offlineStatus", targetLang: "ja" })))
      page.external((s) => (s.autoTranslate = true))
      await nextTask()
      expect(page.sendMessage.mock.calls.filter(([req]) => req.type === "offlineStatus")).toHaveLength(2)
    })
  })

  it("sets a tier, and refuses to leave every tier empty", async () => {
    const s = createDefaultSettings("en")
    s.providers.openai = { enabled: true, apiKey: "sk", baseURL: "", model: "" }
    const { stored } = await openPage("popup", s)
    await vi.waitFor(() => expect(optionTexts(select("tier-ai"))).toContain("openai"))
    choose(select("tier-ai"), "openai")
    await vi.waitFor(() => expect(stored().tiers.ai).toBe("openai"))
    choose(select("tier-machine"), "")
    await vi.waitFor(() => expect(stored().tiers).toEqual({ dictionary: null, machine: null, ai: "openai" }))

    choose(select("tier-ai"), "")
    expect(select("tier-ai").value).toBe("openai")
    expect(document.querySelector<HTMLElement>("#tiersEmpty")!.hidden).toBe(false)
    // The popup writes a choice at once; the refused one is never written.
    await nextTask()
    expect(stored().tiers.ai).toBe("openai")
  })

  it("links to the setup guide", async () => {
    const { created } = await openPage("popup", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#openWelcome")!.textContent).toBe(ENGLISH.t("openWelcome")))
    document.querySelector<HTMLAnchorElement>("#openWelcome")!.click()
    expect(created).toEqual(["moz-extension://test/welcome.html"])
  })

  it("shows the precise switch with an AI tier", async () => {
    const s = createDefaultSettings("en")
    s.tiers.ai = "deepseek"
    const { stored } = await openPage("popup", s)
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>("#preciseRow")!.hidden).toBe(false))
    const precise = document.querySelector<HTMLInputElement>("#preciseEnabled")!
    precise.checked = true
    precise.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(stored().precise.enabled).toBe(true))
  })

  it("chooses the source language and warns when it equals the target language", async () => {
    const { stored } = await openPage("popup", createDefaultSettings("en"))
    await vi.waitFor(() => expect(select("sourceLang").options.length).toBeGreaterThan(1))
    expect(select("sourceLang").options[0]).toMatchObject({ value: "auto", textContent: ENGLISH.t("sourceLangAuto") })
    expect(select("sourceLang").value).toBe("auto")
    choose(select("sourceLang"), "de")
    await vi.waitFor(() => expect(stored().sourceLang).toBe("de"))
    expect(document.querySelector<HTMLElement>("#sameLanguage")!.hidden).toBe(true)
    choose(select("sourceLang"), "en")
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>("#sameLanguage")!.hidden).toBe(false))
  })
})

describe("settings page", () => {
  const providerList = () =>
    Array.from(document.querySelectorAll("#providerList li")).map((li) => (li.classList.contains("group") ? `# ${li.textContent}` : li.firstChild!.textContent))
  const pick = (name: string) => Array.from(document.querySelectorAll<HTMLLIElement>("#providerList li")).find((li) => li.firstChild?.textContent === name)!.click()

  it("groups services into added and available ones, and fills the tiers", async () => {
    await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#providerPanel button")).not.toBeNull())
    const list = providerList()
    expect(list.slice(0, 4)).toEqual([`# ${ENGLISH.t("providerGroupAdded")}`, "Google Translate (free)", "Microsoft Translator (free)", `# ${ENGLISH.t("providerGroupAvailable")}`])
    expect(list).toContain("OpenAI")
    expect(list).toContain(ENGLISH.t("providerDictionary"))
    expect(list).toContain("Bergamot (offline)")
    expect(optionTexts(select("tier-machine"))).toEqual(["", "google-free", "microsoft-free", ADD_SERVICE])
    expect(select("tier-machine").value).toBe("google-free")
    expect(document.querySelector("#providerList .tag")!.textContent).toBe(ENGLISH.t("providerInUse"))
  })

  it("does not remove a service that a tier uses, and explains why", async () => {
    await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(button(ENGLISH.t("buttonRemoveProvider"))).toBeDefined())
    expect(button(ENGLISH.t("buttonRemoveProvider")).disabled).toBe(true)
    expect(document.querySelector("#providerPanel .remove-hint")!.textContent).toBe(ENGLISH.t("removeBlockedTier", [ENGLISH.t("tierMachine")]))
    pick("Microsoft Translator (free)")
    expect(button(ENGLISH.t("buttonRemoveProvider")).disabled).toBe(false)
  })

  it("adds the dictionary and uses it in its tier", async () => {
    const { stored } = await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#providerList li")).not.toBeNull())
    pick(ENGLISH.t("providerDictionary"))
    expect(document.querySelector("#providerPanel .hint")!.textContent).toBe(ENGLISH.t("hintDictionaryProvider"))
    button(ENGLISH.t("buttonAddProvider")).click()
    button(ENGLISH.t("buttonUse")).click()
    expect(select("tier-dictionary").value).toBe("dictionary")
    await flushSave()
    expect(stored().tiers).toEqual({ dictionary: "dictionary", machine: "google-free", ai: null })
    expect(button(ENGLISH.t("buttonRemoveProvider")).disabled).toBe(true)
  })

  it("adds a service with the Add button or by typing its key, and removes it again", async () => {
    const { stored } = await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#providerList li")).not.toBeNull())

    pick("Mistral AI")
    button(ENGLISH.t("buttonAddProvider")).click()
    expect(optionTexts(select("tier-ai"))).toContain("mistral")

    pick("OpenAI")
    const key = document.querySelector<HTMLInputElement>('#providerPanel input[type="password"]')!
    key.value = "sk-test"
    key.dispatchEvent(new Event("input"))
    expect(optionTexts(select("tier-ai"))).toContain("openai")
    expect(button(ENGLISH.t("buttonRemoveProvider")).disabled).toBe(false)
    await flushSave()
    expect(stored().providers.openai.enabled).toBe(true)

    button(ENGLISH.t("buttonRemoveProvider")).click()
    expect(optionTexts(select("tier-ai"))).not.toContain("openai")
    await flushSave()
    expect(stored().providers.openai.enabled).toBe(false)
    // The key stays, so adding the service again restores its configuration.
    expect(stored().providers.openai.apiKey).toBe("sk-test")
  })

  it("refuses to leave every tier empty", async () => {
    const { stored, browser } = await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(select("tier-machine").options.length).toBeGreaterThan(1))
    choose(select("tier-machine"), "")
    expect(select("tier-machine").value).toBe("google-free")
    expect(document.querySelector<HTMLElement>("#tiersEmpty")!.hidden).toBe(false)
    await flushSave()
    expect(browser.local.set).not.toHaveBeenCalled()
    expect(stored().tiers.machine).toBe("google-free")
    choose(select("tier-machine"), "microsoft-free")
    expect(document.querySelector<HTMLElement>("#tiersEmpty")!.hidden).toBe(true)
    await flushSave()
    expect(stored().tiers.machine).toBe("microsoft-free")
  })

  it("edits the three prompts and restores a default; the built-in prompt shows in the box and is stored as empty", async () => {
    const { stored } = await openPage("options", createDefaultSettings("en"))
    const box = (kind: string) => document.querySelector<HTMLTextAreaElement>(`#prompt-${kind}`)!
    await vi.waitFor(() => expect(box("precise").value).toBe(DEFAULT_PROMPTS.precise))
    expect(box("bilingual").value).toBe(DEFAULT_PROMPTS.bilingual)
    box("translationOnly").value = "Natural {{to}}."
    box("translationOnly").dispatchEvent(new Event("input"))
    await flushSave()
    expect(stored().prompts.translationOnly).toBe("Natural {{to}}.")
    document.querySelector<HTMLButtonElement>("#reset-translationOnly")!.click()
    expect(box("translationOnly").value).toBe(DEFAULT_PROMPTS.translationOnly)
    await flushSave()
    expect(stored().prompts.translationOnly).toBe("")
    // Typing the built-in text back stores nothing either.
    box("precise").value = "Short."
    box("precise").dispatchEvent(new Event("input"))
    await flushSave()
    expect(stored().prompts.precise).toBe("Short.")
    box("precise").value = `${DEFAULT_PROMPTS.precise}\n`
    box("precise").dispatchEvent(new Event("input"))
    await flushSave()
    expect(stored().prompts.precise).toBe("")
  })

  it("applies presets to each of the three prompts, keeps the box editable and restores the default", async () => {
    const s = createDefaultSettings("en")
    s.targetLang = "pt"
    const { stored } = await openPage("options", s)
    const box = (kind: string) => document.querySelector<HTMLTextAreaElement>(`#prompt-${kind}`)!
    await vi.waitFor(() => expect(optionTexts(select("presetId"))).toEqual([NO_PRESET, "dialect", "keepTerms", "explainTerms", "style"]))
    choose(select("presetId"), "dialect")
    expect(optionTexts(select("presetOption"))).toEqual(["pt-BR", "pt-PT"])
    const dialect = getPromptPreset("dialect")!
    for (const kind of PROMPT_KINDS) {
      choose(select("presetOption"), "pt-PT")
      choose(select("presetKind"), kind)
      document.querySelector<HTMLButtonElement>("#presetApply")!.click()
      expect(box(kind).value).toBe(applyPreset(DEFAULT_PROMPTS[kind], dialect, dialect.options!.find((o) => o.id === "pt-PT")))
    }
    await flushSave()
    expect(stored().prompts.precise).toContain(dialect.heading)
    expect(stored().prompts.bilingual).toContain(dialect.heading)

    box("bilingual").value += "\n- Keep it short."
    box("bilingual").dispatchEvent(new Event("input"))
    await flushSave()
    expect(stored().prompts.bilingual.endsWith("- Keep it short.")).toBe(true)
    document.querySelector<HTMLButtonElement>("#reset-bilingual")!.click()
    await flushSave()
    expect(stored().prompts.bilingual).toBe("")
    expect(box("bilingual").value).toBe(DEFAULT_PROMPTS.bilingual)

    // Another target language changes the offered variants.
    choose(select("targetLang"), "en")
    expect(optionTexts(select("presetOption"))).toEqual(["en-GB", "en-US"])
    choose(select("targetLang"), "ja")
    expect(optionTexts(select("presetId"))).not.toContain("dialect")
  })

  it("shows the services of a tier: from the address, from the list's filter and from the last entry of a tier selector", async () => {
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    history.replaceState(null, "", "?tier=dictionary#providers")
    try {
      await openPage("options", createDefaultSettings("en"))
      await vi.waitFor(() => expect(providerList()).toEqual([`# ${ENGLISH.t("providerGroupAvailable")}`, ENGLISH.t("providerDictionary")]))
      expect(select("providerTierFilter").value).toBe("dictionary")
      expect(document.querySelector("#providerPanel h3")!.textContent).toBe(ENGLISH.t("providerDictionary"))
      expect(scrolled).toEqual(["providers"])
      choose(select("providerTierFilter"), "")
      expect(providerList()).toContain("OpenAI")
      choose(select("tier-ai"), ADD_SERVICE)
      expect(select("providerTierFilter").value).toBe("ai")
      expect(providerList()).not.toContain("Google Translate (free)")
      expect(select("tier-ai").value).toBe("")
      expect(scrolled).toEqual(["providers", "providers"])
    } finally {
      history.replaceState(null, "", location.pathname)
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })

  it("lists the muted notices about missing offline data and brings them back", async () => {
    const s = createDefaultSettings("en")
    s.offlineMutedPairs = ["dictionary:ja>zh-Hans", "bergamot:de>en"]
    const page = await openPage("options", s)
    await vi.waitFor(() => expect(document.querySelector("#mutedPairs")!.textContent).not.toBe(""))
    const entries = [ENGLISH.t("mutedPairEntry", [ENGLISH.t("tierDictionary"), "Japanese (日本語) → Simplified Chinese (简体中文)"]), ENGLISH.t("mutedPairEntry", ["Bergamot", "German (Deutsch) → English"])]
    expect(document.querySelector("#mutedPairs")!.textContent).toBe(ENGLISH.t("mutedPairsList", [entries.join(", ")]))
    document.querySelector<HTMLButtonElement>("#clearMuted")!.click()
    expect(document.querySelector("#mutedPairs")!.textContent).toBe(ENGLISH.t("mutedPairsNone"))
    expect(document.querySelector<HTMLButtonElement>("#clearMuted")!.disabled).toBe(true)
    await flushSave()
    expect(page.stored().offlineMutedPairs).toEqual([])
    page.external((s) => (s.offlineMutedPairs = ["bergamot:fr>en"]))
    expect(document.querySelector("#mutedPairs")!.textContent).toContain("French")
  })

  it("marks the offline services of the tiers and filters both offline lists from the address or from its link", async () => {
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    history.replaceState(null, "", "?dict=en%3Ezh-Hans&bergamot=ja%3Een%2Cen%3Ezh-Hans#dictionaries")
    try {
      const s = createDefaultSettings("en")
      s.tiers = { dictionary: "dictionary", machine: "bergamot", ai: null }
      let status: OfflineStatus = { bergamot: { missing: ["de>en"], unsupported: false } }
      const page = await openPage("options", s, { respond: (req) => (req.type === "offlineStatus" ? status : req.type === "cacheStats" ? { size: 0 } : undefined) })
      expect(document.querySelector<HTMLInputElement>("#dictFilter")!.value).toBe("en>zh-Hans")
      expect(document.querySelector<HTMLInputElement>("#bergamotFilter")!.value).toBe("ja>en, en>zh-Hans")
      expect(scrolled).toEqual(["dictionaries"])
      await vi.waitFor(() => expect(select("tier-machine").classList.contains("missing")).toBe(true))
      document.querySelector<HTMLAnchorElement>("#offlineMissing a")!.click()
      expect(document.querySelector<HTMLInputElement>("#bergamotFilter")!.value).toBe("de>en")
      expect(scrolled).toEqual(["dictionaries", "bergamot"])
      // New languages ask again.
      status = {}
      choose(select("targetLang"), "ja")
      await vi.waitFor(() => expect(select("tier-machine").classList.contains("missing")).toBe(false))
      status = { dictionary: { missing: ["en>ko"], unsupported: false } }
      choose(select("sourceLang"), "en")
      await vi.waitFor(() => expect(select("tier-dictionary").classList.contains("missing")).toBe(true))
      status = {}
      page.external((s) => (s.tiers.ai = "openai"))
      await vi.waitFor(() => expect(select("tier-dictionary").classList.contains("missing")).toBe(false))
      status = { dictionary: { missing: ["en>de"], unsupported: false } }
      page.notify({ type: "offlineDataChanged" })
      await vi.waitFor(() => expect(select("tier-dictionary").classList.contains("missing")).toBe(true))
    } finally {
      history.replaceState(null, "", location.pathname)
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })

  it("opens the setup guide", async () => {
    const { created } = await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#openWelcome")!.textContent).toBe(ENGLISH.t("openWelcome")))
    document.querySelector<HTMLButtonElement>("#openWelcome")!.click()
    expect(created).toEqual(["moz-extension://test/welcome.html"])
  })

  it("disables the thinking switch for providers without a thinking parameter", async () => {
    const s = createDefaultSettings("en")
    s.tiers.ai = "lmstudio"
    await openPage("options", s)
    await vi.waitFor(() => expect(document.querySelector("#providerPanel button")).not.toBeNull())
    const box = Array.from(document.querySelectorAll<HTMLInputElement>('#providerPanel input[type="checkbox"]'))[0]
    expect(box.disabled).toBe(true)
    expect(document.querySelector("#providerPanel")!.textContent).toContain(ENGLISH.t("hintThinkingUnsupported"))
  })
})

describe("dictionaries on the settings page", () => {
  const INDEX = {
    version: 1,
    packs: [
      {
        src: "en",
        tgt: "zh-Hans",
        file: "dict-en-zh-Hans.tsv.gz",
        bytes: 718971,
        rawBytes: 1916711,
        entries: 57640,
        forms: 32827,
        sha256: "f2".repeat(32),
        source: "ECDICT",
        license: "MIT",
        attribution: "ECDICT by skywind3000 (https://github.com/skywind3000/ECDICT); MIT License",
      },
    ],
  }
  const rows = () => Array.from(document.querySelectorAll<HTMLLIElement>("#dictList li"))

  it("lists the packs of the release with size, license and attribution", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    await openPage("options", createDefaultSettings("en"), { fetchUrl: async () => jsonResponse(INDEX) })
    await vi.waitFor(() => expect(rows()).toHaveLength(1))
    const text = rows()[0].textContent!
    expect(text).toContain("English → ")
    expect(text).toContain(ENGLISH.t("dictPackMeta", ["0.7", "57,640", "MIT"]))
    expect(text).toContain("ECDICT by skywind3000")
    expect(rows()[0].querySelector("button")!.textContent).toBe(ENGLISH.t("buttonDownload"))
    expect(document.querySelector("#dictStatus")!.textContent).toBe("")
  })

  it("says why the list could not be loaded", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    await openPage("options", createDefaultSettings("en"), { fetchUrl: async () => new Response("Not Found", { status: 404 }) })
    await vi.waitFor(() => expect(document.querySelector("#dictStatus")!.textContent).toContain("HTTP 404"))
    expect(document.querySelector("#dictStatus")!.textContent!.startsWith(ENGLISH.t("dictIndexFailed", [""]).trim())).toBe(true)
    expect(rows()).toHaveLength(0)
  })

  it("loads the list of another release tag at once, before the tag is saved", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const urls: string[] = []
    const { stored, offline } = await openPage("options", createDefaultSettings("en"), {
      fetchUrl: async (url) => {
        urls.push(url)
        return jsonResponse(INDEX)
      },
    })
    await vi.waitFor(() => expect(urls).toHaveLength(1))
    const tag = document.querySelector<HTMLInputElement>("#dictReleaseTag")!
    expect(tag.value).toBe("dicts-v1")
    tag.value = "dicts-v2"
    tag.dispatchEvent(new Event("change"))
    // The settings are written 300 ms later; the request names the tag of the page, so the list does not show the old release.
    expect(offline.requests.at(-1)).toEqual({ type: "offlineList", service: "dictionary", refresh: false, tag: "dicts-v2" })
    expect(stored().dictionary.releaseTag).toBe("dicts-v1")
    await vi.waitFor(() => expect(urls.at(-1)).toContain("/dicts-v2/dict-index.json"))
    await vi.waitFor(() => expect(document.querySelectorAll("#dictList li")).toHaveLength(1))
    await flushSave()
    expect(stored().dictionary.releaseTag).toBe("dicts-v2")
  })
})

describe("offline models on the settings page", () => {
  const PAIRS = [
    { src: "en", tgt: "zh-Hans", version: "3.0", architecture: "base", bytes: 36_175_872, rawBytes: 1, installed: true },
    { src: "ja", tgt: "en", version: "3.0", architecture: "base", bytes: 30_000_000, rawBytes: 1, installed: false },
    { src: "de", tgt: "en", version: "3.1", architecture: "base", bytes: 25_000_000, rawBytes: 1, installed: true, installedVersion: "3.0" },
  ]
  const rows = () => Array.from(document.querySelectorAll<HTMLLIElement>("#bergamotList li"))
  const row = (start: string) => rows().find((li) => li.textContent!.startsWith(start))!
  const rowButton = (li: HTMLLIElement, text: string) => Array.from(li.querySelectorAll("button")).find((b) => b.textContent === text)!

  /** The Bergamot manager of the background script: an installation reaches half of its bytes and ends when cancelled; `requests` records what the page asks. */
  function background() {
    const requests: BackgroundRequest[] = []
    const bergamot = bergamotStandIn(PAIRS, {
      install: (_src, _tgt, onProgress, signal) =>
        new Promise((_, reject) => {
          onProgress?.(15_000_000, 30_000_000)
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        }),
    })
    return { requests, page: { bergamot, respond: (req: BackgroundRequest) => void requests.push(req) } }
  }

  it("lists the pairs with size, state and updates, the needed ones first", async () => {
    const s = createDefaultSettings("en")
    s.sourceLang = "ja"
    s.targetLang = "zh-CN"
    const bg = background()
    await openPage("options", s, bg.page)
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    expect(document.querySelector("#bergamotNeeded")!.textContent).toContain("Japanese")
    expect(rows()[0].textContent).toMatch(/^English → /)
    expect(rows()[1].textContent!.startsWith("Japanese (日本語) → English")).toBe(true)
    expect(row("English → ").textContent).toContain(ENGLISH.t("bergamotPairMeta", ["34.5", "3.0"]))
    expect(row("English → ").textContent).toContain(ENGLISH.t("dictInstalled"))
    expect(row("German").textContent).toContain(ENGLISH.t("bergamotUpdateAvailable", ["3.0", "3.1"]))
    expect(rowButton(row("German"), ENGLISH.t("buttonUpdate"))).toBeDefined()
    expect(rowButton(row("Japanese"), ENGLISH.t("buttonDownload"))).toBeDefined()
  })

  it("filters by language", async () => {
    await openPage("options", createDefaultSettings("en"), background().page)
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    const filter = document.querySelector<HTMLInputElement>("#bergamotFilter")!
    filter.value = "japan"
    filter.dispatchEvent(new Event("input"))
    expect(rows().map((li) => li.querySelector(".dict-name")!.textContent)).toEqual(["Japanese (日本語) → English"])
    filter.value = "xyz"
    filter.dispatchEvent(new Event("input"))
    expect(document.querySelector("#bergamotStatus")!.textContent).toBe(ENGLISH.t("offlineNoMatch"))
  })

  it("downloads a pair with progress and can cancel", async () => {
    const bg = background()
    await openPage("options", createDefaultSettings("en"), bg.page)
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    rowButton(row("Japanese"), ENGLISH.t("buttonDownload")).click()
    expect(bg.requests).toContainEqual({ type: "offlineInstall", service: "bergamot", pairs: [{ src: "ja", tgt: "en" }] })
    await vi.waitFor(() => expect(row("Japanese").textContent).toContain(ENGLISH.t("dictDownloading", ["50"])), { timeout: 2000 })
    rowButton(row("Japanese"), ENGLISH.t("buttonCancel")).click()
    expect(bg.requests).toContainEqual({ type: "offlineCancel", service: "bergamot", src: "ja", tgt: "en" })
    await vi.waitFor(() => expect(rowButton(row("Japanese"), ENGLISH.t("buttonDownload"))).toBeDefined())
    expect(row("Japanese").querySelector(".test-result")).toBeNull()
  })

  it("asks before deleting a pair the current languages need", async () => {
    const bg = background()
    const s = createDefaultSettings("en")
    s.targetLang = "zh-CN"
    await openPage("options", s, bg.page)
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    rowButton(row("English → "), ENGLISH.t("buttonDelete")).click()
    expect(row("English → ").textContent).toContain(ENGLISH.t("bergamotDeleteNeeded"))
    expect(bg.requests.some((r) => r.type === "offlineRemove")).toBe(false)
    rowButton(row("English → "), ENGLISH.t("buttonDeleteAnyway")).click()
    await vi.waitFor(() => expect(bg.requests).toContainEqual({ type: "offlineRemove", service: "bergamot", src: "en", tgt: "zh-Hans" }))
    // A pair nobody needs goes at once.
    rowButton(row("German"), ENGLISH.t("buttonDelete")).click()
    await vi.waitFor(() => expect(bg.requests).toContainEqual({ type: "offlineRemove", service: "bergamot", src: "de", tgt: "en" }))
  })
})

describe("Microsoft Translator interface", () => {
  const pickMicrosoft = () =>
    Array.from(document.querySelectorAll<HTMLLIElement>("#providerList li")).find((li) => li.firstChild?.textContent === "Microsoft Translator (free)")!.click()
  const radio = (value: string) => document.querySelector<HTMLInputElement>(`#providerPanel input[name="microsoftMode"][value="${value}"]`)!
  const azureFields = () => document.querySelector<HTMLElement>("#providerPanel .azure-fields")!
  const change = (input: HTMLInputElement, value: string) => {
    input.value = value
    input.dispatchEvent(new Event("input"))
  }

  it("shows the key, region and endpoint fields only in key mode", async () => {
    const { stored, sendMessage } = await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#providerList li")).not.toBeNull())
    pickMicrosoft()
    expect(radio("free").checked).toBe(true)
    expect(azureFields().hidden).toBe(true)
    expect(document.querySelector("#providerPanel .hint")!.textContent).toBe(ENGLISH.t("hintFree"))

    radio("key").checked = true
    radio("key").dispatchEvent(new Event("change"))
    expect(azureFields().hidden).toBe(false)
    const [endpoint, key, region] = Array.from(azureFields().querySelectorAll<HTMLInputElement>("input"))
    expect(endpoint.placeholder).toBe("https://api.cognitive.microsofttranslator.com/translate")
    expect(key.type).toBe("password")
    change(key, " azure-key ")
    change(region, "westeurope")
    await flushSave()
    expect(stored().providers["microsoft-free"]).toMatchObject({ mode: "key", apiKey: "azure-key", region: "westeurope" })

    // The connection test sends the unsaved configuration with the mode.
    button(ENGLISH.t("buttonTest")).click()
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "testProvider", providerId: "microsoft-free", config: expect.objectContaining({ mode: "key", apiKey: "azure-key", region: "westeurope" }) }),
      ),
    )

    radio("free").checked = true
    radio("free").dispatchEvent(new Event("change"))
    expect(azureFields().hidden).toBe(true)
    await flushSave()
    expect(stored().providers["microsoft-free"].mode).toBeUndefined()
  })

  it("opens in key mode when the settings say so, with the saved values", async () => {
    const s = createDefaultSettings("en")
    s.providers["microsoft-free"] = { ...s.providers["microsoft-free"], mode: "key", apiKey: "k", region: "eastus" }
    await openPage("options", s)
    await vi.waitFor(() => expect(document.querySelector("#providerList li")).not.toBeNull())
    pickMicrosoft()
    expect(radio("key").checked).toBe(true)
    expect(azureFields().hidden).toBe(false)
    expect(Array.from(azureFields().querySelectorAll<HTMLInputElement>("input")).map((i) => i.value)).toEqual(["", "k", "eastus"])
  })
})

describe("settings changed in another page", () => {
  const check = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)!
  const ready = () => vi.waitFor(() => expect(select("targetLang").options.length).toBeGreaterThan(1))
  const edit = (el: HTMLSelectElement | HTMLTextAreaElement, value: string, type: "change" | "input") => {
    el.value = value
    el.dispatchEvent(new Event(type))
  }

  it("settings page: shows a change made in the popup and does not overwrite it on save", async () => {
    const page = await openPage("options", createDefaultSettings("en"))
    await ready()
    page.external((s) => {
      s.autoTranslate = true
      s.targetLang = "de"
    })
    expect(check("autoTranslate").checked).toBe(true)
    expect(select("targetLang").value).toBe("de")

    edit(select("mode"), "translation-only", "change")
    await flushSave()
    expect(page.stored().mode).toBe("translation-only")
    expect(page.stored()).toMatchObject({ autoTranslate: true, targetLang: "de" })
  })

  it("settings page: a save made before the change event arrives keeps the change too", async () => {
    const page = await openPage("options", createDefaultSettings("en"))
    await ready()
    page.external((s) => (s.autoTranslate = true), false)
    edit(select("mode"), "translation-only", "change")
    await flushSave()
    expect(page.stored().mode).toBe("translation-only")
    expect(page.stored().autoTranslate).toBe(true)
    expect(check("autoTranslate").checked).toBe(true)
  })

  it("settings page: a field being edited wins over a change of the same field elsewhere", async () => {
    const page = await openPage("options", createDefaultSettings("en"))
    await ready()
    const prompt = document.querySelector<HTMLTextAreaElement>("#prompt-bilingual")!
    edit(prompt, "my prompt", "input")
    page.external((s) => {
      s.prompts.bilingual = "other prompt"
      s.tiers.machine = "microsoft-free"
    })
    expect(prompt.value).toBe("my prompt")
    expect(select("tier-machine").value).toBe("microsoft-free")
    await flushSave()
    expect(page.stored().prompts.bilingual).toBe("my prompt")
    expect(page.stored().tiers.machine).toBe("microsoft-free")
  })

  it("settings page: keeps the typed key when the popup switches the service", async () => {
    const page = await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#providerList li")).not.toBeNull())
    Array.from(document.querySelectorAll<HTMLLIElement>("#providerList li")).find((li) => li.firstChild?.textContent === "OpenAI")!.click()
    const key = document.querySelector<HTMLInputElement>('#providerPanel input[type="password"]')!
    key.focus()
    key.value = "sk-typing"
    key.dispatchEvent(new Event("input"))
    page.external((s) => (s.tiers.machine = "microsoft-free"))
    // The panel is not redrawn under the cursor.
    expect(document.querySelector('#providerPanel input[type="password"]')).toBe(key)
    expect(key.value).toBe("sk-typing")
    await flushSave()
    expect(page.stored().providers.openai.apiKey).toBe("sk-typing")
    expect(page.stored().tiers.machine).toBe("microsoft-free")
  })

  it("popup: shows a change made on the settings page and keeps other settings when it saves", async () => {
    const page = await openPage("popup", createDefaultSettings("en"))
    await vi.waitFor(() => expect(select("targetLang").options.length).toBeGreaterThan(1))
    page.external((s) => {
      s.autoTranslate = true
      s.mode = "translation-only"
      s.providers.openai = { enabled: false, apiKey: "sk-set-elsewhere", baseURL: "", model: "" }
    })
    expect(check("autoTranslate").checked).toBe(true)
    expect(document.querySelector<HTMLInputElement>('input[name="mode"][value="translation-only"]')!.checked).toBe(true)

    page.external((s) => (s.providers.openai.apiKey = "sk-newer"), false)
    select("targetLang").value = "fr"
    select("targetLang").dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(page.stored().targetLang).toBe("fr"))
    expect(page.stored().providers.openai.apiKey).toBe("sk-newer")
  })
})
