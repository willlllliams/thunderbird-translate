/**
 * Translation state of one displayed message.
 *
 * start(): find paragraphs, drop those already in the target language, ask
 * the background for each translation (the background merges them into
 * batches) and render results as they arrive. Every paragraph is requested
 * from all enabled tiers at once (dictionary, machine translation, AI); each
 * tier answers on its own. The highest tier that has answered is shown: a
 * lower tier as a provisional translation, the highest enabled tier as the
 * final one. When the highest tier fails, the best lower result stays with
 * the reason; only when every tier fails is the paragraph marked as failed.
 * In precise mode the message text is registered with the background as
 * context first.
 * stop(): remove every inserted node and restore the original DOM.
 * Settings changes while active: a new language or precise switch starts
 * again (the background cache answers what it already knows); a tier whose
 * service or prompt changed, for example the AI tier after a new display
 * mode, is requested again while the other tiers keep their results.
 * Results are kept for the message on screen, so showing it again asks
 * nothing; they are forgotten when dictionary packs or offline models change.
 */

import { describeError } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { isInTargetLanguage, type LanguageDetector } from "../shared/lang-detect"
import { createMailContext, type MailContext } from "../shared/mail-context"
import type { TabState, TranslateRequest, TranslateResponse } from "../shared/messages"
import { type Tier, TIER_NAME_KEYS, TIERS } from "../shared/providers"
import type { PublicSettings } from "../shared/settings"
import { type Collected, collectParagraphs, extractText, type Unit } from "./paragraphs"
import { Renderer, type TranslationMark } from "./render"
import { hasTranslatableText } from "./text"

export interface ControllerDeps {
  root: () => HTMLElement | null
  /** Ask the given tiers; each result comes through onTier, the promise settles when the request is complete. */
  translate: (request: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void) => Promise<void>
  /** Precise mode: register the message with the background before its paragraphs are requested. */
  setContext?: (context: MailContext) => void
  detect?: LanguageDetector
  report?: (state: Omit<TabState, "connected">) => void
}

/** What one tier has for one paragraph. */
type TierState = { status: "pending" } | { status: "ok"; text: string } | { status: "error"; error: string }

/** What a paragraph shows. */
type View =
  | { kind: "loading" }
  | { kind: "done"; text: string }
  /** A lower tier while the highest one runs. */
  | { kind: "provisional"; text: string; tier: Tier }
  /** A lower tier after the highest one failed. */
  | { kind: "fallback"; text: string; error: string }
  | { kind: "error"; error: string }

const STYLE_ID = "tt-style-vars"
/** Progress goes to the background at most this often; the last state always follows. */
const REPORT_INTERVAL_MS = 100

export class TranslationController {
  active = false
  private settings: PublicSettings | null = null
  private session = 0
  private collected: Collected | null = null
  private units: Unit[] = []
  private context: MailContext | null = null
  private results = new Map<Unit, Partial<Record<Tier, TierState>>>()
  private renderer: Renderer | null = null
  /** Results already received, keyed by tier signature + languages + text. */
  private memo = new Map<string, string>()
  private lastError = ""
  private reportTimer: ReturnType<typeof setTimeout> | null = null
  private reportPending = false

  constructor(private readonly deps: ControllerDeps) {}

  /** Send the state now, or once the interval since the last report has passed. */
  private report(): void {
    if (this.reportTimer) {
      this.reportPending = true
      return
    }
    this.sendReport()
    this.reportTimer = setTimeout(() => {
      this.reportTimer = null
      if (this.reportPending) {
        this.reportPending = false
        this.report()
      }
    }, REPORT_INTERVAL_MS)
  }

  private sendReport(): void {
    const count = { done: 0, provisional: 0, failed: 0 }
    for (const unit of this.results.keys()) {
      const view = this.view(unit)
      if (view.kind === "done") count.done++
      else if (view.kind === "provisional") count.provisional++
      else if (view.kind !== "loading") count.failed++
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
    if (prev.targetLang !== next.targetLang || prev.sourceLang !== next.sourceLang || prev.precise !== next.precise) {
      this.stop()
      await this.start()
      return
    }
    const changed = TIERS.filter((tier) => prev.signatures[tier] !== next.signatures[tier])
    for (const state of this.results.values()) for (const tier of changed) delete state[tier]
    if (changed.length > 0 || prev.mode !== next.mode || prev.style.preset !== next.style.preset) this.rerender()
    if (changed.length > 0) {
      this.report()
      await Promise.all(this.units.map((unit) => this.translateUnit(unit, this.session)))
    }
  }

  /** Dictionary packs or offline models changed: the results kept from before are not shown again. */
  forgetResults(): void {
    this.memo.clear()
  }

  /** Decide on auto-translation for a freshly displayed message. */
  async maybeAutoStart(): Promise<boolean> {
    const s = this.settings
    const root = this.deps.root()
    if (!s?.autoTranslate || this.active || !root) return false
    const sample = extractText(root).slice(0, 4000)
    if (!hasTranslatableText(sample)) return false
    if (await isInTargetLanguage(sample, s.targetLang, this.deps.detect, s.sourceLang)) return false
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
    const inTarget = await Promise.all(all.map((unit) => isInTargetLanguage(unit.text, s.targetLang, this.deps.detect, s.sourceLang)))
    // Stopped or restarted while the language was detected.
    if (session !== this.session) return
    const candidates = all.filter((_, i) => !inTarget[i])
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

  private memoKey(tier: Tier, text: string): string {
    const s = this.settings!
    return `${s.signatures[tier]}|${s.sourceLang}>${s.targetLang}|${text}`
  }

  private request(unit: Unit, tiers: Tier[]): TranslateRequest {
    const s = this.settings!
    const index = this.collected?.units.indexOf(unit) ?? -1
    return {
      text: unit.text,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      tiers,
      ...(this.context && index >= 0 ? { context: { id: this.context.id, index } } : {}),
    }
  }

  /** Request the enabled tiers that have no result yet; none when the highest tier has its translation. */
  private async translateUnit(unit: Unit, session: number): Promise<void> {
    const s = this.settings!
    let state = this.results.get(unit)
    if (!state) this.results.set(unit, (state = {}))
    const missing = s.tiers.filter((tier) => !state[tier])
    for (const tier of missing) {
      const known = this.memo.get(this.memoKey(tier, unit.text))
      if (known !== undefined) state[tier] = { status: "ok", text: known }
    }
    const wanted = state[s.tiers.at(-1)!]?.status === "ok" ? [] : missing.filter((tier) => !state[tier])
    for (const tier of wanted) state[tier] = { status: "pending" }
    this.renderResult(unit)
    this.report()
    if (wanted.length === 0) return

    const signatures = Object.fromEntries(wanted.map((tier) => [tier, s.signatures[tier]]))
    /** Whether a result for `tier` still belongs to what is on screen. */
    const current = (tier: Tier) => session === this.session && this.settings?.signatures[tier] === signatures[tier] && this.results.get(unit) === state
    const receive = (tier: Tier, res: TranslateResponse) => {
      if (!current(tier)) return
      // Never show an empty reason, whatever the background sent.
      if (!res || (!res.ok && !res.error?.trim())) res = { ok: false, error: describeError(undefined, getI18n()) }
      if (res.ok) {
        state[tier] = { status: "ok", text: res.text }
        this.memo.set(this.memoKey(tier, unit.text), res.text)
      } else {
        state[tier] = { status: "error", error: res.error }
        if (tier === this.settings!.tiers.at(-1)) this.lastError = res.error
      }
      this.renderResult(unit)
      this.report()
    }
    try {
      await this.deps.translate(this.request(unit, wanted), receive)
    } catch (error) {
      for (const tier of wanted) if (state[tier]?.status === "pending") receive(tier, { ok: false, error: describeError(error, getI18n()) })
    }
    // Tiers without an answer were not asked, because the highest tier came from the cache.
    for (const tier of wanted) if (current(tier) && state[tier]?.status === "pending") delete state[tier]
    if (session === this.session) {
      this.renderResult(unit)
      this.report()
    }
  }

  /** The highest tier with a translation wins; the highest enabled tier makes it final. */
  private view(unit: Unit): View {
    const tiers = this.settings?.tiers ?? []
    const state = this.results.get(unit) ?? {}
    const top = state[tiers.at(-1)!]
    const best = [...tiers].reverse().find((tier) => state[tier]?.status === "ok")
    if (best) {
      const text = (state[best] as { text: string }).text
      if (best === tiers.at(-1)) return { kind: "done", text }
      return top?.status === "error" ? { kind: "fallback", text, error: top.error } : { kind: "provisional", text, tier: best }
    }
    if (tiers.some((tier) => state[tier]?.status === "pending")) return { kind: "loading" }
    const failed = [...tiers].reverse().find((tier) => state[tier]?.status === "error")
    return failed ? { kind: "error", error: (state[failed] as { error: string }).error } : { kind: "loading" }
  }

  /** Retry the tiers that failed; the others keep their results. */
  private retry(unit: Unit): void {
    const state = this.results.get(unit)
    if (!state) return
    for (const tier of TIERS) if (state[tier]?.status === "error") delete state[tier]
    void this.translateUnit(unit, this.session)
  }

  private renderResult(unit: Unit): void {
    const s = this.settings
    if (!this.renderer || !s) return
    const view = this.view(unit)
    const retry = () => this.retry(unit)
    const topName = t(TIER_NAME_KEYS[s.tiers.at(-1)!])
    let mark: TranslationMark | undefined
    switch (view.kind) {
      case "loading":
        this.renderer.showLoading(unit, t("statusTranslating"))
        return
      case "error":
        this.renderer.showError(unit, view.error, t("statusFailed"), retry)
        return
      case "provisional":
        mark = { kind: "provisional", label: t(TIER_NAME_KEYS[view.tier]), title: t("statusProvisionalHint", [topName]) }
        break
      case "fallback":
        mark = { kind: "fallback", label: t("statusTierFailed", [topName]), title: view.error, onRetry: retry }
        break
    }
    // Identical output adds nothing in bilingual mode.
    if (view.text.trim() === unit.text.trim() || !view.text.trim()) {
      if (view.kind === "fallback") this.renderer.showError(unit, view.error, t("statusFailed"), retry)
      else if (view.kind === "provisional") this.renderer.showLoading(unit, t("statusTranslating"))
      else this.renderer.clear(unit)
      return
    }
    this.renderer.showTranslation(unit, view.text, s.mode, s.targetLang, mark)
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
