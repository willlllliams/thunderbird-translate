// @vitest-environment jsdom
/**
 * Hover texts (title attributes): every control of the popup, the settings
 * page and the setup guide has one, in the interface language and after a
 * change of it; the texts are short; a label gives its text to its control.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readLocaleSources } from "../scripts/locales.mjs"
import { ENGLISH } from "../src/shared/i18n"
import { IDLE_TAB_STATE, type TabState } from "../src/shared/messages"
import { createDefaultSettings } from "../src/shared/settings"
import { openPage, useFakeTimers } from "./helpers"

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
    await vi.waitFor(() => expect($("status").textContent).not.toBe(""))
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
    await vi.waitFor(() => expect(document.querySelector("#offlineMissing a")).not.toBeNull())
    expect(document.querySelector<HTMLElement>("#offlineMissing a")!.title).toBe(ENGLISH.t("tipOfflineDownload"))
  })

  it("writes the hover texts in the new interface language when it changes", async () => {
    const page = await popup(tabState({}))
    page.external((s) => (s.uiLanguage = "zh_CN"))
    await vi.waitFor(() => expect($("toggle").title).toBe(sources.zh_CN.tipTranslate))
    for (const [key, title] of declared()) expect(title, key).toBe(sources.zh_CN[key])
    expect($("targetLang").title).toBe(sources.zh_CN.tipTargetLang)
  })
})
