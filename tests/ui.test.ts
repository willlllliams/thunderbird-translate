// @vitest-environment jsdom
/** Popup and settings page: added services, race and precise switches. */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ENGLISH } from "../src/shared/i18n"
import { createDefaultSettings, type Settings } from "../src/shared/settings"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** Load a static page and run its script with a fake extension API holding `settings`. */
async function openPage(page: "popup" | "options", settings: Settings) {
  const html = readFileSync(join(__dirname, "..", "static", `${page}.html`), "utf8")
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML
  let stored = structuredClone(settings)
  const created: string[] = []
  const ext = {
    runtime: {
      sendMessage: vi.fn(async (req: { type: string }) => (req.type === "cacheStats" ? { size: 0 } : undefined)),
      getURL: (path: string) => `moz-extension://test/${path}`,
      openOptionsPage: vi.fn(),
    },
    tabs: { query: async () => [], create: vi.fn(async ({ url }: { url: string }) => void created.push(url)) },
    storage: {
      local: { get: async () => ({ settings: stored }), set: async (v: { settings: Settings }) => void (stored = v.settings) },
      onChanged: { addListener: () => {} },
    },
    i18n: { getUILanguage: () => "en-US" },
  }
  vi.stubGlobal("browser", ext)
  vi.stubGlobal("close", () => {})
  await (page === "popup" ? import("../src/popup/index") : import("../src/options/index"))
  return { created, stored: () => stored }
}

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
