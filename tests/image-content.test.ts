// @vitest-environment jsdom
/**
 * Image translation in the content script (content/images.ts): the images that pass, the place of their blocks,
 * the three modes, the consent panel, the answers, a change of the mode without reloading, retranslation and stop;
 * with the controller (controller.ts), the Port of the client (client.ts) and the images of translation-only display
 * (render.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { connectContent } from "../src/content/client"
import { TranslationController } from "../src/content/controller"
import { type ImageRun, ImageTranslator, NO_TEXT_MS } from "../src/content/images"
import type { Unit } from "../src/content/paragraphs"
import { Renderer } from "../src/content/render"
import type { ContentProbeParts } from "../src/hooks/content"
import { ENGLISH, setI18n } from "../src/shared/i18n"
import type { ImageRequest, ImageResponse } from "../src/shared/messages"
import type { PublicImageSettings } from "../src/shared/settings"
import { pagePort } from "./fixtures/browser"
import { answering, imageSettings, publicSettings, tieredSettings } from "./fixtures/content"
import { nextTask, until, useFakeTimers } from "./helpers"

const TABLE = "| Original | Translation |\n| --- | --- |\n| Umsatz | Revenue |"
const DONE: ImageResponse = { status: "done", text: TABLE, service: "OpenAI", cached: false, usage: { input: 1036, output: 80 } }
const part = (n: string) => `mailbox:///C:/Inbox?number=3&part=${n}&filename=x.png`

/** Give the images of the body a natural size and mark them loaded, as Thunderbird would; jsdom loads nothing. */
function sizeImages(sizes: Record<string, [number, number]> = {}): void {
  for (const img of Array.from(document.querySelectorAll("img"))) {
    const [width, height] = sizes[img.id] ?? [400, 200]
    Object.defineProperty(img, "naturalWidth", { value: width, configurable: true })
    Object.defineProperty(img, "naturalHeight", { value: height, configurable: true })
    Object.defineProperty(img, "complete", { value: true, configurable: true })
  }
}

const BODY = `<p id="para">Look at the chart: <img id="a" src="${part("1.2")}"></p>
<a href="https://example.com/x"><img id="b" src="${part("1.3")}"></a>
<img id="pixel" src="${part("1.4")}">
<div class="moz-signature"><img id="logo" src="${part("1.5")}"></div>
<img id="remote" src="https://example.com/r.png">
<div class="moz-attached-image-container"><img id="c" class="moz-attached-image" src="${part("1.6")}"></div>`

/** A translator over the body with BODY, whose requests answer `answer` (a peek "ready" by default). */
function mount(answer: (req: ImageRequest) => ImageResponse | Promise<ImageResponse> = (req) => (req.action === "peek" ? { status: "ready" } : DONE), body = BODY) {
  document.body.innerHTML = body
  // The remote image of BODY is blocked, as Thunderbird blocks remote content by default.
  sizeImages({ pixel: [1, 1], logo: [300, 300], remote: [0, 0] })
  const request = vi.fn(async (req: ImageRequest) => answer(req))
  const grant = vi.fn()
  const requestAccess = vi.fn()
  const reportRemote = vi.fn()
  const images = new ImageTranslator({ root: () => document.body, request, grant, requestAccess, reportRemote })
  const units: Unit[] = [{ el: document.getElementById("para")!, text: "Look at the chart:", pre: false }]
  const run = (settings: Partial<PublicImageSettings> = {}, over: Partial<ImageRun> = {}): ImageRun => ({ settings: imageSettings({ mode: "ask", ...settings }), targetLang: "zh-CN", units, ...over })
  return { images, request, grant, requestAccess, reportRemote, run, units }
}

const slots = () => Array.from(document.querySelectorAll<HTMLElement>(".tt-image"))
const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".tt-image > button"))
const sent = (request: ReturnType<typeof mount>["request"], action: ImageRequest["action"]) => request.mock.calls.map(([req]) => req).filter((req) => req.action === action)

beforeEach(() => setI18n(ENGLISH))
afterEach(() => vi.useRealTimers())

describe("the images of a translated message", () => {
  it("considers the inline images and the image attachments that pass the filters, and no remote image Thunderbird blocked", async () => {
    const { images, request, run } = mount()
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(3))
    expect(images.shown).toBe(3)
    expect(sent(request, "peek").map((req) => [req.source, req.index, req.width, req.height])).toEqual([
      [{ part: "1.2", name: "x.png" }, 1, 400, 200],
      [{ part: "1.3", name: "x.png" }, 2, 400, 200],
      [{ part: "1.6", name: "x.png" }, 3, 400, 200],
    ])
    // After the paragraph that holds the image, after the link around it, after the container of the attachment.
    expect(document.getElementById("para")!.nextElementSibling).toBe(slots()[0])
    expect(document.querySelector("a")!.nextElementSibling).toBe(slots()[1])
    expect(document.querySelector(".moz-attached-image-container")!.nextElementSibling).toBe(slots()[2])
    expect(buttons()[0].textContent).toBe(ENGLISH.t("imageButton"))
    expect(buttons()[0].title).toBe(ENGLISH.t("tipImageButton"))
  })

  it("follows the sources of the settings and keeps the order of two images under one paragraph", async () => {
    const { images, request, run } = mount(undefined, `<p id="para">Two: <img id="a" src="${part("1.2")}"><img id="b" src="data:image/png;base64,AAEC"><img id="d" src="cid:x@y"></p><div class="moz-attached-image-container"><img src="${part("1.6")}"></div>`)
    images.start(run({ sources: { inline: true, attachments: false } }))
    await until(() => expect(buttons()).toHaveLength(2))
    expect(sent(request, "peek").map((req) => req.source)).toEqual([{ part: "1.2", name: "x.png" }, { data: "data:image/png;base64,AAEC" }])
    expect(document.getElementById("para")!.nextElementSibling).toBe(slots()[0])
    expect(slots()[0].nextElementSibling).toBe(slots()[1])
  })

  it("does nothing while off", async () => {
    const { images, request, run } = mount()
    images.start(run({ mode: "off" }))
    await nextTask()
    expect([slots(), request.mock.calls]).toEqual([[], []])
  })

  it("asks: a click sends that image and shows the table with the column names of the interface", async () => {
    const { images, request, run } = mount()
    images.start(run(undefined, { context: "mail-1" }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[1].click()
    await until(() => expect(document.querySelector(".tt-image-result")).not.toBeNull())
    expect(sent(request, "translate")).toEqual([{ source: { part: "1.3", name: "x.png" }, width: 400, height: 200, index: 2, action: "translate", round: expect.any(Number), context: "mail-1" }])
    const result = document.querySelector<HTMLDetailsElement>(".tt-image-result")!
    expect(result.open).toBe(true)
    expect(result.querySelector("summary")!.textContent).toBe(`${ENGLISH.t("imageResultTitle", ["OpenAI"])} · ${ENGLISH.t("imageUsage", [1036, 80])}`)
    expect(Array.from(result.querySelectorAll("th"), (th) => th.textContent)).toEqual([ENGLISH.t("imageOriginal"), ENGLISH.t("imageTranslation")])
    expect(result.querySelector(".tt-image-body")!.getAttribute("lang")).toBe("zh-CN")
    expect(buttons()).toHaveLength(2)
  })

  it("shows a cached result at once, without a button", async () => {
    const { images, run } = mount((req) => ("part" in req.source && req.source.part === "1.2" ? { ...DONE, cached: true } : { status: "ready" }))
    images.start(run({ collapsed: true }))
    await until(() => expect(document.querySelector(".tt-image-result")).not.toBeNull())
    const result = document.querySelector<HTMLDetailsElement>(".tt-image-result")!
    expect(result.open).toBe(false)
    expect(result.querySelector("summary")!.textContent).toBe(`${ENGLISH.t("imageResultTitle", ["OpenAI"])} · ${ENGLISH.t("imageCached")}`)
    expect(buttons()).toHaveLength(2)
  })

  it("leaves the tokens out without the usage switch, and says when an answer was cut", async () => {
    const { images, run } = mount((req) => (req.action === "peek" ? { status: "ready" } : { ...DONE, truncated: true }))
    images.start(run({ showUsage: false }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(document.querySelector(".tt-image-result")).not.toBeNull())
    expect(document.querySelector(".tt-image-result summary")!.textContent).toBe(ENGLISH.t("imageResultTitle", ["OpenAI"]))
    expect(document.querySelector(".tt-image-body .tt-image-note")!.textContent).toBe(ENGLISH.t("imageTruncated"))
  })

  it("shows the reason of an image left out, nothing for the filters, and an error with a retry", async () => {
    const answers: Record<string, ImageResponse> = {
      "1.2": { status: "skipped", reason: "too small", quiet: true },
      "1.3": { status: "skipped", reason: "cannot be read" },
      "1.6": { status: "error", error: "HTTP 500" },
    }
    const { images, request, run } = mount((req) => (req.action === "peek" ? answers[(req.source as { part: string }).part] : DONE))
    images.start(run())
    await until(() => expect(slots()[2].textContent).toContain("HTTP 500"))
    expect(slots().map((slot) => slot.textContent)).toEqual(["", "cannot be read", `HTTP 500 ${ENGLISH.t("imageRetry")}`])
    slots()[2].querySelector("button")!.click()
    await until(() => expect(slots()[2].querySelector(".tt-image-result")).not.toBeNull())
    expect(sent(request, "translate")).toHaveLength(1)
  })

  it("says for three seconds that an image has no text after a click, and nothing in mode auto", async () => {
    useFakeTimers()
    const { images, run } = mount((req) => (req.action === "peek" ? { status: "ready" } : { status: "noText", service: "OpenAI" }))
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(slots()[0].textContent).toBe(ENGLISH.t("imageNoText")))
    expect(slots()[0].querySelector(".tt-image-fade")).not.toBeNull()
    await vi.advanceTimersByTimeAsync(NO_TEXT_MS)
    expect(slots()[0].textContent).toBe("")
    images.start(run({ mode: "auto" }))
    await until(() => expect(slots().every((slot) => slot.textContent === "")).toBe(true))
    // A cached answer without text shows nothing either.
    const cached = mount((req) => (req.action === "peek" ? { status: "noText", service: "OpenAI" } : DONE))
    cached.images.start(cached.run())
    await until(() => expect(cached.request).toHaveBeenCalledTimes(3))
    await nextTask()
    expect(slots().map((slot) => slot.textContent)).toEqual(["", "", ""])
  })
})

describe("the mode auto", () => {
  it("sends the first images up to the limit, in order, and gives the others the button", async () => {
    const { images, request, run } = mount()
    images.start(run({ mode: "auto", maxPerMessage: 2 }))
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(2))
    expect(sent(request, "translate").map((req) => req.index)).toEqual([1, 2])
    expect(buttons()).toHaveLength(1)
    expect(slots()[2].querySelector("button")).not.toBeNull()
  })

  it("does not count the images with a cached result", async () => {
    const { images, request, run } = mount((req) => (req.action === "peek" ? (req.index === 1 ? { ...DONE, cached: true } : { status: "ready" }) : DONE))
    images.start(run({ mode: "auto", maxPerMessage: 2 }))
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(3))
    expect(sent(request, "translate").map((req) => req.index)).toEqual([2, 3])
  })

  it("asks under the first image before the batch starts, naming how many images go; no gives every image its button", async () => {
    const need = { id: "gemini", host: "generativelanguage.googleapis.com" }
    const { images, request, grant, run } = mount()
    images.start(run({ mode: "auto", consent: need }))
    await until(() => expect(slots()[0].querySelector(".tt-image-consent")).not.toBeNull())
    const panel = slots()[0].querySelector<HTMLElement>(".tt-image-consent")!
    // S2: the three images of the batch.
    expect(panel.querySelector("strong")!.textContent).toBe(ENGLISH.t("imageConsentTitleAuto", [3, "Google Gemini"]))
    expect(panel.querySelector("button")!.textContent).toBe(ENGLISH.t("imageConsentAllowAuto"))
    expect(Array.from(panel.querySelectorAll("p"), (p) => p.textContent)).toEqual([ENGLISH.t("imageConsentWhat", [1568, "JPEG"]), ENGLISH.t("imageConsentPolicyGemini"), ENGLISH.t("imageConsentOnce")])
    expect(panel.querySelector("li")!.textContent).toBe(ENGLISH.t("consentService", ["Google Gemini", need.host]))
    expect(sent(request, "translate")).toEqual([])
    panel.querySelectorAll("button")[1].click()
    await until(() => expect(buttons()).toHaveLength(3))
    expect(grant).not.toHaveBeenCalled()
    // Allowed: the batch goes, and the next click asks no more.
    images.start(run({ mode: "auto", consent: need, maxPerMessage: 2 }))
    await until(() => expect(slots()[0].querySelector(".tt-image-consent")).not.toBeNull())
    slots()[0].querySelector<HTMLButtonElement>(".tt-image-consent button")!.click()
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(2))
    expect(grant).toHaveBeenCalledWith(["gemini"], false, ["generativelanguage.googleapis.com"])
    buttons()[0].click()
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(3))
    expect(grant).toHaveBeenCalledTimes(1)
  })
})

describe("the consent panel under a clicked image", () => {
  it("names what is sent and the policy of the service, and records the consent for the message only when asked each time", async () => {
    const { images, grant, run } = mount()
    images.start(run({ consent: { id: "openai", host: "api.openai.com" }, confirmEachMessage: true, format: "image/png", maxLongEdge: 1024 }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[1].click()
    const panel = () => slots()[1].querySelector<HTMLElement>(".tt-image-consent")
    await until(() => expect(panel()).not.toBeNull())
    expect(Array.from(panel()!.querySelectorAll("p"), (p) => p.textContent)).toEqual([ENGLISH.t("imageConsentWhat", [1024, "PNG"]), ENGLISH.t("imageConsentPolicyOpenai"), ENGLISH.t("imageConsentEach")])
    expect(Array.from(panel()!.querySelectorAll("button"), (b) => [b.textContent, b.title])).toEqual([
      [ENGLISH.t("imageConsentAllow"), ENGLISH.t("tipImageConsentAllow")],
      [ENGLISH.t("consentCancel"), ENGLISH.t("tipImageConsentCancel")],
    ])
    // A second click while the panel is open waits for the same answer.
    buttons()[0].click()
    panel()!.querySelector("button")!.click()
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(2))
    expect(grant).toHaveBeenCalledWith(["openai"], true, ["api.openai.com"])
  })

  it.each([
    ["anthropic", "imageConsentPolicyAnthropic", "WebP"],
    ["deepseek", "imageConsentPolicyOther", "JPEG"],
  ] as const)("says what %s does with the image", async (id, key, format) => {
    const { images, run } = mount()
    images.start(run({ consent: { id, host: "" }, format: format === "WebP" ? "image/webp" : "image/jpeg" }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(slots()[0].querySelector(".tt-image-consent")).not.toBeNull())
    const texts = Array.from(slots()[0].querySelectorAll(".tt-image-consent p, .tt-image-consent li"), (el) => el.textContent)
    expect(texts).toContain(ENGLISH.t(key))
    expect(texts[0]).toBe(ENGLISH.t("imageConsentWhat", [1568, format]))
  })
})

describe("settings changes, retranslation and stop", () => {
  it("draws the images again in a new mode without asking the service for what it already showed", async () => {
    const { images, request, run } = mount()
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(document.querySelector(".tt-image-result")).not.toBeNull())
    // The same settings change nothing.
    images.update(run().settings, "zh-CN")
    expect(document.querySelector(".tt-image-result")).not.toBeNull()
    images.update(run({ mode: "off" }).settings, "zh-CN")
    expect(slots()).toEqual([])
    images.update(run().settings, "zh-CN")
    await until(() => expect(buttons()).toHaveLength(2))
    expect(document.querySelector(".tt-image-result summary")!.textContent).toBe(`${ENGLISH.t("imageResultTitle", ["OpenAI"])} · ${ENGLISH.t("imageCached")}`)
    images.update(run({ mode: "auto" }).settings, "zh-CN")
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(3))
    expect(sent(request, "translate").map((req) => req.index)).toEqual([1, 2, 3])
    // A new target language asks again.
    const peeks = sent(request, "peek").length
    images.update(run({ mode: "auto" }).settings, "ja")
    await until(() => expect(sent(request, "peek").length).toBe(peeks + 3))
    // update() of a translator that never started does nothing.
    const idle = new ImageTranslator({ root: () => document.body, request, grant: vi.fn() })
    idle.update(run().settings, "zh-CN")
  })

  it("keeps an image on its way when the settings record the consent it was sent with", async () => {
    let answer!: (r: ImageResponse) => void
    const { images, request, run } = mount((req) => (req.action === "peek" ? { status: "ready" } : new Promise<ImageResponse>((resolve) => (answer = resolve))))
    const need = { id: "openai", host: "api.openai.com" }
    images.start(run({ consent: need }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(document.querySelector(".tt-image-consent")).not.toBeNull())
    document.querySelector<HTMLButtonElement>(".tt-image-consent button")!.click()
    await until(() => expect(sent(request, "translate")).toHaveLength(1))
    images.update(run({ consent: null }).settings, "zh-CN")
    answer(DONE)
    await until(() => expect(document.querySelector(".tt-image-result")).not.toBeNull())
    expect(sent(request, "peek")).toHaveLength(3)
  })

  it("forgets what it showed for a retranslation and asks past the cache", async () => {
    const { images, request, run } = mount()
    images.start(run({ mode: "auto" }))
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(3))
    images.start(run({ mode: "auto" }, { fresh: true }))
    await until(() => expect(sent(request, "translate")).toHaveLength(6))
    expect(sent(request, "translate").slice(3).every((req) => req.fresh === true)).toBe(true)
    expect(sent(request, "peek").slice(3).every((req) => req.fresh === true)).toBe(true)
  })

  it("removes every element on stop and drops answers that come later", async () => {
    let answer!: (r: ImageResponse) => void
    const { images, run } = mount((req) => (req.action === "peek" ? { status: "ready" } : new Promise<ImageResponse>((resolve) => (answer = resolve))))
    const before = document.body.innerHTML
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(slots()[0].querySelector(".tt-loading")).not.toBeNull())
    images.stop()
    expect(document.body.innerHTML).toBe(before)
    answer(DONE)
    await nextTask()
    expect(document.body.innerHTML).toBe(before)
    // A consent panel open at stop answers no.
    images.start(run({ consent: { id: "openai", host: "api.openai.com" } }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(document.querySelector(".tt-image-consent")).not.toBeNull())
    images.stop()
    await nextTask()
    expect(document.body.innerHTML).toBe(before)
  })

  it("takes an image that loads after the start, and none once stopped", async () => {
    const { images, request, run } = mount()
    const late = document.getElementById("c") as HTMLImageElement
    Object.defineProperty(late, "complete", { value: false, configurable: true })
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(2))
    Object.defineProperty(late, "complete", { value: true, configurable: true })
    late.dispatchEvent(new Event("load"))
    await until(() => expect(buttons()).toHaveLength(3))
    expect(sent(request, "peek").at(-1)!.source).toEqual({ part: "1.6", name: "x.png" })
    // Loaded after stop: nothing.
    Object.defineProperty(late, "complete", { value: false, configurable: true })
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(2))
    const round = sent(request, "peek").length
    images.stop()
    late.dispatchEvent(new Event("load"))
    await nextTask()
    expect(sent(request, "peek")).toHaveLength(round)
    // A load listener of an earlier run does nothing in a later one.
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(2))
  })

  it("does nothing without a message body", async () => {
    const request = vi.fn()
    const images = new ImageTranslator({ root: () => null, request, grant: vi.fn() })
    images.start({ settings: imageSettings({ mode: "ask" }), targetLang: "en", units: [] })
    await nextTask()
    expect(request).not.toHaveBeenCalled()
  })
})

describe("the limits and the layout of a message", () => {
  it("M2: draws the results again in place when only how they show changes, and sends nothing new", async () => {
    const { images, request, run } = mount()
    images.start(run({ mode: "auto" }))
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(3))
    const asked = request.mock.calls.length
    images.update(imageSettings({ mode: "auto", showUsage: false }), "zh-CN")
    images.update(imageSettings({ mode: "auto", showUsage: false, collapsed: true }), "zh-CN")
    expect(request.mock.calls.length).toBe(asked)
    expect(Array.from(document.querySelectorAll<HTMLDetailsElement>(".tt-image-result"), (d) => d.open)).toEqual([false, false, false])
  })

  it("M2: counts the images sent for the message across new settings and a stop, and again after a retranslation", async () => {
    const { images, request, run } = mount()
    images.start(run({ mode: "auto", maxPerMessage: 1 }))
    await until(() => expect(sent(request, "translate")).toHaveLength(1))
    await until(() => expect(buttons()).toHaveLength(2))
    // Another limit draws everything again, the translation goes off and on: the image sent counts, nothing more goes.
    images.update(imageSettings({ mode: "auto", maxPerMessage: 2, minSide: 50 }), "zh-CN")
    await until(() => expect(sent(request, "translate")).toHaveLength(2))
    images.stop()
    images.start(run({ mode: "auto", maxPerMessage: 2, minSide: 50 }))
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(2))
    await until(() => expect(buttons()).toHaveLength(1))
    await nextTask()
    expect(new Set(sent(request, "translate").map((req) => JSON.stringify(req.source))).size).toBe(2)
    images.start(run({ mode: "auto", maxPerMessage: 2, minSide: 50 }, { fresh: true }))
    await until(() => expect(sent(request, "translate").filter((req) => req.fresh)).toHaveLength(2))
  })

  it("S6: counts copies of one image once in mode auto", async () => {
    const copy = `<img src="${part("1.2")}">`
    const { images, request, run } = mount(undefined, `<p id="para">${copy}${copy}${copy}<img src="${part("1.3")}"><img src="${part("1.4")}"><img src="${part("1.5")}"><img src="${part("1.7")}"></p>`)
    images.start(run({ mode: "auto", maxPerMessage: 5 }))
    await until(() => expect(sent(request, "translate")).toHaveLength(7))
    expect(new Set(sent(request, "translate").map((req) => JSON.stringify(req.source))).size).toBe(5)
  })

  it("S4: peeks at the first images only, twice the limit; the others get the button at once", async () => {
    const many = Array.from({ length: 60 }, (_, i) => `<img src="${part(`2.${i + 1}`)}">`).join("")
    const { images, request, run } = mount(undefined, `<p id="para">${many}</p>`)
    images.start(run({ maxPerMessage: 5 }))
    await until(() => expect(buttons()).toHaveLength(60))
    expect(sent(request, "peek")).toHaveLength(10)
  })

  it("S1: asks again after the consent was taken back or is asked for each message", async () => {
    const need = { id: "openai", host: "api.openai.com" }
    const { images, run } = mount()
    images.start(run({ consent: need }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(document.querySelector(".tt-image-consent")).not.toBeNull())
    document.querySelector<HTMLButtonElement>(".tt-image-consent button")!.click()
    await until(() => expect(document.querySelectorAll(".tt-image-result")).toHaveLength(1))
    // The settings record it; then the settings page takes it back.
    images.update(imageSettings({ mode: "ask", consent: null }), "zh-CN")
    images.update(imageSettings({ mode: "ask", consent: need }), "zh-CN")
    await until(() => expect(buttons().length).toBeGreaterThan(0))
    buttons().at(-1)!.click()
    await until(() => expect(document.querySelector(".tt-image-consent")).not.toBeNull())
  })

  it("S5: puts the block inside a table cell or a list item, in both display modes, and takes it out again", async () => {
    const body = `<table><tbody><tr><td id="para"><img id="a" src="${part("1.2")}"> Umsatz im Quartal</td><td>Other</td></tr></tbody></table><ul><li id="item"><img id="b" src="${part("1.3")}"> Punkt</li></ul>`
    for (const mode of ["bilingual", "translation-only"] as const) {
      const { images, run, units } = mount(undefined, body)
      const before = document.body.innerHTML
      const renderer = new Renderer(document)
      units.push({ el: document.getElementById("item")!, text: "Punkt", pre: false })
      images.start(run())
      await until(() => expect(buttons()).toHaveLength(2))
      for (const unit of units) renderer.showTranslation(unit, `T(${unit.text})`, mode)
      expect(slots().map((slot) => slot.parentElement!.id)).toEqual(["para", "item"])
      expect(document.querySelectorAll("tr > .tt-image, ul > .tt-image")).toHaveLength(0)
      expect(buttons()).toHaveLength(2)
      renderer.clearAll()
      images.stop()
      expect([mode, document.body.innerHTML]).toEqual([mode, before])
    }
  })

  it("M5: the panel says the glossary goes along when it does", async () => {
    const { images, run } = mount()
    images.start(run({ consent: { id: "gemini", host: "g.example" }, glossary: true }, { context: "mail-1" }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(document.querySelector(".tt-image-consent")).not.toBeNull())
    expect(document.querySelector(".tt-image-consent")!.textContent).toContain(ENGLISH.t("imageConsentGlossary"))
    images.start(run({ consent: { id: "gemini", host: "g.example" }, glossary: false }, { context: "mail-1" }))
    await until(() => expect(buttons()).toHaveLength(3))
    buttons()[0].click()
    await until(() => expect(document.querySelector(".tt-image-consent")).not.toBeNull())
    expect(document.querySelector(".tt-image-consent")!.textContent).not.toContain(ENGLISH.t("imageConsentGlossary"))
  })
})

describe("with the controller", () => {
  const fakeImages = () => ({ start: vi.fn(), update: vi.fn(), stop: vi.fn() })

  it("starts the images with the translation, with the context of precise translation, and stops them with it", async () => {
    document.body.innerHTML = "<p>Hello world, this is a test.</p>"
    const images = fakeImages()
    const c = new TranslationController({ root: () => document.body, translate: answering((t) => ({ ok: true, text: `T(${t})` })), setContext: vi.fn(), images })
    await c.updateSettings(tieredSettings(["ai"], { precise: true, image: imageSettings({ mode: "ask" }) }))
    await c.start()
    expect(images.start).toHaveBeenCalledWith({ settings: imageSettings({ mode: "ask" }), targetLang: "zh-CN", units: expect.any(Array), context: expect.any(String) })
    // A new display mode or Markdown switch: the images get the settings, which change nothing for them.
    await c.updateSettings(tieredSettings(["ai"], { precise: true, mode: "translation-only", image: imageSettings({ mode: "auto" }) }))
    expect(images.update).toHaveBeenLastCalledWith(imageSettings({ mode: "auto" }), "zh-CN")
    await c.retranslate()
    expect(images.start).toHaveBeenLastCalledWith(expect.objectContaining({ fresh: true }))
    c.stop()
    expect(images.stop).toHaveBeenCalled()
  })

  it("starts the images without context outside precise translation", async () => {
    document.body.innerHTML = "<p>Hello world, this is a test.</p>"
    const images = fakeImages()
    const c = new TranslationController({ root: () => document.body, translate: answering((t) => ({ ok: true, text: `T(${t})` })), images })
    await c.updateSettings(publicSettings())
    await c.start()
    expect(images.start.mock.calls[0][0]).not.toHaveProperty("context")
    expect(images.start.mock.calls[0][0]).not.toHaveProperty("fresh")
  })
})

describe("over the Port of the client", () => {
  it("sends the image requests and the consent, and settles what waits when the background goes away", async () => {
    const port = pagePort()
    vi.stubGlobal("browser", { runtime: { connect: () => port, sendMessage: async () => undefined }, i18n: { detectLanguage: async () => ({ isReliable: false, languages: [] }) } })
    document.body.innerHTML = `<p>Text</p><div class="moz-attached-image-container"><img class="moz-attached-image" src="${part("1.2")}"></div>`
    sizeImages()
    let parts!: ContentProbeParts
    connectContent({ root: () => document.body, contentScript: true, probe: { attach: (p) => (parts = p), state: () => {}, push: () => {} } })
    port.push({ type: "settings", settings: publicSettings() })
    await parts.ready
    parts.images!.start({ settings: imageSettings({ mode: "ask", consent: { id: "openai", host: "api.openai.com" } }), targetLang: "zh-CN", units: [] })
    await until(() => expect(port.posted("image")).toHaveLength(1))
    const [peek] = port.posted("image")
    port.push({ type: "imageResult", id: peek.id, result: { status: "ready" } })
    await until(() => expect(buttons()).toHaveLength(1))
    buttons()[0].click()
    await until(() => expect(document.querySelector(".tt-image-consent")).not.toBeNull())
    document.querySelector<HTMLButtonElement>(".tt-image-consent button")!.click()
    await until(() => expect(port.posted("image")).toHaveLength(2))
    expect(port.posted("imageConsent")).toEqual([{ type: "imageConsent", ids: ["openai"], hosts: ["api.openai.com"] }])
    port.disconnect()
    await until(() => expect(document.querySelector(".tt-image")!.textContent).toContain(ENGLISH.t("errUnknown")))
    // Without the Port, a request fails at once.
    port.postMessage.mockImplementation(() => {
      throw new Error("disconnected")
    })
    document.querySelector<HTMLButtonElement>(".tt-image button")!.click()
    await nextTask()
    expect(document.querySelector(".tt-image")!.textContent).toContain(ENGLISH.t("errUnknown"))
  })

  it("has no images on an extension page", async () => {
    const port = pagePort()
    vi.stubGlobal("browser", { runtime: { connect: () => port, sendMessage: async () => undefined }, i18n: { detectLanguage: async () => ({ isReliable: false, languages: [] }) } })
    let parts!: ContentProbeParts
    connectContent({ root: () => document.body, probe: { attach: (p) => (parts = p), state: () => {}, push: () => {} } })
    expect(parts.images).toBeUndefined()
  })
})

describe("translation-only display", () => {
  it("keeps the images of a paragraph after its translation, except remote ones, and puts the original back", () => {
    document.body.innerHTML = `<p>See <img src="${part("1.2")}" alt="chart"> and <img src="https://example.com/r.png"> here.</p>`
    const p = document.querySelector("p")!
    const original = p.innerHTML
    const renderer = new Renderer(document)
    const unit: Unit = { el: p, text: "See and here.", pre: false }
    renderer.showTranslation(unit, "看这里。", "translation-only")
    const kept = Array.from(p.querySelectorAll(".tt-translation img"), (img) => img.getAttribute("src"))
    expect(kept).toEqual([part("1.2")])
    renderer.clear(unit)
    expect(p.innerHTML).toBe(original)
    renderer.showTranslation(unit, "看这里。", "bilingual")
    expect(p.querySelectorAll(".tt-translation img")).toHaveLength(0)
  })
})

describe("remote images", () => {
  const R1 = "https://cdn.example.com/offer.png"
  const R2 = "https://cdn.example.com/coupon.png"
  const REMOTE_BODY = `<p id="para">This week: <a href="https://example.com/shop"><img id="r1" src="${R1}"></a></p>
<p><img id="r2" src="${R2}" width="300" height="300"></p>
<img id="beacon" src="https://track.example.com/p.gif" width="1" height="1">
<div class="moz-signature"><img id="sig" src="https://cdn.example.com/logo.png" width="300" height="300"></div>
<img id="blob" src="blob:https://example.com/0f1e">
<img id="tiny" src="https://cdn.example.com/icon.png">`

  /** A translator over REMOTE_BODY: r1, blob and tiny loaded (tiny at 16 × 16), r2, beacon and sig blocked; a remote peek answers "access" until `access.granted`. */
  function mountRemote(access = { granted: false }) {
    const mounted = mount((req) => {
      if ("url" in req.source && !access.granted) return { status: "access" }
      return req.action === "peek" ? { status: "ready" } : DONE
    }, REMOTE_BODY)
    sizeImages({ r2: [0, 0], beacon: [0, 0], sig: [0, 0], tiny: [16, 16] })
    return { ...mounted, access }
  }
  const noticeLines = () => Array.from(document.querySelectorAll(".tt-image-notice li"), (li) => li.firstChild?.textContent)

  it("takes a remote image Thunderbird shows by its address, and counts the blocked ones and the unreadable ones in one notice", async () => {
    const { images, request, run } = mountRemote({ granted: true })
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(1))
    expect(sent(request, "peek").map((req) => req.source)).toEqual([{ url: R1 }])
    // After the paragraph that holds the image.
    expect(document.getElementById("para")!.nextElementSibling).toBe(slots()[0])
    // The pixel by its attributes and the logo of the signature do not count; the icon is too small to count.
    expect(noticeLines()).toEqual([ENGLISH.t("imageNoticeUnloaded", [1]), ENGLISH.t("imageNoticeUnreadable", [1])])
    expect(images.leftOut).toEqual({ access: 0, unloaded: 1, unreadable: 1 })
    expect(document.body.firstElementChild!.classList.contains("tt-image-notice")).toBe(true)
    expect(document.querySelector(".tt-image-notice")!.getAttribute("aria-label")).toBe(ENGLISH.t("imageNoticeTitle"))
  })

  it("counts nothing when the sources leave out the images of the body, and draws nothing while off", async () => {
    const { images, request, run } = mountRemote({ granted: true })
    images.start(run({ sources: { inline: false, attachments: true } }))
    await nextTask()
    expect([buttons(), noticeLines()]).toEqual([[], []])
    images.start(run({ mode: "off" }))
    await nextTask()
    expect([document.querySelector(".tt-image-notice"), request.mock.calls.length]).toEqual([null, 0])
  })

  it("asks for the access with a click when it is missing, and sends the clicked image once it is there", async () => {
    const { images, request, run, requestAccess, reportRemote, access } = mountRemote()
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(1))
    expect(noticeLines()[0]).toBe(ENGLISH.t("imageNoticeAccess", [1]))
    expect(reportRemote).toHaveBeenLastCalledWith(1)
    buttons()[0].click()
    await until(() => expect(requestAccess).toHaveBeenCalledTimes(1))
    expect(slots()[0].querySelector(".tt-image-note")!.textContent).toBe(ENGLISH.t("imageAccessAsked"))
    expect(sent(request, "translate")).toEqual([])
    // The button of the notice asks too.
    document.querySelector<HTMLButtonElement>(".tt-image-notice li button")!.click()
    expect(requestAccess).toHaveBeenCalledTimes(2)
    // Allowed in the popup: the settings come again with a new count of the host permissions.
    access.granted = true
    images.update(imageSettings({ mode: "ask", hostAccess: 1 }), "zh-CN")
    await until(() => expect(document.querySelector(".tt-image-result")).not.toBeNull())
    expect(sent(request, "translate").map((req) => req.source)).toEqual([{ url: R1 }])
    expect(noticeLines()).toEqual([ENGLISH.t("imageNoticeUnloaded", [1]), ENGLISH.t("imageNoticeUnreadable", [1])])
    expect(reportRemote).toHaveBeenLastCalledWith(0)
  })

  it("in mode auto sends nothing without the access and the remote images once it is there", async () => {
    const { images, request, run, access } = mountRemote()
    images.start(run({ mode: "auto" }))
    await until(() => expect(buttons()).toHaveLength(1))
    expect(sent(request, "translate")).toEqual([])
    access.granted = true
    images.update(imageSettings({ mode: "auto", hostAccess: 1 }), "zh-CN")
    await until(() => expect(document.querySelector(".tt-image-result")).not.toBeNull())
    expect(sent(request, "translate").map((req) => req.source)).toEqual([{ url: R1 }])
  })

  it("asks for the access after a click on an image beyond the ones peeked at", async () => {
    const { images, request, run, requestAccess } = mountRemote()
    images.start(run({ maxPerMessage: 0 }))
    await until(() => expect(buttons()).toHaveLength(1))
    expect(sent(request, "peek")).toEqual([])
    buttons()[0].click()
    await until(() => expect(requestAccess).toHaveBeenCalledTimes(1))
    expect(sent(request, "translate").map((req) => req.source)).toEqual([{ url: R1 }])
    expect(noticeLines()[0]).toBe(ENGLISH.t("imageNoticeAccess", [1]))
  })

  it("keeps the notice away for the message once closed, and removes it with the rest on stop", async () => {
    const { images, run, reportRemote } = mountRemote()
    images.start(run())
    await until(() => expect(noticeLines()[0]).toBe(ENGLISH.t("imageNoticeAccess", [1])))
    images.stop()
    expect(document.querySelector(".tt-image-notice")).toBeNull()
    expect(reportRemote).toHaveBeenLastCalledWith(0)
    images.start(run())
    await until(() => expect(document.querySelector(".tt-image-notice")).not.toBeNull())
    Array.from(document.querySelectorAll<HTMLButtonElement>(".tt-image-notice .tt-notice-actions button")).at(-1)!.click()
    expect(document.querySelector(".tt-image-notice")).toBeNull()
    images.start(run())
    await until(() => expect(buttons()).toHaveLength(1))
    expect(document.querySelector(".tt-image-notice")).toBeNull()
  })

  it("counts a remote image that fails to load after the start", async () => {
    const { images, run } = mountRemote({ granted: true })
    const late = document.getElementById("r1") as HTMLImageElement
    Object.defineProperty(late, "complete", { value: false, configurable: true })
    images.start(run())
    await nextTask()
    expect(buttons()).toHaveLength(0)
    Object.defineProperty(late, "complete", { value: true, configurable: true })
    Object.defineProperty(late, "naturalWidth", { value: 0, configurable: true })
    late.dispatchEvent(new Event("error"))
    expect(images.leftOut.unloaded).toBe(2)
    expect(noticeLines()[0]).toBe(ENGLISH.t("imageNoticeUnloaded", [2]))
  })
})
