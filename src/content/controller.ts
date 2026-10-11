/**
 * Translation state of one displayed message.
 *
 * start(): find paragraphs, drop those already in the target language, ask
 * the background for each translation (the background merges them into
 * batches) and render results as they arrive.
 * stop(): remove every inserted node and restore the original DOM.
 * Settings changes while active: a new display mode re-renders from the
 * translations already held; a new target language or provider stops and
 * starts again (the background cache answers what it already knows).
 */

import type { TranslateResponse } from "../shared/messages"
import type { PublicSettings } from "../shared/settings"
import { isInTargetLanguage, type LanguageDetector } from "./lang-detect"
import { type Collected, collectParagraphs, extractText, type Unit } from "./paragraphs"
import { Renderer } from "./render"
import { hasTranslatableText } from "./text"

export interface ControllerDeps {
  root: () => HTMLElement | null
  translate: (text: string, targetLang: string, providerId: string) => Promise<TranslateResponse>
  detect?: LanguageDetector
  report?: (state: { active: boolean; total: number; done: number; failed: number }) => void
  label?: (key: "loading" | "error") => string
}

type UnitResult = { status: "loading" } | { status: "done"; text: string } | { status: "error"; error: string }

const STYLE_ID = "tt-style-vars"

export class TranslationController {
  active = false
  private settings: PublicSettings | null = null
  private session = 0
  private collected: Collected | null = null
  private units: Unit[] = []
  private results = new Map<Unit, UnitResult>()
  private renderer: Renderer | null = null
  /** Translations already received, keyed by provider + language + text. */
  private memo = new Map<string, string>()

  constructor(private readonly deps: ControllerDeps) {}

  get unitCount(): number {
    return this.units.length
  }

  private label(key: "loading" | "error"): string {
    return this.deps.label?.(key) ?? (key === "loading" ? "Translating…" : "Translation failed, click to retry")
  }

  private report(): void {
    let done = 0
    let failed = 0
    for (const r of this.results.values()) {
      if (r.status === "done") done++
      else if (r.status === "error") failed++
    }
    this.deps.report?.({ active: this.active, total: this.units.length, done, failed })
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

    const candidates: Unit[] = []
    for (const unit of this.collected.units) {
      if (await isInTargetLanguage(unit.text, s.targetLang, this.deps.detect)) continue
      if (session !== this.session) return
      candidates.push(unit)
    }
    this.units = candidates
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
    this.results.clear()
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

  private async translateUnit(unit: Unit, session: number): Promise<void> {
    const s = this.settings!
    const known = this.memo.get(this.memoKey(unit.text))
    if (known !== undefined) {
      this.finish(unit, { ok: true, text: known }, session)
      return
    }
    this.results.set(unit, { status: "loading" })
    this.renderer?.showLoading(unit, this.label("loading"))
    let res: TranslateResponse
    try {
      res = await this.deps.translate(unit.text, s.targetLang, s.activeProviderId)
    } catch (error) {
      res = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    if (res.ok) this.memo.set(this.memoKey(unit.text), res.text)
    this.finish(unit, res, session)
  }

  private finish(unit: Unit, res: TranslateResponse, session: number): void {
    if (session !== this.session || !this.renderer) return
    if (res.ok) {
      this.results.set(unit, { status: "done", text: res.text })
      this.renderResult(unit)
    } else {
      this.results.set(unit, { status: "error", error: res.error })
      this.renderer.showError(unit, res.error, this.label("error"), () => {
        void this.translateUnit(unit, this.session)
      })
    }
    this.report()
  }

  private renderResult(unit: Unit): void {
    const r = this.results.get(unit)
    if (!this.renderer || !this.settings || r?.status !== "done") return
    // Identical output adds nothing in bilingual mode.
    if (r.text.trim() === unit.text.trim() || !r.text.trim()) {
      this.renderer.clear(unit)
      return
    }
    this.renderer.showTranslation(unit, r.text, this.settings.mode, this.settings.targetLang)
  }

  private rerender(): void {
    if (!this.renderer || !this.settings) return
    this.renderer.stylePreset = this.settings.style.preset
    for (const unit of this.units) {
      if (this.results.get(unit)?.status === "done") this.renderResult(unit)
    }
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
