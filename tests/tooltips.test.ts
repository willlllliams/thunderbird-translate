// @vitest-environment jsdom
/**
 * Hover texts (title attributes): every control of the popup, the settings
 * page, the setup guide and the notice inside a message has one, in the
 * interface language and after a change of it; the texts are short and all
 * in use; a label gives its text to its control.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readLocaleSources } from "../scripts/locales.mjs"
import { MissingNotice } from "../src/content/notice"
import { ENGLISH } from "../src/shared/i18n"
import { IDLE_TAB_STATE, type PortReport, type TabState } from "../src/shared/messages"
import { createDefaultSettings, toPublicSettings } from "../src/shared/settings"
import { WELCOME_KEY } from "../src/welcome/steps"
import { pagePort } from "./fixtures/browser"
import { fakeMail, messages } from "./fixtures/mail"
import { bergamotStandIn } from "./fixtures/offline"
import { jsonResponse, openPage, until, useFakeTimers } from "./helpers"

// Fake timers in every test: a page left open by a test cannot fire its timers into the next one.
beforeEach(() => useFakeTimers())

afterEach(() => vi.useRealTimers())

const root = join(__dirname, "..")
const sources = readLocaleSources() as Record<string, Record<string, string>>
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** What a user can operate: every element of these kinds needs a hover text. */
const CONTROLS = "button, select, input, textarea, a, summary"

/** Controls without a hover text, and why. */
const EXEMPT: Record<string, string> = {}

const describeEl = (el: HTMLElement) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`

/** The controls under `scope` without a hover text, apart from the exempt ones. */
function untitled(scope: ParentNode = document): string[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(CONTROLS))
    .filter((el) => !el.title.trim() && !(el.id && el.id in EXEMPT))
    .map(describeEl)
}

/** The hover texts of the elements that declare one, by key. */
const declared = () => Array.from(document.querySelectorAll<HTMLElement>("[data-i18n-title]"), (el) => [el.dataset.i18nTitle!, el.title] as const)

describe("the hover texts themselves", () => {
  const tips = Object.keys(sources.en).filter((k) => k.startsWith("tip"))
  /** Width as on screen: a CJK character takes about two Latin ones. */
  const width = (text: string) => [...text].reduce((n, c) => n + (/[⺀-鿿가-힯　-ヿ＀-￯]/.test(c) ? 2 : 1), 0)

  it("are one short sentence: at most 60 characters in English, and about as wide in every language", () => {
    expect(tips.length).toBeGreaterThan(10)
    for (const key of tips) {
      expect(sources.en[key].length, key).toBeLessThanOrEqual(60)
      for (const [locale, table] of Object.entries(sources)) {
        expect(width(table[key]), `${locale} ${key}`).toBeLessThanOrEqual(80)
        expect(table[key], `${locale} ${key}`).not.toMatch(/[.。]$/)
      }
    }
  })

  it("are all in use", () => {
    const files = (dir: string, ext: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name)
        return statSync(full).isDirectory() ? files(full, ext) : name.endsWith(ext) ? [full] : []
      })
    const code = [...files(join(root, "src"), ".ts"), ...files(join(root, "static"), ".html")].map((f) => readFileSync(f, "utf8")).join("\n")
    expect(tips.filter((key) => !code.includes(`"${key}"`))).toEqual([])
  })
})

describe("popup", () => {
  const tabState = (over: Partial<TabState>): TabState => ({ ...IDLE_TAB_STATE, connected: true, ...over })

  async function popup(state: TabState, settings = createDefaultSettings("en")) {
    const page = await openPage("popup", settings, { activeTab: { id: 3 }, respond: (req) => (req.type === "getTabState" ? state : undefined) })
    await until(() => expect($("status").textContent).not.toBe(""))
    return page
  }

  it("gives every control a hover text, the labels' texts to their controls", async () => {
    const s = createDefaultSettings("en")
    s.tiers.ai = "openai"
    await popup(tabState({ active: true, total: 3, done: 3 }), s)
    expect(untitled()).toEqual([])
    for (const [key, title] of declared()) expect(title, key).toBe(ENGLISH.t(key as never))
    expect($("tier-machine").title).toBe(ENGLISH.t("tipTierMachine"))
    expect($("autoTranslate").title).toBe(ENGLISH.t("tipAutoTranslate"))
    expect(document.querySelector<HTMLInputElement>('input[value="translation-only"]')!.title).toBe(ENGLISH.t("tipTranslationOnly"))
    // The label still names its control; the hover text is a description.
    expect($<HTMLSelectElement>("sourceLang").labels[0].querySelector("span")!.textContent).toBe(ENGLISH.t("labelSourceLang"))
    expect($("sourceLang").getAttribute("aria-label")).toBeNull()
  })

  it("says what the toggle does in each state, and explains provisional results", async () => {
    await popup(tabState({}))
    expect($("toggle").title).toBe(ENGLISH.t("tipTranslate"))
    expect($("status").title).toBe("")
    await popup(tabState({ active: true, total: 9, done: 7, provisional: 2 }))
    expect($("toggle").title).toBe(ENGLISH.t("tipShowOriginal"))
    expect($("status").title).toBe(ENGLISH.t("tipProvisional"))
  })

  it("gives the download link of the offline line a hover text", async () => {
    const s = createDefaultSettings("en")
    s.tiers.dictionary = "dictionary"
    await openPage("popup", s, { respond: (req) => (req.type === "offlineStatus" ? { dictionary: { missing: ["en>de"], unsupported: false } } : undefined) })
    await until(() => expect(document.querySelector("#offlineMissing a")).not.toBeNull())
    expect(document.querySelector<HTMLElement>("#offlineMissing a")!.title).toBe(ENGLISH.t("tipOfflineDownload"))
  })

  it("writes the hover texts in the new interface language when it changes", async () => {
    const page = await popup(tabState({}))
    page.external((s) => (s.uiLanguage = "zh_CN"))
    await until(() => expect($("toggle").title).toBe(sources.zh_CN.tipTranslate))
    for (const [key, title] of declared()) expect(title, key).toBe(sources.zh_CN[key])
    expect($("targetLang").title).toBe(sources.zh_CN.tipTargetLang)
  })
})

describe("settings page", () => {
  const INDEX = {
    version: 1,
    packs: [
      { src: "en", tgt: "de", file: "dict-en-de.tsv.gz", bytes: 700000, rawBytes: 1, entries: 50000, forms: 1, sha256: "f2".repeat(32), source: "Wiktionary", license: "CC BY-SA 4.0", attribution: "Wiktionary contributors" },
    ],
  }
  const PAIRS = [
    { src: "en", tgt: "de", version: "3.0", architecture: "base", bytes: 30_000_000, rawBytes: 1, installed: true },
    { src: "de", tgt: "en", version: "3.1", architecture: "base", bytes: 30_000_000, rawBytes: 1, installed: true, installedVersion: "3.0" },
    { src: "ja", tgt: "en", version: "3.0", architecture: "base", bytes: 30_000_000, rawBytes: 1, installed: false },
    { src: "en", tgt: "ja", version: "3.0", architecture: "base", bytes: 30_000_000, rawBytes: 1, installed: false },
    { src: "fr", tgt: "en", version: "3.0", architecture: "base", bytes: 30_000_000, rawBytes: 1, installed: false },
    { src: "en", tgt: "fr", version: "3.0", architecture: "base", bytes: 30_000_000, rawBytes: 1, installed: false },
  ]
  const pick = (name: string) => Array.from(document.querySelectorAll<HTMLLIElement>("#providerList li")).find((li) => li.firstChild?.textContent === name)!.click()
  const buttonIn = (scope: ParentNode, text: string) => Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === text)!
  const bergamotRow = (start: string) => Array.from(document.querySelectorAll<HTMLLIElement>("#bergamotList li")).find((li) => li.textContent!.startsWith(start))!

  /** The settings page with both offline lists loaded; German as target language, the AI tier with OpenAI. */
  async function settingsPage() {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const s = createDefaultSettings("en")
    s.targetLang = "de"
    s.tiers = { dictionary: "dictionary", machine: "bergamot", ai: "openai" }
    const page = await openPage("options", s, {
      fetchUrl: async () => jsonResponse(INDEX),
      // Downloads that never end.
      bergamot: bergamotStandIn(PAIRS, { install: () => new Promise(() => {}) }),
    })
    await until(() => expect(document.querySelectorAll("#bergamotList li")).toHaveLength(PAIRS.length))
    await until(() => expect(document.querySelectorAll("#dictList li")).toHaveLength(1))
    return page
  }

  it("gives every control a hover text: fields, service panels, lists, prompts, style, batching and cache", async () => {
    await settingsPage()
    expect(untitled()).toEqual([])
    for (const [key, title] of declared()) expect(title, key).toBe(ENGLISH.t(key as never))
    // The AI service panel.
    const panel = $("providerPanel")
    expect(panel.querySelector<HTMLInputElement>('input[type="password"]')!.title).toBe(ENGLISH.t("tipApiKey"))
    expect(panel.querySelector<HTMLInputElement>('input[type="number"]')!.title).toBe(ENGLISH.t("tipTemperature"))
    expect(panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!.title).toBe(ENGLISH.t("tipThinking"))
    expect(panel.querySelector<HTMLInputElement>("input[list]")!.title).toBe(ENGLISH.t("tipModel"))
    expect(panel.querySelector<HTMLInputElement>('input[type="text"]')!.title).toBe(ENGLISH.t("tipBaseUrlDefault"))
    // A service in use keeps the reason why it cannot be removed.
    expect(buttonIn(panel, ENGLISH.t("buttonRemoveProvider")).title).toBe(ENGLISH.t("removeBlockedTier", [ENGLISH.t("tierAi")]))
    // The labels and the size lines of the lists.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".tag, .dict-meta, #providerList li"))) expect(el.title, el.textContent!).not.toBe("")
    expect(document.querySelector<HTMLElement>("#dictList .dict-meta")!.title).toBe(ENGLISH.t("tipPackMeta"))
    expect(bergamotRow("German").querySelector<HTMLElement>(".dict-meta")!.title).toBe(ENGLISH.t("tipModelMeta"))
    expect(buttonIn(bergamotRow("German"), ENGLISH.t("buttonUpdate")).title).toBe(ENGLISH.t("tipUpdate"))
    const tags = Array.from(document.querySelectorAll<HTMLElement>("#bergamotList .lang-sources .tag"), (el) => [el.textContent, el.title])
    expect(tags).toContainEqual([ENGLISH.t("langSourceTarget"), ENGLISH.t("tipLangTarget")])
    expect(tags).toContainEqual([ENGLISH.t("routeDirect"), ENGLISH.t("tipRouteDirect")])
    // The filters keep their accessible name; the hover text is a description.
    expect($("dictFilter").getAttribute("aria-label")).toBe(ENGLISH.t("bergamotFilter"))
    expect($("bergamotFilter").getAttribute("aria-label")).toBe(ENGLISH.t("bergamotFilter"))
    expect($("dictReleaseTag").getAttribute("aria-label")).toBe(ENGLISH.t("labelDictTag"))
  })

  it.each([
    ["Microsoft Translator (free)", "tipMicrosoftFree"],
    ["DeepLX", "tipDeeplxUrl"],
    ["Azure OpenAI", "tipBaseUrl"],
    ["Google Translate (free)", "tipTest"],
  ] as const)("gives the panel of %s hover texts", async (name, tip) => {
    await settingsPage()
    pick(name)
    const panel = $("providerPanel")
    expect(untitled(panel)).toEqual([])
    expect(Array.from(panel.querySelectorAll<HTMLElement>("input, button"), (el) => el.title)).toContain(ENGLISH.t(tip))
  })

  it("gives the Azure fields and the endpoint warning hover texts", async () => {
    await settingsPage()
    pick("Microsoft Translator (free)")
    const panel = $("providerPanel")
    panel.querySelector<HTMLInputElement>('input[value="key"]')!.click()
    expect(untitled(panel)).toEqual([])
    expect(panel.querySelector<HTMLInputElement>('input[placeholder="westeurope"]')!.title).toBe(ENGLISH.t("tipRegion"))
    pick("OpenAI")
    const endpoint = $("providerPanel").querySelector<HTMLInputElement>('input[type="text"]')!
    endpoint.value = "api.openai.com"
    endpoint.dispatchEvent(new Event("change"))
    expect(buttonIn($("providerPanel"), ENGLISH.t("buttonRestoreBaseUrl")).title).toBe(ENGLISH.t("tipRestoreBaseUrl"))
    expect(untitled($("providerPanel"))).toEqual([])
  })

  it("gives the buttons of a service not added and of one added hover texts", async () => {
    await settingsPage()
    pick("DeepLX")
    expect(buttonIn($("providerPanel"), ENGLISH.t("buttonAddProvider")).title).toBe(ENGLISH.t("tipAdd"))
    pick("Microsoft Translator (free)")
    expect(buttonIn($("providerPanel"), ENGLISH.t("buttonUse")).title).toBe(ENGLISH.t("tipUse"))
    expect(buttonIn($("providerPanel"), ENGLISH.t("buttonRemoveProvider")).title).toBe(ENGLISH.t("tipRemove"))
  })

  it("gives the rows of downloads, the queue, the common languages and the delete confirmation hover texts", async () => {
    await settingsPage()
    buttonIn($("bergamotCommon"), ENGLISH.t("buttonDownloadCommon")).click()
    expect(buttonIn($("bergamotCommon"), ENGLISH.t("buttonConfirmDownload")).title).toBe(ENGLISH.t("tipConfirmDownload"))
    expect(buttonIn($("bergamotCommon"), ENGLISH.t("buttonCancel")).title).toBe(ENGLISH.t("tipCancelCommon"))
    expect(untitled()).toEqual([])
    buttonIn($("bergamotCommon"), ENGLISH.t("buttonConfirmDownload")).click()
    // Two run, the others wait for their turn.
    const waiting = () => Array.from(document.querySelectorAll<HTMLElement>("#bergamotList li span")).filter((el) => el.textContent === ENGLISH.t("dictQueued"))
    await until(() => expect(waiting().length).toBeGreaterThan(0))
    for (const el of waiting()) expect(el.title).toBe(ENGLISH.t("tipWaiting"))
    const titles = () => Array.from(document.querySelectorAll<HTMLButtonElement>("#bergamotList button"), (b) => b.title)
    expect(titles()).toContain(ENGLISH.t("tipCancelQueued"))
    // The background script reports which ones run.
    await until(() => expect(titles()).toContain(ENGLISH.t("tipCancelDownload")))
    expect(untitled()).toEqual([])
    // English → German is what the languages need: deleting it asks first.
    buttonIn(bergamotRow("English"), ENGLISH.t("buttonDelete")).click()
    expect(buttonIn(bergamotRow("English"), ENGLISH.t("buttonDeleteAnyway")).title).toBe(ENGLISH.t("tipDeleteAnyway"))
    expect(buttonIn(bergamotRow("English"), ENGLISH.t("buttonCancel")).title).toBe(ENGLISH.t("tipKeepModel"))
    expect(untitled()).toEqual([])
  })

  it("writes the hover texts in the new interface language, also those of the panel and the lists", async () => {
    await settingsPage()
    const ui = $<HTMLSelectElement>("uiLanguage")
    ui.value = "zh_TW"
    ui.dispatchEvent(new Event("change"))
    await until(() => expect($("clearCache").title).toBe(sources.zh_TW.tipClearCache))
    for (const [key, title] of declared()) expect(title, key).toBe(sources.zh_TW[key])
    expect($("batchDelayMs").title).toBe(sources.zh_TW.tipBatchDelay)
    expect(buttonIn($("providerPanel"), sources.zh_TW.buttonTest).title).toBe(sources.zh_TW.tipTest)
    expect(document.querySelector<HTMLElement>("#dictList .dict-meta")!.title).toBe(sources.zh_TW.tipPackMeta)
    expect(document.querySelector<HTMLElement>("#providerList li:not(.group)")!.title).toBe(sources.zh_TW.tipProviderItem)
    expect(untitled()).toEqual([])
  })
})

describe("setup guide", () => {
  const INDEX = {
    version: 1,
    packs: [
      { src: "en", tgt: "zh-Hans", file: "d.tsv.gz", bytes: 700000, rawBytes: 1, entries: 50000, forms: 1, sha256: "f2".repeat(32), source: "ECDICT", license: "MIT", attribution: "ECDICT" },
      { src: "fr", tgt: "en", file: "e.tsv.gz", bytes: 700000, rawBytes: 1, entries: 50000, forms: 1, sha256: "f2".repeat(32), source: "Wiktionary", license: "CC BY-SA 4.0", attribution: "Wiktionary" },
    ],
  }
  const pair = (src: string, tgt: string) => ({ src, tgt, version: "1", architecture: "base", bytes: 30e6, rawBytes: 1, installed: false })
  const current = () => document.querySelector<HTMLElement>("section.step:not([hidden])")?.dataset.step
  const stepButton = (n: number) => document.querySelectorAll<HTMLButtonElement>("#stepList button")[n]

  /** The guide with every step needed: the dictionary, Google and OpenAI in the tiers; the trial answered by a fake port. */
  async function guide(step = "language") {
    vi.stubGlobal("indexedDB", new IDBFactory())
    const s = createDefaultSettings("en")
    s.targetLang = "zh-CN"
    s.tiers = { dictionary: "dictionary", machine: "google-free", ai: "openai" }
    const port = pagePort()
    port.postMessage.mockImplementation((m: PortReport) => {
      if (m.type !== "translate") return
      queueMicrotask(() => {
        for (const tier of m.request.tiers) port.push({ type: "tier", id: m.id, tier, result: { ok: true, text: `[zh] ${m.request.text}` } })
        port.push({ type: "done", id: m.id })
      })
    })
    const page = await openPage("welcome", s, {
      stored: { [WELCOME_KEY]: { step } },
      connect: () => port,
      fetchUrl: async () => jsonResponse(INDEX),
      bergamot: bergamotStandIn([pair("fr", "en"), pair("en", "zh-Hans")]),
    })
    await until(() => expect(current()).toBe(step))
    return { page, s, port }
  }

  it("gives every control of every step a hover text", async () => {
    await guide()
    // Walk through the steps with the numbered list: each step draws its own parts on entering.
    for (let i = 0; i < 8; i++) {
      stepButton(i).click()
      await until(() => expect(stepButton(i).getAttribute("aria-current")).toBe("step"))
      if (current() === "offline") await until(() => expect(document.querySelectorAll("#dictList li, #bergamotList li")).toHaveLength(4))
      expect(untitled(), current()).toEqual([])
    }
    for (const [key, title] of declared()) expect(title, key).toBe(ENGLISH.t(key as never))
    expect(document.querySelector<HTMLInputElement>("#dictList input[type=checkbox]")!.title).toBe(ENGLISH.t("tipPickItem"))
    expect($("aiService").title).toBe(ENGLISH.t("tipAiService"))
    expect($("aiPanel").querySelector<HTMLInputElement>('input[type="password"]')!.title).toBe(ENGLISH.t("tipApiKey"))
    expect($("dictFilter").getAttribute("aria-label")).toBe(ENGLISH.t("bergamotFilter"))
    expect(stepButton(0).title).toBe(ENGLISH.t("tipStep"))
    // The last step finishes the guide.
    expect($("nextStep").title).toBe(ENGLISH.t("tipFinish"))
  })

  it("says what Next, the tour and the trial button do in each state", async () => {
    const { s, port } = await guide("tiers")
    expect($("nextStep").title).toBe(ENGLISH.t("tipNext"))
    expect($("tourNext").title).toBe(ENGLISH.t("tipTourNext"))
    $("tourNext").click()
    $("tourNext").click()
    expect($("tourNext").title).toBe(ENGLISH.t("tipTourEnd"))
    stepButton(7).click()
    await until(() => expect(current()).toBe("finish"))
    expect($("tryIt").title).toBe(ENGLISH.t("tipTryIt"))
    $("tryIt").click()
    expect($("tryIt").title).toBe(ENGLISH.t("tipShowOriginal"))
    port.push({ type: "settings", settings: toPublicSettings(s) })
    await until(() => expect(document.querySelectorAll("#trySample .tt-translation")).toHaveLength(4))
    $("tryIt").click()
    expect($("tryIt").title).toBe(ENGLISH.t("tipTryIt"))
  })

  it("marks a skipped step with the reason", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory())
    await openPage("welcome", createDefaultSettings("en"))
    await until(() => expect(current()).toBe("language"))
    expect(stepButton(3).disabled).toBe(true)
    expect(stepButton(3).title).toBe(ENGLISH.t("stepNotNeeded"))
  })

  it("writes the hover texts in the new interface language, also those drawn by the page", async () => {
    const { s, port } = await guide("finish")
    $("tryIt").click()
    port.push({ type: "settings", settings: toPublicSettings(s) })
    await until(() => expect(document.querySelectorAll("#trySample .tt-translation")).toHaveLength(4))
    const ui = $<HTMLSelectElement>("uiLanguage")
    ui.value = "ja"
    ui.dispatchEvent(new Event("change"))
    await until(() => expect(document.documentElement.lang).toBe("ja"))
    for (const [key, title] of declared()) {
      if (key !== "tipTryIt") expect(title, key).toBe(sources.ja[key])
    }
    expect($("tryIt").title).toBe(sources.ja.tipShowOriginal)
    expect($("nextStep").title).toBe(sources.ja.tipFinish)
    expect(stepButton(0).title).toBe(sources.ja.tipStep)
    expect($("autoTranslate").title).toBe(sources.ja.tipAutoTranslate)
  })
})

describe("inside a message", () => {
  it("gives every control of the notice about missing downloads a hover text", () => {
    document.body.innerHTML = "<p>Text</p>"
    const notice = new MissingNotice({ root: () => document.body, muted: () => [], send: () => {} })
    notice.begin()
    notice.add({ service: "dictionary", pair: "ja>zh-Hans", models: ["ja>en"] })
    notice.end()
    const panel = document.querySelector<HTMLElement>(".tt-notice")!
    expect(untitled(panel)).toEqual([])
    expect(Array.from(panel.querySelectorAll<HTMLElement>("button, input"), (el) => el.title)).toEqual([
      ENGLISH.t("tipNoticeOpen"),
      ENGLISH.t("tipNoticeMute"),
      ENGLISH.t("tipNoticeClose"),
    ])
    // The words of the check box show the hover text too.
    expect(panel.querySelector("label")!.title).toBe(ENGLISH.t("tipNoticeMute"))
  })
})

describe("page of translated subjects", () => {
  it("gives every control and every row a hover text", async () => {
    const mail = fakeMail({ folders: { Inbox: messages(150) } })
    const port = pagePort()
    const s = createDefaultSettings("en")
    s.onlineConsent = ["google-free@translate.googleapis.com"]
    await openPage("subjects", s, { connect: () => port, api: mail.api })
    await until(() => expect(document.querySelectorAll("#rows tr")).toHaveLength(100))
    expect(untitled()).toEqual([])
    for (const [key, title] of declared()) expect(title, key).toBe(ENGLISH.t(key as never))
    expect(Array.from(document.querySelectorAll<HTMLElement>("#rows tr"), (tr) => tr.title)).toEqual(Array(100).fill(ENGLISH.t("tipSubjectsRow")))
  })
})
