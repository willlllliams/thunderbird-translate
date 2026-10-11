/**
 * Translation state of one displayed message.
 *
 * start(): find paragraphs, drop those already in the target language, ask
 * the background for each translation (the background merges them into
 * batches) and render results as they arrive. In race mode a provisional
 * result may arrive first and is replaced by the final one. In precise mode
 * the message text is registered with the background as context first.
 * stop(): remove every inserted node and restore the original DOM.
 * Settings changes while active: a new display mode re-renders from the
 * translations already held; a new target language or provider stops and
 * starts again (the background cache answers what it already knows).
 */

import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { createMailContext, type MailContext } from "../shared/mail-context"
import type { TabState, TranslateRequest, TranslateResponse } from "../shared/messages"
import type { PublicSettings } from "../shared/settings"
import { isInTargetLanguage, type LanguageDetector } from "./lang-detect"
import { type Collected, collectParagraphs, extractText, type Unit } from "./paragraphs"
import { Renderer, type TranslationMark } from "./render"
import { hasTranslatableText } from "./text"

export interface ControllerDeps {
  root: () => HTMLElement | null
  /** Final result as promise; a provisional one (race mode) through the callback. */
  translate: (request: TranslateRequest, onProvisional: (text: string) => void) => Promise<TranslateResponse>
  /** Precise mode: register the message with the background before its paragraphs are requested. */
  setContext?: (context: MailContext) => void
  detect?: LanguageDetector
  report?: (state: Omit<TabState, "connected">) => void
}

type UnitResult =
  | { status: "loading" }
  | { status: "provisional"; text: string }
  | { status: "done"; text: string }
  /** `fallback`: the fast service's translation, kept when the AI request failed. */
  | { status: "error"; error: string; fallback?: string }

const STYLE_ID = "tt-style-vars"

export class TranslationController {
  active = false
  private settings: PublicSettings | null = null
  private session = 0
  private collected: Collected | null = null
  private units: Unit[] = []
  private context: MailContext | null = null
  private results = new Map<Unit, UnitResult>()
  private renderer: Renderer | null = null
  /** Final translations already received, keyed by provider + language + text. */
  private memo = new Map<string, string>()
  private lastError = ""

  constructor(private readonly deps: ControllerDeps) {}

  private report(): void {
    const count = { done: 0, provisional: 0, failed: 0 }
    for (const r of this.results.values()) {
      if (r.status === "done") count.done++
      else if (r.status === "provisional") count.provisional++
      else if (r.status === "error") count.failed++
    }
    this.deps.report?.({
      active: this.active,
      total: this.units.length,
      ...count,
      ...(count.failed > 0 && this.lastError ? { lastError: this.lastError } : {}),
    })
  }

  /** Apply new settings. Returns a promise that settles when re-rendering is scheduled. */
  async updateSettings(next: PublicSettings): Promise<void> {
    const prev = this.settings
    this.settings = next
    this.applyStyleVars()
    if (!this.active || !prev) return
    if (prev.targetLang !== next.targetLang || prev.providerSignature !== next.providerSignature) {
      this.stop()
      await this.start()
      return
    }
    if (prev.mode !== next.mode || prev.style.preset !== next.style.preset) this.rerender()
  }

  /** Decide on auto-translation for a freshly displayed message. */
  async maybeAutoStart(): Promise<boolean> {
    const s = this.settings
    const root = this.deps.root()
    if (!s?.autoTranslate || this.active || !root) return false
    const sample = extractText(root).slice(0, 4000)
    if (!hasTranslatableText(sample)) return false
    if (await isInTargetLanguage(sample, s.targetLang, this.deps.detect)) return false
    await this.start()
    return true
  }

  async toggle(): Promise<void> {
    if (this.active) this.stop()
    else await this.start()
  }

  async start(): Promise<void> {
    const s = this.settings
    const root = this.deps.root()
    if (this.active || !s || !root) return
    this.active = true
    const session = ++this.session
    this.renderer = new Renderer(root.ownerDocument)
    this.renderer.stylePreset = s.style.preset
    this.applyStyleVars()
    this.collected = collectParagraphs(root)

    const all = this.collected.units
    const candidates: Unit[] = []
    for (const unit of all) {
      const inTarget = await isInTargetLanguage(unit.text, s.targetLang, this.deps.detect)
      // Stopped or restarted while the language was detected.
      if (session !== this.session) return
      if (!inTarget) candidates.push(unit)
    }
    this.units = candidates
    if (s.precise && candidates.length > 0) {
      this.context = createMailContext(
        all.map((u) => u.text),
        candidates.map((u) => all.indexOf(u)),
      )
      this.deps.setContext?.(this.context)
    }
    this.report()
    await Promise.all(candidates.map((unit) => this.translateUnit(unit, session)))
  }

  stop(): void {
    this.session++
    this.active = false
    this.renderer?.clearAll()
    this.collected?.restore()
    this.collected = null
    this.renderer = null
    this.units = []
    this.context = null
    this.results.clear()
    this.lastError = ""
    this.root()?.ownerDocument.getElementById(STYLE_ID)?.remove()
    this.report()
  }

  private root(): HTMLElement | null {
    return this.deps.root()
  }

  private memoKey(text: string): string {
    const s = this.settings!
    return `${s.providerSignature}|${s.targetLang}|${text}`
  }

  private request(unit: Unit): TranslateRequest {
    const s = this.settings!
    const index = this.collected?.units.indexOf(unit) ?? -1
    return {
      text: unit.text,
      targetLang: s.targetLang,
      providerId: s.activeProviderId,
      ...(this.context && index >= 0 ? { context: { id: this.context.id, index } } : {}),
    }
  }

  private async translateUnit(unit: Unit, session: number): Promise<void> {
    const known = this.memo.get(this.memoKey(unit.text))
    if (known !== undefined) {
      this.finish(unit, { ok: true, text: known }, session)
      return
    }
    this.results.set(unit, { status: "loading" })
    this.renderer?.showLoading(unit, t("statusTranslating"))
    let res: TranslateResponse
    try {
      res = await this.deps.translate(this.request(unit), (text) => this.provisional(unit, text, session))
    } catch (error) {
      res = { ok: false, error: describeError(error, getI18n()) }
    }
    // Never show an empty reason, whatever the background sent.
    if (!res || (!res.ok && !res.error?.trim())) res = { ...res, ok: false, error: describeError(undefined, getI18n()) }
    if (res.ok) this.memo.set(this.memoKey(unit.text), res.text)
    this.finish(unit, res, session)
  }

  /** Race mode: the fast service answered first. Ignored once the final result is in. */
  private provisional(unit: Unit, text: string, session: number): void {
    if (session !== this.session || this.results.get(unit)?.status !== "loading") return
    this.results.set(unit, { status: "provisional", text })
    this.renderResult(unit)
    this.report()
  }

  private finish(unit: Unit, res: TranslateResponse, session: number): void {
    if (session !== this.session || !this.renderer) return
    if (res.ok) {
      this.results.set(unit, { status: "done", text: res.text })
    } else {
      this.results.set(unit, { status: "error", error: res.error, ...(res.fallback ? { fallback: res.fallback } : {}) })
      this.lastError = res.error
    }
    this.renderResult(unit)
    this.report()
  }

  private renderResult(unit: Unit): void {
    const r = this.results.get(unit)
    if (!this.renderer || !this.settings || !r || r.status === "loading") return
    const retry = () => void this.translateUnit(unit, this.session)
    let text: string
    let mark: TranslationMark | undefined
    if (r.status === "error") {
      if (!r.fallback?.trim()) {
        this.renderer.showError(unit, r.error, t("statusFailed"), retry)
        return
      }
      text = r.fallback
      mark = { kind: "fallback", label: t("statusAiFailed"), title: r.error, onRetry: retry }
    } else {
      text = r.text
      if (r.status === "provisional") mark = { kind: "provisional", label: t("statusProvisional"), title: t("statusProvisionalHint") }
    }
    // Identical output adds nothing in bilingual mode.
    if (text.trim() === unit.text.trim() || !text.trim()) {
      if (r.status === "done") this.renderer.clear(unit)
      else if (r.status === "error") this.renderer.showError(unit, r.error, t("statusFailed"), retry)
      return
    }
    this.renderer.showTranslation(unit, text, this.settings.mode, this.settings.targetLang, mark)
  }

  private rerender(): void {
    if (!this.renderer || !this.settings) return
    this.renderer.stylePreset = this.settings.style.preset
    for (const unit of this.units) this.renderResult(unit)
  }

  private applyStyleVars(): void {
    const root = this.root()
    const s = this.settings
    if (!root || !s || !this.active) return
    const doc = root.ownerDocument
    let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = doc.createElement("style")
      style.id = STYLE_ID
      ;(doc.head ?? doc.documentElement).appendChild(style)
    }
    style.textContent = `:root{--tt-color:${s.style.color};--tt-opacity:${s.style.opacity};--tt-scale:${s.style.fontScale};}`
  }
}
