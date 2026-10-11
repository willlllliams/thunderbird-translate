// @vitest-environment jsdom
/** The content client: Port protocol with the background, labels of the content script, and the injection guard. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { connectContent } from "../src/content/client"
import { ENGLISH, getI18n, I18n, setI18n } from "../src/shared/i18n"
import type { BackgroundRequest } from "../src/shared/messages"
import type { PublicSettings } from "../src/shared/settings"
import { fakePort, publicSettings, tieredSettings } from "./fixtures/content"

// ext.ts reads the global namespace when it is first imported.
const stub = vi.hoisted(() => {
  const s = {
    runtime: { connect: (_info: { name: string }): unknown => undefined, sendMessage: async (_req: BackgroundRequest): Promise<unknown> => undefined },
    i18n: { detectLanguage: async (_text: string) => ({ isReliable: false, languages: [] as { language: string; percentage: number }[] }) },
  }
  ;(globalThis as { browser?: unknown }).browser = s
  return s
})

let port: ReturnType<typeof fakePort>
const connect = vi.fn((_info: { name: string }) => port)
const sendMessage = vi.fn(async (_req: BackgroundRequest): Promise<unknown> => undefined)

beforeEach(() => {
  port = fakePort()
  connect.mockClear()
  sendMessage.mockReset()
  stub.runtime.connect = connect
  stub.runtime.sendMessage = sendMessage
  stub.i18n.detectLanguage = async () => ({ isReliable: false, languages: [] })
  setI18n(ENGLISH)
  document.body.innerHTML = "<p>Good morning everyone</p>"
})

const settingsPush = (settings: PublicSettings) => port.push({ type: "settings", settings })
const lastState = () => port.posted("state").at(-1)?.state

describe("connectContent", () => {
  it("settles ready with the first settings, toggles on a push and routes tier results by request id", async () => {
    const client = connectContent({ root: () => document.body })
    expect(connect).toHaveBeenCalledWith({ name: "tt-content" })
    let ready = false
    void client.ready.then(() => (ready = true))
    await Promise.resolve()
    expect(ready).toBe(false)

    settingsPush(publicSettings({ autoTranslate: true }))
    await client.ready
    expect(sendMessage).not.toHaveBeenCalled() // extension pages load their labels themselves
    expect(port.posted("translate")).toEqual([]) // and do not auto-translate

    port.push({ type: "toggle" })
    await vi.waitFor(() => expect(port.posted("translate")).toHaveLength(1))
    const [{ id, request }] = port.posted("translate")
    expect(request).toEqual({ text: "Good morning everyone", sourceLang: "auto", targetLang: "zh-CN", tiers: ["machine"] })
    port.push({ type: "tier", id: id + 99, tier: "machine", result: { ok: true, text: "wrong request" } })
    port.push({ type: "tier", id, tier: "machine", result: { ok: true, text: "大家早上好" } })
    port.push({ type: "done", id })
    expect(document.querySelector(".tt-translation")!.textContent).toBe("大家早上好")
    await vi.waitFor(() => expect(lastState()).toEqual({ active: true, total: 1, done: 1, provisional: 0, failed: 0 }))

    port.push({ type: "toggle" })
    await vi.waitFor(() => expect(lastState()).toMatchObject({ active: false }))
    expect(document.querySelector(".tt-translation")).toBeNull()
  })

  it("content script: loads the labels of the interface language once per language and auto-translates", async () => {
    sendMessage.mockResolvedValue({ locale: "de", messages: { statusTranslating: "Übersetze…" } })
    const client = connectContent({ root: () => document.body, contentScript: true })
    settingsPush(publicSettings({ uiLanguage: "de", autoTranslate: true }))
    await client.ready
    expect(sendMessage).toHaveBeenCalledWith({ type: "getLocaleMessages", uiLanguage: "de" })
    expect(getI18n().locale).toBe("de")
    await vi.waitFor(() => expect(port.posted("translate")).toHaveLength(1))
    expect(document.querySelector(".tt-loading")!.getAttribute("aria-label")).toBe("Übersetze…")

    settingsPush(publicSettings({ uiLanguage: "de", autoTranslate: true, mode: "translation-only" }))
    settingsPush(publicSettings({ uiLanguage: "fr", autoTranslate: true, mode: "translation-only" }))
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    expect(sendMessage).toHaveBeenLastCalledWith({ type: "getLocaleMessages", uiLanguage: "fr" })
    // Auto-translation is decided once, for the first settings.
    expect(port.posted("translate")).toHaveLength(1)
  })

  it("applies settings in the order they arrive, also while labels load", async () => {
    let release!: () => void
    sendMessage.mockImplementationOnce(() => new Promise((r) => (release = () => r(undefined))))
    const client = connectContent({ root: () => document.body, contentScript: true })
    settingsPush(publicSettings({ uiLanguage: "de" }))
    settingsPush(publicSettings({ uiLanguage: "de", targetLang: "ja" }))
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    release()
    await client.ready
    void client.controller.toggle()
    // The second settings win, whether they reach the controller before or after the start.
    await vi.waitFor(() => expect(port.posted("translate").at(-1)?.request.targetLang).toBe("ja"))
    await new Promise((r) => setTimeout(r, 10))
    expect(port.posted("translate").at(-1)?.request.targetLang).toBe("ja")
  })

  it.each<[string, () => Promise<unknown>]>([
    ["the background fails", async () => Promise.reject(new Error("Receiving end does not exist."))],
    ["the background has no messages", async () => undefined],
  ])("content script: falls back to English labels when %s", async (_name, answer) => {
    setI18n(new I18n("de", { statusTranslating: "Übersetze…" }))
    sendMessage.mockImplementation(answer)
    const client = connectContent({ root: () => document.body, contentScript: true })
    settingsPush(publicSettings({ uiLanguage: "de" }))
    await client.ready
    expect(getI18n()).toBe(ENGLISH)
  })

  it("content script: leaves a message in the target language alone, as the browser's detector says", async () => {
    document.body.innerHTML = "<p>Bonjour à toute l'équipe, à demain</p>"
    stub.i18n.detectLanguage = async () => ({ isReliable: true, languages: [{ language: "fr", percentage: 98 }] })
    const client = connectContent({ root: () => document.body, contentScript: true })
    settingsPush(publicSettings({ autoTranslate: true, targetLang: "fr" }))
    await client.ready
    await client.controller.toggle()
    expect(port.posted("translate")).toEqual([])
    expect(lastState()).toMatchObject({ active: true, total: 0 })
  })

  it("posts the message context in precise mode", async () => {
    const client = connectContent({ root: () => document.body })
    settingsPush(tieredSettings(["machine", "ai"], { precise: true }))
    await client.ready
    void client.controller.start()
    await vi.waitFor(() => expect(port.posted("translate")).toHaveLength(1))
    const [{ context }] = port.posted("context")
    expect(context.paragraphs).toEqual(["Good morning everyone"])
    expect(port.posted("translate")[0].request.context).toEqual({ id: context.id, index: 0 })
  })

  it("on disconnect fails the tiers that did not answer, settles the requests and stops reporting", async () => {
    document.body.innerHTML = "<p>Good morning</p><p>See you later</p>"
    const client = connectContent({ root: () => document.body })
    settingsPush(tieredSettings(["machine", "ai"]))
    await client.ready
    const started = client.controller.start()
    await vi.waitFor(() => expect(port.posted("translate")).toHaveLength(2))
    const [first] = port.posted("translate")
    port.push({ type: "tier", id: first.id, tier: "machine", result: { ok: true, text: "早上好" } })

    port.postMessage.mockImplementation(() => {
      throw new Error("Attempt to postMessage on disconnected port")
    })
    port.disconnect()
    await started
    const unknown = ENGLISH.t("errUnknown")
    const [fallback, error] = Array.from(document.querySelectorAll<HTMLElement>("p"))
    expect(fallback.querySelector(".tt-fallback")!.firstChild!.textContent).toBe("早上好")
    expect(fallback.querySelector<HTMLElement>(".tt-fallback .tt-error")!.title).toBe(unknown)
    expect(error.querySelector<HTMLElement>(".tt-error")!.title).toBe(unknown)

    // A retry after the disconnect fails at once instead of waiting forever.
    error.querySelector<HTMLElement>(".tt-error")!.click()
    await vi.waitFor(() => expect(error.querySelector<HTMLElement>(".tt-error")?.title).toMatch(/\S/))
    expect(() => client.controller.stop()).not.toThrow()
  })
})

describe("content script entry", () => {
  it("connects once per window, also when injected twice", async () => {
    delete window.__thunderbirdTranslateLoaded
    await import("../src/content/index")
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith({ name: "tt-content" })
    vi.resetModules()
    await import("../src/content/index")
    expect(connect).toHaveBeenCalledTimes(1)
    expect(window.__thunderbirdTranslateLoaded).toBe(true)
  })
})
