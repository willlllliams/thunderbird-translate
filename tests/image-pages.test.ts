// @vitest-environment jsdom
/**
 * Image translation on the extension pages: the three modes in the popup while precise translation is on, the group
 * under precise translation on the settings page with its advanced settings, model hints, token estimate, test image
 * and the consent for images, and the choice on the AI step of the setup guide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { costHint } from "../src/options/image-settings"
import { ENGLISH } from "../src/shared/i18n"
import { type BackgroundRequest, IDLE_TAB_STATE } from "../src/shared/messages"
import { createDefaultSettings, defaultImageSettings, type Settings } from "../src/shared/settings"
import { WELCOME_KEY } from "../src/welcome/steps"
import { flushSave } from "./fixtures/pages"
import { openPage, until, useFakeTimers } from "./helpers"

beforeEach(() => useFakeTimers())
afterEach(() => vi.useRealTimers())

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Precise translation with OpenAI as the AI tier, changed by `change`. */
function precise(change: (s: Settings) => void = () => {}): Settings {
  const s = createDefaultSettings("en")
  s.tiers.ai = "openai"
  s.providers.openai = { enabled: true, apiKey: "sk-1", baseURL: "", model: "" }
  s.precise.enabled = true
  change(s)
  return s
}

describe("popup", () => {
  const radios = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[name="imageMode"]'))

  it("shows the three modes while precise translation is on and stores the choice", async () => {
    const page = await openPage("popup", precise(), { activeTab: { id: 3 }, respond: (req) => (req.type === "getTabState" ? IDLE_TAB_STATE : undefined) })
    await until(() => expect($("imageRow").hidden).toBe(false))
    expect(radios().map((r) => [r.value, r.checked])).toEqual([["off", false], ["ask", true], ["auto", false]])
    expect($("imageUnsupported").hidden).toBe(true)
    radios()[2].click()
    await until(() => expect(page.stored().image.mode).toBe("auto"))
    // Precise translation off elsewhere: the switch goes.
    page.external((s) => (s.precise.enabled = false))
    await until(() => expect($("imageRow").hidden).toBe(true))
  })

  it("names a model that does not accept images", async () => {
    await openPage("popup", precise((s) => ((s.tiers.ai = "zhipu"), (s.providers.zhipu.enabled = true))), { activeTab: { id: 3 }, respond: (req) => (req.type === "getTabState" ? IDLE_TAB_STATE : undefined) })
    await until(() => expect($("imageUnsupported").hidden).toBe(false))
    expect($("imageUnsupported").textContent).toBe(ENGLISH.t("hintVisionNo", ["glm-4-flash", "glm-4.6v-flash"]))
  })

  it("hides the modes without precise translation", async () => {
    await openPage("popup", createDefaultSettings("en"), { activeTab: { id: 3 }, respond: (req) => (req.type === "getTabState" ? IDLE_TAB_STATE : undefined) })
    await until(() => expect($("status").textContent).not.toBe(""))
    expect($("imageRow").hidden).toBe(true)
  })
})

describe("settings page", () => {
  async function options(settings: Settings, respond?: (req: BackgroundRequest) => unknown) {
    const page = await openPage("options", settings, { respond })
    await until(() => expect(document.querySelector("#providerPanel h3")).not.toBeNull())
    return page
  }
  const set = (id: string, value: string, type: "change" | "input" = "change") => {
    const el = $<HTMLInputElement>(id)
    el.value = value
    el.dispatchEvent(new Event(type))
  }

  it("greys the group out without precise translation and keeps its values", async () => {
    const page = await options(precise((s) => ((s.precise.enabled = false), (s.image.mode = "auto"))))
    expect($<HTMLFieldSetElement>("imageGroup").disabled).toBe(true)
    expect($("imagePreciseOff").hidden).toBe(false)
    expect($<HTMLSelectElement>("imageMode").value).toBe("auto")
    $<HTMLInputElement>("preciseEnabled").click()
    expect($<HTMLFieldSetElement>("imageGroup").disabled).toBe(false)
    expect($("imagePreciseOff").hidden).toBe(true)
    await flushSave()
    expect(page.stored().image.mode).toBe("auto")
  })

  it("stores every image setting through its field", async () => {
    const page = await options(precise((s) => (s.providers.gemini.enabled = true)))
    set("imageMode", "off")
    set("imageProvider", "gemini")
    set("imageModel", " gemini-2.5-flash ", "input")
    for (const [id, value] of [["imageMax", "3"], ["imageMinSide", "64"], ["imageMinArea", "0"], ["imageMaxAspect", "12"], ["imageMinKB", "10"], ["imageLongEdge", "9999"], ["imageQuality", "0.7"], ["imageMaxKB", "800"], ["imageMaxMB", "2"], ["imageMaxTokens", "512"], ["imageTimeout", "30"], ["imageConcurrency", "1"]]) set(id, value)
    for (const [id, value] of [["imageAnimated", "firstFrame"], ["imageFormat", "webp"], ["imageDetail", "high"], ["imageOutput", "both"], ["imageNoText", "describe"], ["imageDisplay", "collapsed"]]) set(id, value)
    for (const id of ["imageInline", "imageAttachments", "imageSignature", "imageShowSource", "imageContext", "imageUsage", "imageConfirm"]) $<HTMLInputElement>(id).click()
    await flushSave()
    expect(page.stored().image).toEqual({
      ...defaultImageSettings(),
      mode: "off",
      provider: "gemini",
      model: "gemini-2.5-flash",
      sources: { inline: false, attachments: false },
      maxPerMessage: 3,
      minSide: 64,
      minArea: 0,
      maxAspect: 12,
      minKB: 10,
      maxLongEdge: 2576,
      quality: 0.7,
      maxImageKB: 800,
      maxMessageMB: 2,
      maxOutputTokens: 512,
      timeoutSeconds: 30,
      concurrency: 1,
      animated: "firstFrame",
      format: "webp",
      detail: "high",
      output: "both",
      noText: "describe",
      display: "collapsed",
      skipSignature: false,
      showSource: false,
      useContext: false,
      showUsage: false,
      confirmEachMessage: true,
    })
    set("imageProvider", "")
    await flushSave()
    expect(page.stored().image.provider).toBeNull()
  })

  it("offers the added AI services, the models of the service and says what is known of the model", async () => {
    await options(precise((s) => (s.providers.zhipu.enabled = true)))
    expect(Array.from($<HTMLSelectElement>("imageProvider").options, (o) => o.value)).toEqual(["", "openai", "zhipu"])
    expect($<HTMLInputElement>("imageModel").placeholder).toBe("gpt-4.1-mini")
    expect($("imageSupport").hidden).toBe(true)
    expect($("imageCost").textContent).toMatch(/1,245/)
    expect($<HTMLAnchorElement>("imagePrices").hidden).toBe(false)
    expect($<HTMLAnchorElement>("imagePrices").href).toBe("https://developers.openai.com/api/docs/pricing")
    set("imageProvider", "zhipu")
    expect($("imageSupport").textContent).toBe(ENGLISH.t("hintVisionNo", ["glm-4-flash", "glm-4.6v-flash"]))
    expect(Array.from($("imageModels").querySelectorAll("option"), (o) => o.value)[0]).toBe("glm-4.6v-flash")
    expect($<HTMLAnchorElement>("imagePrices").hidden).toBe(true)
    set("imageModel", "glm-4.6v-flash", "input")
    expect($("imageSupport").hidden).toBe(true)
    expect($("imageCost").textContent).toBe(costHint(precise((s) => ((s.providers.zhipu.enabled = true), (s.image.provider = "zhipu"), (s.image.model = "glm-4.6v-flash")))))
  })

  it("estimates the tokens of an image with the formula of the model and of the prompt by its length", () => {
    const s = precise()
    expect(costHint(s)).toMatch(new RegExp(`^${ENGLISH.t("hintVisionCost", [1245, "\\d+"]).replace(/[()×]/g, ".")}$`))
    s.image.model = "deepseek-x"
    expect(costHint(s)).toMatch(/^There is no estimate of the image tokens of deepseek-x/)
    expect(costHint(createDefaultSettings("en"))).toBe("")
  })

  it("sends the test image to the vision service with its configuration on the page", async () => {
    const page = await options(precise((s) => (s.image.model = "gpt-4.1")), (req) => (req.type === "testVision" ? { ok: true, text: "TEST 42" } : undefined))
    $("imageTest").click()
    await until(() => expect($("imageTestResult").textContent).toBe(ENGLISH.t("testImageOk", ["TEST 42"])))
    expect($("imageTestResult").className).toBe("test-result ok")
    expect(page.sendMessage).toHaveBeenCalledWith({ type: "testVision", providerId: "openai", config: { enabled: true, apiKey: "sk-1", baseURL: "", model: "" }, model: "gpt-4.1" })
  })

  it("shows why the test image failed", async () => {
    let answer: unknown = { ok: false, error: "The answer does not contain 42" }
    await options(precise(), (req) => {
      if (req.type !== "testVision") return undefined
      if (answer instanceof Error) throw answer
      return answer
    })
    $("imageTest").click()
    await until(() => expect($("imageTestResult").textContent).toBe("The answer does not contain 42"))
    expect($("imageTestResult").className).toBe("test-result fail")
    answer = new Error("Receiving end does not exist.")
    $("imageTest").click()
    await until(() => expect($("imageTestResult").textContent).toBe("Receiving end does not exist."))
    answer = { ok: false }
    $("imageTest").click()
    await until(() => expect($("imageTestResult").textContent).not.toBe(ENGLISH.t("testRunning")))
    expect($("imageTestResult").textContent).not.toBe("")
  })

  it("has no test without a vision service", async () => {
    await options(createDefaultSettings("en"))
    expect($<HTMLButtonElement>("imageTest").disabled).toBe(true)
    $<HTMLButtonElement>("imageTest").disabled = false
    $("imageTest").click()
    expect($("imageTestResult").textContent).toBe("")
  })

  it("lists the services allowed to receive images apart from text, with a button that takes the consent back", async () => {
    const page = await options(precise((s) => ((s.onlineConsent = ["google-free@translate.googleapis.com"]), (s.imageConsent = ["openai@api.openai.com"]))))
    const items = (id: string) => Array.from($(id).querySelectorAll("li"))
    expect(items("consentList").map((li) => li.querySelector("span")?.textContent)).toEqual([ENGLISH.t("consentService", ["Google Translate (free)", "translate.googleapis.com"])])
    expect(items("imageConsentList").map((li) => li.querySelector("span")?.textContent)).toEqual([ENGLISH.t("consentService", ["OpenAI", "api.openai.com"])])
    const revoke = items("imageConsentList")[0].querySelector("button")!
    expect(revoke.title).toBe(ENGLISH.t("tipRevokeImageConsent"))
    revoke.click()
    await flushSave()
    expect(page.stored().imageConsent).toEqual([])
    expect(page.stored().onlineConsent).toEqual(["google-free@translate.googleapis.com"])
    expect(items("imageConsentList").map((li) => li.textContent)).toEqual([ENGLISH.t("consentListNone")])
  })

  it("has the image prompt with its restore button", async () => {
    const page = await options(precise())
    const box = $<HTMLTextAreaElement>("prompt-image")
    box.value = "Read the image for {{to}}."
    box.dispatchEvent(new Event("input"))
    await flushSave()
    expect(page.stored().prompts.image).toBe("Read the image for {{to}}.")
    $("reset-image").click()
    await flushSave()
    expect(page.stored().prompts.image).toBe("")
  })
})

describe("setup guide", () => {
  it("offers the three modes under precise translation on the AI step, greyed out while it is off", async () => {
    const page = await openPage("welcome", precise((s) => (s.precise.enabled = false)), { stored: { [WELCOME_KEY]: { step: "ai" } } })
    await until(() => expect(document.querySelector<HTMLElement>('section[data-step="ai"]')!.hidden).toBe(false))
    const radios = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[name="imageMode"]'))
    expect($<HTMLFieldSetElement>("imageModeGroup").disabled).toBe(true)
    expect(radios().map((r) => r.checked)).toEqual([false, true, false])
    $<HTMLInputElement>("preciseEnabled").click()
    expect($<HTMLFieldSetElement>("imageModeGroup").disabled).toBe(false)
    radios()[0].click()
    await flushSave()
    expect(page.stored().image.mode).toBe("off")
    expect(page.stored().precise.enabled).toBe(true)
    page.external((s) => (s.image.mode = "auto"))
    await until(() => expect(radios()[2].checked).toBe(true))
  })
})
