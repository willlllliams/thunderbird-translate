// @vitest-environment jsdom
/** The panel that asks before message text first goes to an online service (content/consent.ts), in the controller and the content client. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { connectContent } from "../src/content/client"
import { ConsentPanel } from "../src/content/consent"
import { TranslationController } from "../src/content/controller"
import { ENGLISH, setI18n } from "../src/shared/i18n"
import type { BackgroundRequest } from "../src/shared/messages"
import type { ConsentNeed } from "../src/shared/settings"
import { pagePort } from "./fixtures/browser"
import { answering, publicSettings, tieredSettings } from "./fixtures/content"
import { nextTask, until } from "./helpers"

const GOOGLE: ConsentNeed = { id: "google-free", host: "translate.googleapis.com" }
const CUSTOM: ConsentNeed = { id: "custom", host: "" }
const OPENAI: ConsentNeed = { id: "openai", host: "api.openai.com" }

const panel = () => document.querySelector<HTMLElement>(".tt-consent")
const buttons = () => Array.from(panel()?.querySelectorAll<HTMLButtonElement>("button") ?? [])
const click = (label: string) => buttons().find((b) => b.textContent === ENGLISH.t(label as never))!.click()

beforeEach(() => {
  setI18n(ENGLISH)
  document.head.innerHTML = ""
  document.body.innerHTML = "<p>Good morning everyone</p>"
})

describe("consent panel", () => {
  it("names each service with its host, what is sent and where the key goes, above the message", async () => {
    const consent = new ConsentPanel({ root: () => document.body })
    const answer = consent.ask([GOOGLE, CUSTOM], false)
    expect(document.body.firstElementChild).toBe(panel())
    expect(consent.shown).toBe(true)
    expect(panel()!.getAttribute("aria-label")).toBe(ENGLISH.t("consentTitle"))
    expect(Array.from(panel()!.querySelectorAll("li")).map((li) => li.textContent)).toEqual([ENGLISH.t("consentService", ["Google Translate (free)", "translate.googleapis.com"]), "Custom OpenAI-compatible"])
    expect(panel()!.textContent).toContain(ENGLISH.t("consentBody"))
    expect(panel()!.textContent).toContain(ENGLISH.t("consentKey"))
    expect(buttons().map((b) => [b.textContent, b.title])).toEqual([
      [ENGLISH.t("consentAllow"), ENGLISH.t("tipConsentAllow")],
      [ENGLISH.t("consentCancel"), ENGLISH.t("tipConsentCancel")],
    ])
    // Asked again while open: the same question.
    expect(consent.ask([GOOGLE], false)).toBe(answer)
    click("consentAllow")
    expect(await answer).toBe(true)
    expect(panel()).toBeNull()
    expect(consent.shown).toBe(false)
  })

  it("U1: asked for another service while open, lists both and says the whole message goes, with the same answer", async () => {
    const consent = new ConsentPanel({ root: () => document.body })
    const first = consent.ask([GOOGLE], false)
    buttons()[0].focus()
    expect(consent.ask([OPENAI], true)).toBe(first)
    expect(document.querySelectorAll(".tt-consent")).toHaveLength(1)
    expect(Array.from(panel()!.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      ENGLISH.t("consentService", ["Google Translate (free)", "translate.googleapis.com"]),
      ENGLISH.t("consentService", ["OpenAI", "api.openai.com"]),
    ])
    expect(panel()!.textContent).toContain(ENGLISH.t("consentBodyPrecise"))
    expect(document.activeElement).toBe(buttons()[0])
    click("consentAllow")
    expect(await first).toBe(true)
    // The next question starts from what it needs alone.
    void consent.ask([GOOGLE], false)
    expect(panel()!.querySelectorAll("li")).toHaveLength(1)
    expect(panel()!.textContent).toContain(ENGLISH.t("consentBody"))
  })

  it("says that precise translation sends the whole message, answers no on Cancel, when cleared and without a message", async () => {
    const consent = new ConsentPanel({ root: () => document.body })
    const first = consent.ask([GOOGLE], true)
    expect(panel()!.textContent).toContain(ENGLISH.t("consentBodyPrecise"))
    click("consentCancel")
    expect(await first).toBe(false)
    const second = consent.ask([GOOGLE], false)
    consent.clear()
    expect(await second).toBe(false)
    expect(panel()).toBeNull()
    expect(await new ConsentPanel({ root: () => null }).ask([GOOGLE], false)).toBe(false)
    // An id without a preset shows as it is.
    void consent.ask([{ id: "gone", host: "" }], false)
    expect(panel()!.querySelector("li")!.textContent).toBe("gone")
  })
})

describe("controller", () => {
  const consentDeps = (answers: boolean[]) => {
    const ask = vi.fn(async (_needs: ConsentNeed[], _precise: boolean) => answers.shift() ?? false)
    return { ask, clear: vi.fn() }
  }

  it("translates nothing until the user allows the services, and asks once per message", async () => {
    const translate = answering((text) => ({ ok: true, text }))
    const consent = consentDeps([false, true])
    const c = new TranslationController({ root: () => document.body, translate, consent })
    await c.updateSettings(publicSettings({ consent: [GOOGLE] }))
    await c.start()
    expect(consent.ask).toHaveBeenCalledWith([GOOGLE], false)
    expect(translate).not.toHaveBeenCalled()
    expect(c.active).toBe(false)
    await c.start()
    expect(translate).toHaveBeenCalledTimes(1)
    expect(c.active).toBe(true)
    // The settings that record the consent have not arrived yet: translating again asks nothing.
    c.stop()
    expect(consent.clear).toHaveBeenCalled()
    await c.start()
    expect(consent.ask).toHaveBeenCalledTimes(2)
    expect(c.active).toBe(true)
  })

  it("asks before automatic translation and before a retranslation, and needs nothing for the offline tiers", async () => {
    const translate = answering((text) => ({ ok: true, text }))
    const consent = consentDeps([false])
    const c = new TranslationController({ root: () => document.body, translate, consent })
    await c.updateSettings(publicSettings({ autoTranslate: true, sourceLang: "en", targetLang: "de", consent: [GOOGLE] }))
    expect(await c.maybeAutoStart()).toBe(true)
    expect(consent.ask).toHaveBeenCalledTimes(1)
    expect(translate).not.toHaveBeenCalled()
    await c.updateSettings(tieredSettings(["dictionary"], { consent: [] }))
    await c.start()
    expect(translate).toHaveBeenCalledTimes(1)
    await c.retranslate()
    expect(consent.ask).toHaveBeenCalledTimes(1)
  })

  it("asks again when a tier changes to a service not allowed yet, and stops if the user refuses", async () => {
    const translate = answering((text) => ({ ok: true, text }))
    const consent = consentDeps([false])
    const c = new TranslationController({ root: () => document.body, translate, consent })
    await c.updateSettings(tieredSettings(["dictionary"]))
    await c.start()
    expect(c.active).toBe(true)
    await c.updateSettings(tieredSettings(["dictionary", "machine"], { consent: [GOOGLE] }))
    expect(consent.ask).toHaveBeenCalledWith([GOOGLE], false)
    expect(c.active).toBe(false)
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it("R53: asks again in the same message when the host of an allowed service changed or the consent was taken back", async () => {
    const translate = answering((text) => ({ ok: true, text }))
    const consent = consentDeps([true, true, true])
    const c = new TranslationController({ root: () => document.body, translate, consent })
    const at = (host: string): ConsentNeed => ({ id: "custom", host })
    await c.updateSettings(publicSettings({ consent: [at("a.example")] }))
    await c.start()
    expect(consent.ask).toHaveBeenCalledTimes(1)
    // The host changes before the settings that record the consent arrive.
    await c.updateSettings(publicSettings({ consent: [at("b.example")] }))
    c.stop()
    await c.start()
    expect(consent.ask).toHaveBeenLastCalledWith([at("b.example")], false)
    // Recorded, then taken back on the settings page.
    await c.updateSettings(publicSettings({ consent: [] }))
    await c.updateSettings(publicSettings({ consent: [at("b.example")] }))
    c.stop()
    await c.start()
    expect(consent.ask).toHaveBeenCalledTimes(3)
    // The same need pushed again while it waits for its record asks no more.
    await c.updateSettings(publicSettings({ consent: [at("b.example")] }))
    c.stop()
    await c.start()
    expect(consent.ask).toHaveBeenCalledTimes(3)
    expect(c.active).toBe(true)
  })

  it("does not translate when the settings changed to a service without consent while the panel was open", async () => {
    const translate = answering((text) => ({ ok: true, text }))
    let allow!: (ok: boolean) => void
    const consent = { ask: vi.fn(() => new Promise<boolean>((resolve) => (allow = resolve))), clear: vi.fn() }
    const c = new TranslationController({ root: () => document.body, translate, consent })
    await c.updateSettings(publicSettings({ consent: [GOOGLE] }))
    const started = c.start()
    await c.updateSettings(tieredSettings(["machine", "ai"], { consent: [GOOGLE, CUSTOM] }))
    allow(true)
    await started
    expect(translate).not.toHaveBeenCalled()
    expect(c.active).toBe(false)
  })
})

describe("content client", () => {
  it("shows the panel on the message, records the consent with the background script, then translates", async () => {
    const port = pagePort()
    const sendMessage = vi.fn(async (_req: BackgroundRequest): Promise<unknown> => undefined)
    vi.stubGlobal("browser", {
      runtime: { connect: () => port, sendMessage },
      i18n: { detectLanguage: async () => ({ isReliable: false, languages: [] }) },
    })
    const client = connectContent({ root: () => document.body, contentScript: true })
    port.push({ type: "settings", settings: publicSettings({ consent: [GOOGLE] }) })
    await client.ready
    port.push({ type: "toggle" })
    await until(() => expect(panel()).not.toBeNull())
    expect(port.posted("translate")).toEqual([])
    click("consentAllow")
    await until(() => expect(port.posted("translate")).toHaveLength(1))
    expect(sendMessage).toHaveBeenCalledWith({ type: "grantConsent", ids: ["google-free"], hosts: ["translate.googleapis.com"] })
  })

  it("translates nothing when the background script cannot record the consent", async () => {
    const port = pagePort()
    const sendMessage = vi.fn(async (req: BackgroundRequest): Promise<unknown> => {
      if (req.type === "grantConsent") throw new Error("Receiving end does not exist.")
      return undefined
    })
    vi.stubGlobal("browser", {
      runtime: { connect: () => port, sendMessage },
      i18n: { detectLanguage: async () => ({ isReliable: false, languages: [] }) },
    })
    const client = connectContent({ root: () => document.body, contentScript: true })
    port.push({ type: "settings", settings: publicSettings({ consent: [GOOGLE] }) })
    await client.ready
    port.push({ type: "toggle" })
    await until(() => expect(panel()).not.toBeNull())
    click("consentAllow")
    await until(() => expect(sendMessage).toHaveBeenCalledWith({ type: "grantConsent", ids: ["google-free"], hosts: ["translate.googleapis.com"] }))
    await nextTask()
    expect(port.posted("translate")).toEqual([])
  })

  it("U1: a summary asked while the panel of the translation is open shows its service there; every recorded id was on the panel", async () => {
    const port = pagePort()
    const sendMessage = vi.fn(async (_req: BackgroundRequest): Promise<unknown> => undefined)
    vi.stubGlobal("browser", {
      runtime: { connect: () => port, sendMessage },
      i18n: { detectLanguage: async () => ({ isReliable: false, languages: [] }) },
    })
    const client = connectContent({ root: () => document.body, contentScript: true })
    port.push({ type: "settings", settings: publicSettings({ consent: [GOOGLE], summary: { available: true, inlineButton: false, auto: "off", collapsed: false, consent: OPENAI } }) })
    await client.ready
    port.push({ type: "toggle" })
    await until(() => expect(panel()).not.toBeNull())
    port.push({ type: "summarize" })
    await until(() => expect(panel()!.querySelectorAll("li")).toHaveLength(2))
    const listed = panel()!.textContent!
    click("consentAllow")
    const ids = () => sendMessage.mock.calls.flatMap(([req]) => (req.type === "grantConsent" ? req.ids : []))
    await until(() => expect(ids().sort()).toEqual(["google-free", "openai"]))
    for (const id of ids()) expect(listed).toContain(id === "openai" ? "api.openai.com" : "translate.googleapis.com")
  })

  it("asks nothing on an extension page: it translates its own sample text", async () => {
    const port = pagePort()
    vi.stubGlobal("browser", { runtime: { connect: () => port, sendMessage: vi.fn() }, i18n: {} })
    const client = connectContent({ root: () => document.body })
    port.push({ type: "settings", settings: publicSettings({ consent: [GOOGLE] }) })
    await client.ready
    port.push({ type: "toggle" })
    await until(() => expect(port.posted("translate")).toHaveLength(1))
    expect(panel()).toBeNull()
  })
})
