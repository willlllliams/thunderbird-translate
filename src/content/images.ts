/**
 * The text in the images of a translated message, under each image.
 *
 * While the message is translated, every image of the body and every image
 * attachment Thunderbird shows under it goes through the filters of
 * shared/image.ts (remote images never); the background script reads the
 * bytes of those that pass, applies the filters on the bytes and tells
 * whether a result is cached ("peek", nothing is sent). Then, by the mode of
 * the settings:
 *
 * - "ask": a "Translate image text" button under each image; a click sends that image only;
 * - "auto": the first images, up to the limit per message, are sent one
 *   after the other in the order of the message; the others get the button;
 * - "off": nothing.
 *
 * A cached result shows at once, without a button. Before the first image
 * goes to a service the user has not allowed to receive images, a panel
 * under the clicked image (in "auto" under the first one) asks; the
 * background script checks the consent again. The result is a collapsible
 * block under the image (after the container of an image attachment, after
 * a paragraph or a link that holds the image), its Markdown rendered with
 * tables and the column names in the interface language. An answer NO_TEXT
 * shows a grey line for three seconds after a click and nothing in "auto".
 *
 * A change of the mode or of the image settings draws everything again
 * without reloading the message, as a change of the display mode does; the
 * results come from the memory of this page or the cache. A retranslation
 * forgets them: "ask" shows the buttons again, "auto" asks the service again.
 * stop() removes every element it added.
 */

import { button, h } from "../shared/dom"
import { getI18n, type MessageKey, t } from "../shared/i18n"
import { filterImage, imageSource } from "../shared/image"
import { TABLE_HEADER } from "../shared/image-prompt"
import { markdownFragment } from "../shared/markdown"
import type { ImageRequest, ImageResponse } from "../shared/messages"
import { getPreset, providerDisplayName } from "../shared/providers"
import type { ConsentNeed, PublicImageSettings } from "../shared/settings"
import { CLS_IMAGE, CLS_NOTICE, CLS_ORIGINAL, type Unit } from "./paragraphs"

/** How long the line about an image without text stays. */
export const NO_TEXT_MS = 3000


/** What the consent panel says about the data policy of a service; the others handle images by their own privacy policy. */
const POLICY_KEYS: Record<string, MessageKey> = { anthropic: "imageConsentPolicyAnthropic", gemini: "imageConsentPolicyGemini", openai: "imageConsentPolicyOpenai" }

export interface ImageTranslatorDeps {
  root: () => HTMLElement | null
  /** An image request to the background script. */
  request: (req: ImageRequest) => Promise<ImageResponse>
  /** The user allowed `ids` to receive images; `message`: for this message only. */
  grant: (ids: string[], message: boolean) => void
}

/** What the translation of the message tells: the settings, its paragraphs (an image inside one gets its block after it), the context of precise translation, and whether it is a retranslation. */
export interface ImageRun {
  settings: PublicImageSettings
  targetLang: string
  units: readonly Unit[]
  context?: string
  fresh?: boolean
}

/** One image that passed the filters of this page, with the element under it. */
interface Entry {
  img: HTMLImageElement
  source: ImageRequest["source"]
  index: number
  /** The element after which the block goes. */
  anchor: Element
  slot: HTMLElement
}

export class ImageTranslator {
  private run: ImageRun | null = null
  /** Counts the runs: an answer of an earlier run is dropped, and the background script counts its limits per run. */
  private round = 0
  private entries: Entry[] = []
  /** Images still loading, with their listeners. */
  private waiting = new Map<HTMLImageElement, () => void>()
  /** Images sent by themselves in this run ("auto"). */
  private autoSent = 0
  /** Services allowed in a panel of this message, before the settings that record them arrive. */
  private allowed = new Set<string>()
  /** The open consent panel and its answer, shared by every image that waits for it. */
  private consent: { el: HTMLElement; answer: Promise<boolean>; settle: (allowed: boolean) => void } | null = null
  /** Results of this page by image and signature of the settings: a new mode draws them again without asking. */
  private memo = new Map<string, ImageResponse>()

  constructor(private readonly deps: ImageTranslatorDeps) {}

  /** The images on screen that passed the filters, in the order of the message; read by the e2e probe. */
  get shown(): number {
    return this.entries.length
  }

  /** Start for a translated message; a run on screen is replaced. */
  start(run: ImageRun): void {
    this.stop()
    if (run.fresh) this.memo.clear()
    this.run = run
    if (run.settings.mode === "off") return
    const root = this.deps.root()
    if (!root) return
    // In translation-only mode the originals of a unit are hidden and their copies follow the translation.
    for (const img of Array.from(root.querySelectorAll("img"))) if (!img.closest(`.${CLS_ORIGINAL}`)) this.consider(img)
    void this.peekAll(this.entries.slice(), this.round)
  }

  /**
   * New settings while the message is translated: everything is drawn again when anything of the images changed,
   * except the consent, which the settings record after a panel of this page allowed it while images are on their way.
   */
  update(next: PublicImageSettings, targetLang: string): void {
    const run = this.run
    if (!run) return
    const drawn = ({ consent: _consent, ...rest }: PublicImageSettings) => JSON.stringify(rest)
    if (drawn(run.settings) !== drawn(next) || run.targetLang !== targetLang) return this.start({ ...run, settings: next, targetLang, fresh: false })
    run.settings = next
  }

  /** The translation stopped: every added element goes, answers still on their way are dropped. */
  stop(): void {
    this.round++
    this.run = null
    this.autoSent = 0
    this.consent?.settle(false)
    for (const [img, listener] of this.waiting) img.removeEventListener("load", listener)
    this.waiting.clear()
    for (const entry of this.entries) entry.slot.remove()
    this.entries = []
  }

  /** An image of the message: an entry with its slot when it passes the filters; once loaded when it is still loading. */
  private consider(img: HTMLImageElement): void {
    const run = this.run!
    const src = img.currentSrc || img.src
    const source = imageSource(src)
    if (source.kind === "remote" || source.kind === "other") return
    if (!img.complete || img.naturalWidth === 0) {
      const round = this.round
      const listener = () => {
        this.waiting.delete(img)
        if (round !== this.round) return
        this.consider(img)
        const entry = this.entries.find((e) => e.img === img)
        if (entry) void this.peekAll([entry], round)
      }
      this.waiting.set(img, listener)
      img.addEventListener("load", listener, { once: true })
      return
    }
    const candidate = { width: img.naturalWidth, height: img.naturalHeight, src, inSignature: img.closest(".moz-signature, .moz-txt-sig") !== null, attachment: img.closest(".moz-attached-image-container") !== null || img.classList.contains("moz-attached-image") }
    if (filterImage(candidate, run.settings) !== null) return
    const anchor = img.closest(".moz-attached-image-container") ?? run.units.find((unit) => unit.el.contains(img))?.el ?? img.closest("a") ?? img
    const slot = h("div", { className: CLS_IMAGE, lang: getI18n().lang, dir: getI18n().dir })
    // After the anchor, and after the slots of the images before this one under the same anchor.
    const before = this.entries.filter((e) => e.anchor === anchor).at(-1)?.slot ?? anchor
    before.after(slot)
    this.entries.push({ img, source: source.kind === "part" ? { part: source.part } : { data: source.data }, index: this.entries.length + 1, anchor, slot })
  }

  private request(entry: Entry, action: ImageRequest["action"]): Promise<ImageResponse> {
    const run = this.run!
    return this.deps.request({
      source: entry.source,
      width: entry.img.naturalWidth,
      height: entry.img.naturalHeight,
      index: entry.index,
      action,
      round: this.round,
      ...(run.context ? { context: run.context } : {}),
      ...(run.fresh ? { fresh: true } : {}),
    })
  }

  private memoKey(entry: Entry): string {
    return `${this.run!.settings.signature}|${this.run!.targetLang}|${JSON.stringify(entry.source)}`
  }

  /** Peek at `entries`: a known result shows, an image that may be sent gets the button or, in "auto", is sent. */
  private async peekAll(entries: Entry[], round: number): Promise<void> {
    const answers = await Promise.all(entries.map((entry) => this.memo.get(this.memoKey(entry)) ?? this.request(entry, "peek")))
    if (round !== this.round) return
    const auto = this.run!.settings.mode === "auto"
    const send: Entry[] = []
    entries.forEach((entry, i) => {
      const answer = answers[i]
      if (answer.status !== "ready") return this.show(entry, answer, false)
      if (auto && this.autoSent < this.run!.settings.maxPerMessage) {
        this.autoSent++
        send.push(entry)
      } else this.showButton(entry)
    })
    if (send.length === 0) return
    if (!(await this.ensureConsent(send[0]))) {
      if (round === this.round) for (const entry of send) this.showButton(entry)
      return
    }
    // In the order of the message: the queue of the background script sends them in the order they arrive.
    await Promise.all(send.map((entry) => this.translate(entry, round)))
  }

  /** Send one image and show the answer. */
  private async translate(entry: Entry, round: number): Promise<void> {
    this.showReading(entry)
    const answer = await this.request(entry, "translate")
    if (round !== this.round) return
    if (answer.status === "done" || answer.status === "noText") this.memo.set(this.memoKey(entry), { ...answer, ...(answer.status === "done" ? { cached: true, usage: undefined } : {}) })
    this.show(entry, answer, true)
  }

  /** A click on the button: the consent first, then the image. */
  private async click(entry: Entry): Promise<void> {
    const round = this.round
    if (!(await this.ensureConsent(entry))) {
      if (round === this.round) this.showButton(entry)
      return
    }
    if (round === this.round) await this.translate(entry, round)
  }

  /** Whether the vision service may receive images: allowed already, or allowed now in the panel under `entry`. */
  private ensureConsent(entry: Entry): Promise<boolean> {
    const need = this.run!.settings.consent
    if (!need || this.allowed.has(need.id)) return Promise.resolve(true)
    if (this.consent) return this.consent.answer
    let settle!: (allowed: boolean) => void
    const answer = new Promise<boolean>((resolve) => (settle = resolve))
    const el = this.consentPanel(need)
    this.consent = {
      el,
      answer,
      settle: (allowed) => {
        el.remove()
        this.consent = null
        if (allowed) {
          this.allowed.add(need.id)
          this.deps.grant([need.id], this.run?.settings.confirmEachMessage === true)
        }
        settle(allowed)
      },
    }
    entry.slot.replaceChildren(el)
    el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true })
    return answer
  }

  /** The panel that asks before images go to a service: what is sent, where to, the data policy of the service, and the two buttons. */
  private consentPanel(need: ConsentNeed): HTMLElement {
    const s = this.run!.settings
    const preset = getPreset(need.id)
    const name = preset ? providerDisplayName(preset) : need.id
    const format = s.format === "image/png" ? "PNG" : s.format === "image/webp" ? "WebP" : "JPEG"
    const title = t("imageConsentTitle", [name])
    return h(
      "div",
      { className: `${CLS_NOTICE} tt-consent tt-image-consent`, role: "region", "aria-label": title },
      h("strong", { text: title }),
      h("p", { text: t("imageConsentWhat", [s.maxLongEdge, format]) }),
      h("ul", {}, h("li", { text: need.host ? t("consentService", [name, need.host]) : name })),
      h("p", { text: t(POLICY_KEYS[need.id] ?? "imageConsentPolicyOther") }),
      h("p", { text: t(s.confirmEachMessage ? "imageConsentEach" : "imageConsentOnce") }),
      h("div", { className: "tt-notice-actions" }, button(t("imageConsentAllow"), () => this.consent?.settle(true), true, t("tipImageConsentAllow")), button(t("consentCancel"), () => this.consent?.settle(false), false, t("tipImageConsentCancel"))),
    )
  }

  private showButton(entry: Entry): void {
    entry.slot.replaceChildren(button(t("imageButton"), () => void this.click(entry), false, t("tipImageButton")))
  }

  private showReading(entry: Entry): void {
    entry.slot.replaceChildren(h("span", { className: "tt-image-note", role: "status" }, h("span", { className: "tt-status tt-loading", "aria-hidden": "true" }), ` ${t("imageReading")}`))
  }

  /** The answer under an image; `clicked`: it came from a request of this run, so an image without text says so for a moment. */
  private show(entry: Entry, answer: ImageResponse, clicked: boolean): void {
    const slot = entry.slot
    switch (answer.status) {
      case "done":
        return void slot.replaceChildren(this.result(answer))
      case "noText": {
        if (!clicked || this.run?.settings.mode === "auto") return void slot.replaceChildren()
        slot.replaceChildren(h("span", { className: "tt-image-note tt-image-fade", text: t("imageNoText") }))
        const round = this.round
        setTimeout(() => round === this.round && slot.replaceChildren(), NO_TEXT_MS)
        return
      }
      case "skipped":
        return void slot.replaceChildren(...(answer.quiet ? [] : [h("span", { className: "tt-image-note", text: answer.reason })]))
      case "error": {
        const retry = button(t("imageRetry"), () => void this.click(entry), false, t("tipImageRetry"))
        return void slot.replaceChildren(h("span", { className: "tt-image-note tt-error-text", text: answer.error }), " ", retry)
      }
      case "ready":
        return this.showButton(entry)
    }
  }

  /** The collapsible block with the text of an image: the service and the tokens in its title, the Markdown with tables in its body. */
  private result(answer: Extract<ImageResponse, { status: "done" }>): HTMLElement {
    const run = this.run!
    const doc = this.deps.root()!.ownerDocument
    const extra = answer.cached ? t("imageCached") : answer.usage ? t("imageUsage", [answer.usage.input, answer.usage.output]) : ""
    const body = h("div", { className: "tt-translation tt-image-body", dir: "auto", lang: run.targetLang })
    body.appendChild(markdownFragment(doc, answer.text, { rich: true, header: { from: TABLE_HEADER, to: [t("imageOriginal"), t("imageTranslation")] } }))
    if (answer.truncated) body.appendChild(h("p", { className: "tt-image-note", text: t("imageTruncated") }))
    return h("details", { className: "tt-image-result", open: !run.settings.collapsed }, h("summary", { title: t("tipImageResult") }, [t("imageResultTitle", [answer.service]), ...(extra && (answer.cached || run.settings.showUsage) ? [extra] : [])].join(" · ")), body)
  }
}
