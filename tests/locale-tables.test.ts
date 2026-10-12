/** The interface messages the background script hands to the content scripts (background/locale-tables.ts). */
import { describe, expect, it, vi } from "vitest"
import { createLocaleTables } from "../src/background/locale-tables"
import { stubBrowser } from "./fixtures/browser"
import { localeText, packagedFetch } from "./fixtures/locales"

/** The tables over the packaged locale files, Thunderbird in `uiLang`. */
function tables(uiLang = "en-US") {
  stubBrowser({ uiLanguage: uiLang })
  const fetch = packagedFetch()
  vi.stubGlobal("fetch", fetch)
  const reads = (locale: string) => fetch.mock.calls.filter(([url]) => url.endsWith(`/_locales/${locale}/messages.json`)).length
  return { messages: createLocaleTables(uiLang), fetch, reads }
}

describe("locale tables", () => {
  it("answers the messages of a locale for content scripts", async () => {
    const { messages } = tables()
    const answer = await messages("de")
    expect(answer.locale).toBe("de")
    expect(answer.messages.actionTitle).toBe(localeText("de", "actionTitle"))
    // "auto" follows Thunderbird's language.
    expect((await messages("auto")).locale).toBe("en")
  })

  it("L6: reads the messages of a locale again after a failed read instead of keeping English", async () => {
    const { messages, fetch } = tables()
    const read = fetch.getMockImplementation()!
    fetch.mockImplementationOnce(async () => Promise.reject(new TypeError("file busy")))
    expect((await messages("fr")).locale).toBe("en")
    fetch.mockImplementation(read)
    const answer = await messages("fr")
    expect(answer.locale).toBe("fr")
    expect(answer.messages.actionTitle).toBe(localeText("fr", "actionTitle"))
  })

  it("reads and compiles the messages of a locale once, however many messages are displayed", async () => {
    const { messages, reads } = tables()
    const answers = await Promise.all([1, 2, 3].map(() => messages("fr")))
    await messages("fr")
    expect(reads("fr")).toBe(1)
    expect(answers[0]).toBe(answers[2])
    expect(answers[0].messages.actionTitle).toBe(localeText("fr", "actionTitle"))
  })
})
