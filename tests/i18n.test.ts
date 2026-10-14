// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { checkLocales, literalTokens, placeholderNumbers, readLocaleSources, toMessagesJson } from "../scripts/locales.mjs"
import { describeError, LocalizedError } from "../src/shared/errors"
import {
  compileMessagesJson,
  EN_MESSAGES,
  ENGLISH,
  formatMessage,
  I18n,
  loadI18n,
  type MessageKey,
} from "../src/shared/i18n"
import { linkedText, localizeDocument, MESSAGE_LINKS } from "../src/shared/i18n-dom"
import {
  isUiLocale,
  LOCALE_NATIVE_NAMES,
  localeToLanguageTag,
  matchUiLocale,
  resolveUiLocale,
  SUPPORTED_LOCALES,
  textDirection,
  type UiLocale,
} from "../src/shared/locales"
import { getLanguage, LANGUAGES } from "../src/shared/languages"
import { PROVIDER_PRESETS, providerDisplayName } from "../src/shared/providers"
import { defaultTargetLang, normalizeSettings } from "../src/shared/settings"
import { packagedFetch } from "./fixtures/locales"

const root = join(__dirname, "..")
const sources = readLocaleSources()
const en = sources.en
const enKeys = Object.keys(en)

function i18nFor(locale: UiLocale): I18n {
  return new I18n(locale, compileMessagesJson(toMessagesJson(sources[locale])))
}

/* ---------- locale files ---------- */

describe("locale files", () => {
  it("exist for exactly the supported locales", () => {
    expect(Object.keys(sources).sort()).toEqual([...SUPPORTED_LOCALES].sort())
    expect(SUPPORTED_LOCALES).toHaveLength(12)
    for (const l of SUPPORTED_LOCALES) expect(LOCALE_NATIVE_NAMES[l]).toBeTruthy()
  })

  it("pass the build-time check", () => {
    expect(checkLocales(sources)).toEqual([])
  })

  it("en.json is what the runtime bundles", () => {
    expect(EN_MESSAGES).toEqual(en)
  })

  describe.each(SUPPORTED_LOCALES.filter((l) => l !== "en"))("%s", (locale) => {
    const table = sources[locale]

    it("has the same key set as en", () => {
      expect(Object.keys(table).sort()).toEqual([...enKeys].sort())
    })

    it("has no empty values", () => {
      for (const key of enKeys) expect(typeof table[key] === "string" && table[key].trim().length > 0, key).toBe(true)
    })

    it("uses the same placeholders and literal tokens as en", () => {
      for (const key of enKeys) {
        expect(placeholderNumbers(table[key]), key).toEqual(placeholderNumbers(en[key]))
        expect(literalTokens(table[key]), key).toEqual(literalTokens(en[key]))
      }
    })

    it("keeps the sample original sentence in English and translates the sample translation", () => {
      expect(table.stylePreviewOriginal).toBe(en.stylePreviewOriginal)
      expect(table.stylePreviewTranslation).not.toBe(en.stylePreviewOriginal)
    })
  })

  it("survive the messages.json round trip unchanged", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const json = toMessagesJson(sources[locale])
      expect(compileMessagesJson(json)).toEqual(sources[locale])
      for (const entry of Object.values(json)) {
        // WebExtension format: named placeholders only.
        expect(entry.message).not.toMatch(/\$[1-9]/)
      }
    }
  })

  it("are referenced from the sources (no dead keys)", () => {
    const corpus = [
      ...listFiles(join(root, "src"), ".ts").map((f) => readFileSync(f, "utf8")),
      readFileSync(join(root, "static", "manifest.json"), "utf8"),
      readFileSync(join(root, "static", "options.html"), "utf8"),
      readFileSync(join(root, "static", "popup.html"), "utf8"),
      readFileSync(join(root, "static", "welcome.html"), "utf8"),
    ].join("\n")
    const unused = enKeys.filter((k) => !new RegExp(`["_]${k}["_]`).test(corpus))
    expect(unused).toEqual([])
  })
})

/* ---------- manifest ---------- */

describe("manifest", () => {
  const manifest = JSON.parse(readFileSync(join(root, "static", "manifest.json"), "utf8"))

  it("uses __MSG_*__ for every user-visible field", () => {
    const fields = [
      manifest.name,
      manifest.description,
      manifest.message_display_action.default_title,
      ...Object.values(manifest.commands as Record<string, { description: string }>).map((c) => c.description),
    ]
    for (const f of fields) expect(f).toMatch(/^__MSG_\w+__$/)
  })

  it("references only existing keys", () => {
    const refs = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((m) => m[1])
    expect(refs.length).toBeGreaterThanOrEqual(5)
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of refs) expect(sources[locale][key], `${locale}:${key}`).toBeTruthy()
    }
    expect(manifest.default_locale).toBe("en")
  })
})

/* ---------- language mapping ---------- */

describe("matchUiLocale", () => {
  it.each([
    ["en-US", "en"],
    ["en-GB", "en"],
    ["zh-CN", "zh_CN"],
    ["zh", "zh_CN"],
    ["zh-SG", "zh_CN"],
    ["zh-Hans-CN", "zh_CN"],
    ["zh-TW", "zh_TW"],
    ["zh-HK", "zh_TW"],
    ["zh-MO", "zh_TW"],
    ["zh-Hant", "zh_TW"],
    ["zh_TW", "zh_TW"],
    ["ja", "ja"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["fr-CA", "fr"],
    ["de-AT", "de"],
    ["es-ES", "es"],
    ["es-419", "es"],
    ["pt-BR", "pt_BR"],
    ["pt-PT", "pt_BR"],
    ["ru", "ru"],
    ["tr", "tr"],
    ["vi", "vi"],
    ["it", "en"],
    ["ar", "en"],
    ["", "en"],
  ])("%s → %s", (tag, expected) => {
    expect(matchUiLocale(tag)).toBe(expected)
  })

  it("handles missing input", () => {
    expect(matchUiLocale(undefined)).toBe("en")
    expect(matchUiLocale(null)).toBe("en")
  })

  it("lets an explicit setting win over Thunderbird's language", () => {
    expect(resolveUiLocale("auto", "de-DE")).toBe("de")
    expect(resolveUiLocale("ja", "de-DE")).toBe("ja")
    expect(resolveUiLocale("xx", "ko")).toBe("ko")
    expect(isUiLocale("pt_BR")).toBe(true)
    expect(isUiLocale("pt-BR")).toBe(false)
  })

  it("gives language tags and direction for <html>", () => {
    expect(localeToLanguageTag("zh_TW")).toBe("zh-TW")
    expect(localeToLanguageTag("pt_BR")).toBe("pt-BR")
    expect(textDirection("ar")).toBe("rtl")
    for (const l of SUPPORTED_LOCALES) expect(textDirection(localeToLanguageTag(l))).toBe("ltr")
  })
})

/* ---------- runtime ---------- */

describe("i18n runtime", () => {
  it("substitutes placeholders, including reordered ones and $$", () => {
    expect(formatMessage("$2 of $1", ["a", "b"])).toBe("b of a")
    expect(formatMessage("cost: $$5, $1", ["x"])).toBe("cost: $5, x")
    expect(formatMessage("missing $3", ["a"])).toBe("missing ")
    expect(formatMessage("$1", ["$2"])).toBe("$2")
  })

  it("reads named placeholders of messages.json", () => {
    const table = compileMessagesJson({
      a: { message: "Done $DONE$ / $Total$", placeholders: { done: { content: "$1" }, total: { content: "$2" } } },
      b: { message: "plain" },
      c: { nope: true },
    })
    expect(table).toEqual({ a: "Done $1 / $2", b: "plain" })
  })

  it("translates with the loaded locale", () => {
    const zh = i18nFor("zh_CN")
    expect(zh.t("popupProgress", [3, 12])).toBe("已翻译 3 / 12")
    expect(zh.lang).toBe("zh-CN")
    expect(ENGLISH.t("popupProgress", [3, 12])).toBe("Translated 3 of 12")
  })

  it("formats numbers for the locale", () => {
    expect(i18nFor("de").t("cacheCount", [12345])).toContain("12.345")
    expect(ENGLISH.t("cacheCount", [12345])).toContain("12,345")
  })

  it("falls back to English for missing or empty keys, then to the key", () => {
    const partial = new I18n("ja", { popupIdle: "未翻訳", saved: "" })
    expect(partial.t("popupIdle")).toBe("未翻訳")
    expect(partial.t("saved")).toBe(en.saved)
    expect(partial.t("buttonTest")).toBe(en.buttonTest)
    expect(partial.t("noSuchKey" as MessageKey)).toBe("noSuchKey")
  })

  it("loads the locale chosen by the setting and Thunderbird's language", async () => {
    const requested: string[] = []
    const fetchMessages = async (locale: UiLocale) => {
      requested.push(locale)
      return toMessagesJson(sources[locale])
    }
    expect((await loadI18n("auto", "ja-JP", fetchMessages)).t("popupSettings")).toBe(sources.ja.popupSettings)
    expect((await loadI18n("fr", "ja-JP", fetchMessages)).locale).toBe("fr")
    expect((await loadI18n("auto", "en-US", fetchMessages)).locale).toBe("en")
    expect(requested).toEqual(["ja", "fr"])
  })

  it("falls back to English when the locale file cannot be read", async () => {
    const failing = await loadI18n("ko", "en", async () => {
      throw new Error("404")
    })
    expect(failing.locale).toBe("en")
    expect(failing.t("popupSettings")).toBe("Settings")
    const empty = await loadI18n("ko", "en", async () => ({}))
    expect(empty.locale).toBe("en")
  })

  it("names target languages in the interface language with the native name", () => {
    expect(ENGLISH.languageName("ja", "日本語")).toBe("Japanese (日本語)")
    expect(ENGLISH.languageName("zh-CN", "简体中文")).toBe("Simplified Chinese (简体中文)")
    expect(ENGLISH.languageName("en", "English")).toBe("English")
    const zh = i18nFor("zh_CN")
    expect(zh.languageName("ja", "日本語")).toBe("日语（日本語）")
    expect(zh.languageName("zh-CN", "简体中文")).toBe("简体中文")
  })

  it("translates provider suffixes but not brand names", () => {
    const zh = i18nFor("zh_CN")
    const google = PROVIDER_PRESETS.find((p) => p.id === "google-free")!
    const openai = PROVIDER_PRESETS.find((p) => p.id === "openai")!
    expect(providerDisplayName(google, ENGLISH)).toBe("Google Translate (free)")
    expect(providerDisplayName(google, zh)).toBe("Google Translate（免费）")
    expect(providerDisplayName(openai, zh)).toBe("OpenAI")
    for (const locale of SUPPORTED_LOCALES) {
      expect(providerDisplayName(google, i18nFor(locale))).toContain("Google Translate")
    }
  })

  it("localizes errors that carry a key and keeps others as they are", () => {
    const error = new LocalizedError("errApiKeyRequired", ["OpenAI"])
    expect(error.message).toBe("OpenAI: API key is required")
    expect(describeError(error, i18nFor("zh_CN"))).toBe("OpenAI：缺少 API 密钥")
    expect(describeError({ i18nText: { key: "errHttp", args: ["DeepLX", "500"], detail: "boom" } }, i18nFor("zh_CN"))).toBe(
      "DeepLX 请求失败：HTTP 500 - boom",
    )
    expect(describeError(new Error("raw"), i18nFor("de"))).toBe("raw")
    expect(describeError("text", ENGLISH)).toBe("text")
  })
})

/* ---------- settings ---------- */

describe("settings", () => {
  it("default target language follows the interface language", () => {
    expect(defaultTargetLang("ja")).toBe("ja")
    expect(defaultTargetLang("de-DE")).toBe("de")
    expect(defaultTargetLang("pt-BR")).toBe("pt")
    expect(defaultTargetLang("zh-CN")).toBe("zh-CN")
    expect(defaultTargetLang("zh-HK")).toBe("zh-TW")
    expect(defaultTargetLang("en-US")).toBe("en")
    expect(defaultTargetLang("sv-SE")).toBe("en")
    expect(defaultTargetLang(undefined)).toBe("en")
  })

  it("does not overwrite an existing target language and normalizes the interface language", () => {
    expect(normalizeSettings({ targetLang: "fr" }, "ja").targetLang).toBe("fr")
    expect(normalizeSettings(undefined, "ja").targetLang).toBe("ja")
    expect(normalizeSettings(undefined, "ja").uiLanguage).toBe("auto")
    expect(normalizeSettings({ uiLanguage: "ko" }, "ja").uiLanguage).toBe("ko")
    expect(normalizeSettings({ uiLanguage: "klingon" }, "ja").uiLanguage).toBe("auto")
  })
})

/* ---------- no hard-coded interface text ---------- */

function listFiles(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, ext))
    else if (name.endsWith(ext)) out.push(full)
  }
  return out
}

describe("no hard-coded interface text", () => {
  for (const page of ["popup.html", "options.html", "welcome.html"]) {
    describe(page, () => {
      const doc = new DOMParser().parseFromString(readFileSync(join(root, "static", page), "utf8"), "text/html")

      it("has no bare text nodes", () => {
        const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT)
        const bare: string[] = []
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const parent = n.parentElement?.tagName
          if (parent === "SCRIPT" || parent === "STYLE") continue
          if (n.textContent?.trim()) bare.push(n.textContent.trim())
        }
        expect(bare).toEqual([])
      })

      it("has no literal title, placeholder, aria-label or alt text", () => {
        for (const attr of ["title", "placeholder", "aria-label", "alt"]) {
          for (const el of Array.from(doc.querySelectorAll(`[${attr}]`))) {
            expect(el.getAttribute(attr), `${el.tagName} ${attr}`).toBe("")
          }
        }
      })

      it("references only existing keys", () => {
        const keys = Array.from(doc.querySelectorAll("*")).flatMap((el) =>
          Object.entries((el as HTMLElement).dataset)
            .filter(([k]) => k.startsWith("i18n"))
            .map(([, v]) => v ?? ""),
        )
        expect(keys.length).toBeGreaterThan(5)
        for (const key of keys) expect(en[key], key).toBeTruthy()
      })

      it("is fully localized by localizeDocument, including <html lang dir>", () => {
        const copy = new DOMParser().parseFromString(readFileSync(join(root, "static", page), "utf8"), "text/html")
        localizeDocument(i18nFor("ja"), copy)
        expect(copy.documentElement.lang).toBe("ja")
        expect(copy.documentElement.dir).toBe("ltr")
        for (const el of Array.from(copy.querySelectorAll<HTMLElement>("[data-i18n]"))) {
          const key = el.dataset.i18n! as MessageKey
          // The substitutions of a message with links are the names of the links.
          const names = (MESSAGE_LINKS[key] ?? []).map((link) => link.name)
          expect(el.textContent).toBe(formatMessage(sources.ja[key], names))
          expect(Array.from(el.querySelectorAll("a"), (a) => a.textContent)).toEqual(names)
        }
      })
    })
  }

  // The test-build hooks under src/e2e are stripped from release builds and never show anything to the user.
  const sourceFiles = listFiles(join(root, "src"), ".ts").filter((f) => !/[\\/]src[\\/]e2e[\\/]/.test(f))
  const code = (file: string) =>
    readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")

  it("TypeScript sources do not assign literal text to the DOM", () => {
    const patterns = [
      /\.(textContent|innerText|innerHTML|title|placeholder)\s*\+?=\s*["'`][^"'`]*[A-Za-z]{2}/,
      /\btext:\s*["'`][^"'`]*[A-Za-z]{2}/,
      /setAttribute\(\s*["'](title|placeholder|aria-label|alt)["']\s*,\s*["'`][^"'`]*[A-Za-z]{2}/,
      /new Option\(\s*["'`][^"'`]*[A-Za-z]{2}/,
    ]
    const hits = sourceFiles.flatMap((f) =>
      code(f)
        .split("\n")
        .filter((line) => patterns.some((p) => p.test(line)))
        // CSS custom properties written into a <style> element.
        .filter((line) => !line.includes("style.textContent = `:root{"))
        .map((line) => `${f}: ${line.trim()}`),
    )
    expect(hits).toEqual([])
  })

  it("TypeScript sources contain no CJK text outside the name tables", () => {
    // Product names, language self-names, script detection, the examples inside prompt rules and the reply prefixes of subjects are data, not interface text.
    const allowed = ["providers.ts", "languages.ts", "locales.ts", "lang-detect.ts", "prompt-presets.ts", "subject.ts"]
    const hits = sourceFiles
      .filter((f) => !allowed.some((a) => f.endsWith(a)))
      .filter((f) => /[぀-ヿ㐀-鿿가-힯]/.test(code(f)))
    expect(hits).toEqual([])
  })

  it("errors are thrown as LocalizedError or carry a translatable text", () => {
    const hits = sourceFiles.flatMap((f) =>
      code(f)
        .split("\n")
        .filter((line) => /throw new Error\(\s*["'`]/.test(line))
        .map((line) => `${f}: ${line.trim()}`),
    )
    // Only internal errors that never reach the interface remain plain; the offline engine wraps its own in a LocalizedError as detail.
    const internal = ["Batch executor returned", "throw new Error(`HTTP ${resp.status}`)"]
    expect(hits.filter((h) => !internal.some((i) => h.includes(i)) && !/offline[\\/]bergamot/.test(h))).toEqual([])
  })

  it("nothing reads interface text through browser.i18n.getMessage", () => {
    const hits = sourceFiles.filter((f) => /getMessage\s*\(/.test(code(f)))
    expect(hits).toEqual([])
  })
})

/* ---------- edge cases of the runtime ---------- */

describe("i18n runtime edge cases", () => {
  it("reads only message entries and keeps $$ and unknown placeholders", () => {
    expect(compileMessagesJson(null)).toEqual({})
    expect(compileMessagesJson("text")).toEqual({})
    expect(compileMessagesJson({ a: { message: "$$5 for $X$ and $Y$", placeholders: { x: { content: "$1" }, y: { content: 2 } } }, b: null })).toEqual({
      a: "$$5 for $1 and $Y$",
    })
  })

  it("takes a single substitution without a list and formats it as a number", () => {
    expect(ENGLISH.t("popupFailed", 1500)).toBe(ENGLISH.t("popupFailed", ["1,500"]))
    expect(ENGLISH.t("popupFailed", "many")).toBe(ENGLISH.t("popupFailed", ["many"]))
  })

  it("prints numbers and language names plainly when Intl does not know the language", () => {
    const broken = new I18n("x_" as UiLocale, { cacheCount: "$1 entries" })
    expect(broken.lang).toBe("x-")
    expect(broken.t("cacheCount", [12345])).toBe("12345 entries")
    expect(broken.languageName("ja", "日本語")).toBe("日本語")
    expect(ENGLISH.languageName("not a code", "Native")).toBe("Native")
  })

  it("falls back to the first language for an unknown code", () => {
    expect(getLanguage("de").english).toBe("German")
    expect(getLanguage("xx")).toBe(LANGUAGES[0])
  })
})

describe("localizeDocument", () => {
  it("fills text, placeholder, title and aria-label and sets <html lang dir>", () => {
    const doc = new DOMParser().parseFromString(
      '<p data-i18n="saved"></p><input data-i18n-placeholder="bergamotFilter"><button data-i18n-title="buttonTest" data-i18n-aria-label="buttonTest"></button>',
      "text/html",
    )
    localizeDocument(i18nFor("ja"), doc)
    expect(doc.querySelector("p")!.textContent).toBe(sources.ja.saved)
    expect(doc.querySelector("input")!.placeholder).toBe(sources.ja.bergamotFilter)
    expect(doc.querySelector("button")!.title).toBe(sources.ja.buttonTest)
    expect(doc.querySelector("button")!.getAttribute("aria-label")).toBe(sources.ja.buttonTest)
    localizeDocument(new I18n("en", { saved: "Saved" }), doc)
    expect(doc.documentElement.lang).toBe("en")
  })

  it("puts the license links into the dictionary attribution, with their hover text, in every language", () => {
    const doc = new DOMParser().parseFromString('<p data-i18n="dictionaryAttribution"></p>', "text/html")
    for (const locale of Object.keys(sources) as UiLocale[]) {
      localizeDocument(i18nFor(locale), doc)
      const p = doc.querySelector("p")!
      const links = Array.from(p.querySelectorAll("a"), (a) => [a.textContent, a.href, a.target, a.rel, a.title])
      expect(links, locale).toEqual([
        ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", "_blank", "noopener noreferrer", sources[locale].tipLicenseText],
        ["MIT", "https://github.com/skywind3000/ECDICT/blob/master/LICENSE", "_blank", "noopener noreferrer", sources[locale].tipLicenseText],
      ])
      expect(p.textContent, locale).toContain("Wiktionary")
      expect(p.textContent, locale).toContain("Copyright (c) 2025 Linwei")
    }
  })

  it("builds the text around the links as text nodes: markup in a message stays text", () => {
    const i18n = new I18n("en", { dictionaryAttribution: '<img src=x onerror="alert(1)"> $1 & <b>$2</b>', tipLicenseText: "Opens" })
    const nodes = linkedText("dictionaryAttribution", [{ name: "<i>L</i>", href: "https://example.com/l" }, { name: "M", href: "https://example.com/m" }], i18n, document)
    expect(nodes.map((n) => [n.nodeName, n.textContent])).toEqual([
      ["#text", '<img src=x onerror="alert(1)"> '],
      ["A", "<i>L</i>"],
      ["#text", " & <b>"],
      ["A", "M"],
      ["#text", "</b>"],
    ])
    const p = document.createElement("p")
    p.append(...nodes)
    expect(p.querySelectorAll("img, b, i")).toHaveLength(0)
  })

  it("gives the title of a <label> to its control as well, and a later control title wins", () => {
    const doc = new DOMParser().parseFromString(
      '<label id="a" data-i18n-title="saved"><span></span><select></select></label><label id="b" data-i18n-title="saved"><input type="checkbox" data-i18n-title="buttonTest"></label><label id="c" data-i18n-title="saved"><span></span></label>',
      "text/html",
    )
    localizeDocument(i18nFor("ja"), doc)
    expect(doc.querySelector<HTMLElement>("#a")!.title).toBe(sources.ja.saved)
    expect(doc.querySelector("select")!.title).toBe(sources.ja.saved)
    expect(doc.querySelector("input")!.title).toBe(sources.ja.buttonTest)
    expect(doc.querySelector<HTMLElement>("#c")!.title).toBe(sources.ja.saved)
  })
})

describe("extension glue", () => {
  afterEach(() => {
    vi.resetModules()
  })

  async function glue(getUILanguage: () => string, fetchImpl: (url: string) => Promise<Response>) {
    vi.stubGlobal("browser", { i18n: { getUILanguage }, runtime: { getURL: (p: string) => `moz-extension://test/${p}` } })
    vi.stubGlobal("fetch", fetchImpl)
    vi.resetModules()
    return { ext: await import("../src/shared/i18n-ext"), i18n: await import("../src/shared/i18n") }
  }

  it("loads the packaged messages of Thunderbird's language and makes them current", async () => {
    const { ext, i18n } = await glue(() => "zh-TW", packagedFetch())
    expect(ext.thunderbirdUiLanguage()).toBe("zh-TW")
    const loaded = await ext.loadExtensionI18n("auto")
    expect(loaded.locale).toBe("zh_TW")
    expect(i18n.getI18n()).toBe(loaded)
    expect(i18n.t("popupSettings")).toBe(sources.zh_TW.popupSettings)
    expect(fetch).toHaveBeenCalledWith("moz-extension://test/_locales/zh_TW/messages.json")
  })

  it("uses English when the file is missing or Thunderbird's language is unavailable", async () => {
    const { ext } = await glue(
      () => {
        throw new Error("not available")
      },
      vi.fn(async () => new Response("", { status: 404 })),
    )
    expect(ext.thunderbirdUiLanguage()).toBe("en")
    await expect(ext.fetchPackagedMessages("de")).rejects.toThrow("HTTP 404")
    expect((await ext.loadExtensionI18n("de")).locale).toBe("en")
  })
})

describe("keyboard shortcuts", () => {
  const manifest = JSON.parse(readFileSync(join(root, "static", "manifest.json"), "utf8"))
  const commands = manifest.commands as Record<string, { suggested_key: { default: string }; description: string }>

  it("describe the three commands with their own keys", () => {
    expect(Object.fromEntries(Object.entries(commands).map(([id, c]) => [id, c.description]))).toEqual({
      "toggle-translation": "__MSG_commandToggle__",
      "toggle-display-mode": "__MSG_commandMode__",
      retranslate: "__MSG_commandRetranslate__",
    })
    expect(new Set(Object.values(commands).map((c) => c.suggested_key.default))).toEqual(new Set(["Alt+A", "Alt+S", "Alt+R"]))
  })

  it.each(SUPPORTED_LOCALES)("%s: names the suggested keys in the popup hint and describes each command", (locale) => {
    for (const c of Object.values(commands)) expect(sources[locale].popupShortcuts).toContain(c.suggested_key.default)
    const descriptions = ["commandToggle", "commandMode", "commandRetranslate"].map((key) => sources[locale][key])
    expect(new Set(descriptions).size).toBe(3)
  })
})
