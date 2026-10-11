// @vitest-environment jsdom
/** Popup and settings page: added services, race and precise switches. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { ENGLISH } from "../src/shared/i18n"
import { createDefaultSettings } from "../src/shared/settings"
import { openPage } from "./helpers"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const optionTexts = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.value)
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("#providerPanel button")).find((b) => b.textContent === text)!

describe("popup", () => {
  it("lists only added services and links to the settings to add more", async () => {
    const s = createDefaultSettings("en")
    s.providers.openai.enabled = true
    s.providers.openai.apiKey = "sk"
    const { created } = await openPage("popup", s)
    const provider = document.querySelector<HTMLSelectElement>("#provider")!
    await vi.waitFor(() => expect(optionTexts(provider)).toEqual(["google-free", "microsoft-free", "openai"]))
    expect(document.querySelector<HTMLElement>("#aiModes")!.hidden).toBe(true)
    document.querySelector<HTMLButtonElement>("#addProvider")!.click()
    expect(created).toEqual(["moz-extension://test/options.html#providers"])
  })

  it("shows race and precise switches for an AI service", async () => {
    const s = createDefaultSettings("en")
    s.activeProviderId = "deepseek"
    s.race.enabled = true
    const { stored } = await openPage("popup", s)
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>("#aiModes")!.hidden).toBe(false))
    expect(document.querySelector<HTMLInputElement>("#raceEnabled")!.checked).toBe(true)
    const precise = document.querySelector<HTMLInputElement>("#preciseEnabled")!
    precise.checked = true
    precise.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(stored().precise.enabled).toBe(true))
  })
})

describe("settings page", () => {
  const providerList = () =>
    Array.from(document.querySelectorAll("#providerList li")).map((li) => (li.classList.contains("group") ? `# ${li.textContent}` : li.firstChild!.textContent))

  it("groups services into added and available ones", async () => {
    await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#providerPanel button")).not.toBeNull())
    const list = providerList()
    expect(list.slice(0, 4)).toEqual([`# ${ENGLISH.t("providerGroupAdded")}`, "Google Translate (free)", "Microsoft Translator (free)", `# ${ENGLISH.t("providerGroupAvailable")}`])
    expect(list).toContain("OpenAI")
    expect(optionTexts(document.querySelector<HTMLSelectElement>("#activeProvider")!)).toEqual(["google-free", "microsoft-free"])
  })

  it("does not remove the current service and explains why", async () => {
    await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(button(ENGLISH.t("buttonRemoveProvider"))).toBeDefined())
    expect(button(ENGLISH.t("buttonRemoveProvider")).disabled).toBe(true)
    expect(document.querySelector("#providerPanel .remove-hint")!.textContent).toBe(ENGLISH.t("removeBlockedActive"))
  })

  it("does not remove the fast service of race mode", async () => {
    const s = createDefaultSettings("en")
    s.activeProviderId = "microsoft-free"
    s.race.enabled = true
    await openPage("options", s)
    await vi.waitFor(() => expect(document.querySelector("#providerList li")).not.toBeNull())
    const google = Array.from(document.querySelectorAll<HTMLLIElement>("#providerList li")).find((li) => li.textContent?.startsWith("Google"))!
    google.click()
    expect(button(ENGLISH.t("buttonRemoveProvider")).disabled).toBe(true)
    expect(document.querySelector("#providerPanel .remove-hint")!.textContent).toBe(ENGLISH.t("removeBlockedRace"))
  })

  it("adds a service with the Add button or by typing its key, and removes it again", async () => {
    const { stored } = await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#providerList li")).not.toBeNull())
    const pick = (name: string) => Array.from(document.querySelectorAll<HTMLLIElement>("#providerList li")).find((li) => li.firstChild?.textContent === name)!.click()

    pick("Mistral AI")
    button(ENGLISH.t("buttonAddProvider")).click()
    expect(optionTexts(document.querySelector<HTMLSelectElement>("#activeProvider")!)).toContain("mistral")

    pick("OpenAI")
    const key = document.querySelector<HTMLInputElement>('#providerPanel input[type="password"]')!
    key.value = "sk-test"
    key.dispatchEvent(new Event("input"))
    expect(optionTexts(document.querySelector<HTMLSelectElement>("#activeProvider")!)).toContain("openai")
    expect(button(ENGLISH.t("buttonRemoveProvider")).disabled).toBe(false)
    await vi.waitFor(() => expect(stored().providers.openai.enabled).toBe(true))

    button(ENGLISH.t("buttonRemoveProvider")).click()
    expect(optionTexts(document.querySelector<HTMLSelectElement>("#activeProvider")!)).not.toContain("openai")
    await vi.waitFor(() => expect(stored().providers.openai.enabled).toBe(false))
    // The key stays, so adding the service again restores its configuration.
    expect(stored().providers.openai.apiKey).toBe("sk-test")
  })

  it("disables the thinking switch for providers without a thinking parameter", async () => {
    const s = createDefaultSettings("en")
    s.activeProviderId = "lmstudio"
    await openPage("options", s)
    await vi.waitFor(() => expect(document.querySelector("#providerPanel button")).not.toBeNull())
    const box = Array.from(document.querySelectorAll<HTMLInputElement>('#providerPanel input[type="checkbox"]'))[0]
    expect(box.disabled).toBe(true)
    expect(document.querySelector("#providerPanel")!.textContent).toContain(ENGLISH.t("hintThinkingUnsupported"))
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
    await vi.waitFor(() => expect(stored().providers["microsoft-free"]).toMatchObject({ mode: "key", apiKey: "azure-key", region: "westeurope" }))

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
    await vi.waitFor(() => expect(stored().providers["microsoft-free"].mode).toBeUndefined())
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
  const select = (id: string) => document.querySelector<HTMLSelectElement>(`#${id}`)!
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
    await vi.waitFor(() => expect(page.stored().mode).toBe("translation-only"))
    expect(page.stored()).toMatchObject({ autoTranslate: true, targetLang: "de" })
  })

  it("settings page: a save made before the change event arrives keeps the change too", async () => {
    const page = await openPage("options", createDefaultSettings("en"))
    await ready()
    page.external((s) => (s.autoTranslate = true), false)
    edit(select("mode"), "translation-only", "change")
    await vi.waitFor(() => expect(page.stored().mode).toBe("translation-only"))
    expect(page.stored().autoTranslate).toBe(true)
    expect(check("autoTranslate").checked).toBe(true)
  })

  it("settings page: a field being edited wins over a change of the same field elsewhere", async () => {
    const page = await openPage("options", createDefaultSettings("en"))
    await ready()
    const prompt = document.querySelector<HTMLTextAreaElement>("#systemPrompt")!
    edit(prompt, "my prompt", "input")
    page.external((s) => {
      s.systemPrompt = "other prompt"
      s.activeProviderId = "microsoft-free"
    })
    expect(prompt.value).toBe("my prompt")
    expect(select("activeProvider").value).toBe("microsoft-free")
    await vi.waitFor(() => expect(page.stored().systemPrompt).toBe("my prompt"))
    expect(page.stored().activeProviderId).toBe("microsoft-free")
  })

  it("settings page: keeps the typed key when the popup switches the service", async () => {
    const page = await openPage("options", createDefaultSettings("en"))
    await vi.waitFor(() => expect(document.querySelector("#providerList li")).not.toBeNull())
    Array.from(document.querySelectorAll<HTMLLIElement>("#providerList li")).find((li) => li.firstChild?.textContent === "OpenAI")!.click()
    const key = document.querySelector<HTMLInputElement>('#providerPanel input[type="password"]')!
    key.focus()
    key.value = "sk-typing"
    key.dispatchEvent(new Event("input"))
    page.external((s) => (s.activeProviderId = "microsoft-free"))
    // The panel is not redrawn under the cursor.
    expect(document.querySelector('#providerPanel input[type="password"]')).toBe(key)
    expect(key.value).toBe("sk-typing")
    await vi.waitFor(() => expect(page.stored().providers.openai.apiKey).toBe("sk-typing"))
    expect(page.stored().activeProviderId).toBe("microsoft-free")
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
