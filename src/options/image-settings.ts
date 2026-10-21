/**
 * The image settings of the settings page, under the switch of precise
 * translation: the mode, the vision service and model with what is known of
 * the model (whether it reads images, the tokens of one image), "Test image",
 * and the advanced settings in a collapsed section. The whole group is
 * greyed out while precise translation is off; its values stay.
 */

import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { imagePromptTokens } from "../shared/image-prompt"
import { getLanguage } from "../shared/languages"
import { send } from "../shared/messages"
import { $, fillSelect, showImagePreciseNote, visionHint } from "../shared/page"
import { promptText } from "../shared/prompts"
import { getPreset, providerDisplayName, tierOf } from "../shared/providers"
import { addedProviders, emptyProviderConfig, IMAGE_DECIMALS, type ImageSettings, imageStatus, type Settings } from "../shared/settings"
import { imageTokens, PRICE_PAGES, SUGGESTED_VISION_MODELS } from "../shared/vision"
import { h } from "../shared/dom"
import { requestHostAccess } from "./host-access"
import type { SettingsSession } from "./session"

/** The size of the image of the token estimate. */
const SAMPLE = { width: 1024, height: 768 }

/** The upload formats and their names, the same in every language. */
const FORMATS: [ImageSettings["format"], string][] = [
  ["jpeg", "JPEG"],
  ["webp", "WebP"],
  ["png", "PNG"],
]

/** The fields of the advanced settings, each bound to its setting. */
const NUMBERS: [string, keyof ImageSettings][] = [
  ["imageMax", "maxPerMessage"],
  ["imageMinSide", "minSide"],
  ["imageMinArea", "minArea"],
  ["imageMaxAspect", "maxAspect"],
  ["imageMinKB", "minKB"],
  ["imageLongEdge", "maxLongEdge"],
  ["imageQuality", "quality"],
  ["imageMaxKB", "maxImageKB"],
  ["imageMaxMB", "maxMessageMB"],
  ["imageMaxTokens", "maxOutputTokens"],
  ["imageTimeout", "timeoutSeconds"],
  ["imageConcurrency", "concurrency"],
]
const CHOICES: [string, keyof ImageSettings][] = [
  ["imageMode", "mode"],
  ["imageAnimated", "animated"],
  ["imageFormat", "format"],
  ["imageDetail", "detail"],
  ["imageOutput", "output"],
  ["imageNoText", "noText"],
  ["imageDisplay", "display"],
]
const SWITCHES: [string, keyof ImageSettings][] = [
  ["imageSignature", "skipSignature"],
  ["imageShowSource", "showSource"],
  ["imageContext", "useContext"],
  ["imageUsage", "showUsage"],
  ["imageConfirm", "confirmEachMessage"],
]

/** The estimate of the tokens of one image under the model: of the image by the formula of its service, of the prompts by their length. */
export function costHint(settings: Settings): string {
  const status = imageStatus(settings)
  if (!status.id) return ""
  const prompt = imagePromptTokens(promptText(settings.prompts, "image"), getLanguage(settings.targetLang).english, settings.image)
  const tokens = imageTokens(status.id, status.model, SAMPLE.width, SAMPLE.height, settings.image.detail)
  return tokens === null ? t("hintVisionCostUnknown", [status.model, prompt]) : t("hintVisionCost", [tokens, prompt])
}

export class ImageSettingsSection {
  private readonly result = $("imageTestResult")

  constructor(private readonly session: SettingsSession) {
    fillSelect($<HTMLSelectElement>("imageFormat"), FORMATS.map(([value, name]) => new Option(name, value)), session.settings.image.format)
    const s = () => session.settings.image
    const set = <K extends keyof ImageSettings>(key: K, value: ImageSettings[K]) => (s()[key] = value)
    for (const [id, key] of NUMBERS) session.bindNumber(id, () => s()[key] as number, (v) => set(key, v as never), IMAGE_DECIMALS.has(key))
    for (const [id, key] of CHOICES) session.bind(id, "change", (el) => (el.value = String(s()[key])), (el) => set(key, el.value as never))
    for (const [id, key] of SWITCHES) session.bindCheck(id, () => s()[key] as boolean, (v) => set(key, v as never))
    session.bindCheck("imageInline", () => s().sources.inline, (v) => (s().sources.inline = v))
    session.bindCheck("imageAttachments", () => s().sources.attachments, (v) => (s().sources.attachments = v))
    session.bind("imageProvider", "change", () => this.refresh(), (el) => {
      s().provider = el.value || null
      this.refresh()
    })
    session.bind("imageModel", "input", (el) => (el.value = s().model), (el) => {
      s().model = el.value.trim()
      this.refresh()
    })
    // The model and the estimate follow every change that bears on them, also made elsewhere.
    session.track($("imageCost"), () => this.refresh())
    for (const id of ["imageMode", "imageDetail", "imageOutput", "imageNoText", "imageShowSource"]) $(id).addEventListener("change", () => this.refresh())
    $("imageTest").addEventListener("click", () => void this.test())
  }

  /** The services, the model hints and the estimate, from the settings of the page. */
  refresh(): void {
    const settings = this.session.settings
    $<HTMLFieldSetElement>("imageGroup").disabled = !showImagePreciseNote(settings)
    const chosen = settings.image.provider
    const services = addedProviders(settings).filter((p) => tierOf(p) === "ai")
    fillSelect($<HTMLSelectElement>("imageProvider"), [new Option(t("summaryProviderTier"), ""), ...services.map((p) => new Option(providerDisplayName(p), p.id))], chosen && settings.providers[chosen]?.enabled ? chosen : "")
    const status = imageStatus(settings)
    const preset = status.id ? getPreset(status.id) : undefined
    const model = $<HTMLInputElement>("imageModel")
    model.placeholder = status.id ? (settings.providers[status.id]?.model || preset?.defaultModel || "") : ""
    const suggested = status.id ? SUGGESTED_VISION_MODELS[status.id] : undefined
    $("imageModels").replaceChildren(...[...new Set([...(suggested ? [suggested] : []), ...(preset?.models ?? [])])].map((m) => h("option", { value: m })))
    const hint = visionHint(status)
    $("imageSupport").hidden = !hint
    $("imageSupport").textContent = hint
    $("imageCost").textContent = costHint(settings)
    const prices = $<HTMLAnchorElement>("imagePrices")
    const page = status.id ? PRICE_PAGES[status.id] : undefined
    prices.hidden = !page
    if (page) prices.href = page
    $<HTMLButtonElement>("imageTest").disabled = !status.id
  }

  /** Send the built-in test image to the vision service with its configuration on this page, saved or not. */
  private async test(): Promise<void> {
    const settings = this.session.settings
    const id = imageStatus(settings).id
    if (!id) return
    const config = { ...(settings.providers[id] ?? emptyProviderConfig()) }
    // First, while the click is being handled: Thunderbird asks the user only from a user action.
    const access = requestHostAccess(id, config)
    const button = $<HTMLButtonElement>("imageTest")
    this.result.className = "test-result"
    this.result.textContent = t("testRunning")
    button.disabled = true
    try {
      await access
      const r = await send({ type: "testVision", providerId: id, config, model: settings.image.model })
      this.result.className = `test-result ${r?.ok ? "ok" : "fail"}`
      this.result.textContent = r?.ok ? t("testImageOk", [r.text]) : (r?.error ?? describeError(undefined, getI18n()))
    } catch (error) {
      this.result.className = "test-result fail"
      this.result.textContent = describeError(error, getI18n())
    } finally {
      button.disabled = false
    }
  }
}
