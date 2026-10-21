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
 * retranslate(): forget those results and translate the message again from
 * the start in the same display mode, with every request marked to pass the
 * background's cache (and, in precise mode, its analysis of the message).
 * A paragraph that an offline tier could not translate for lack of a
 * dictionary pack or offline model is reported to the notice (notice.ts).
 * Before the text of the message first goes to an online service the user
 * has not allowed yet, start() asks through the consent panel (consent.ts)
 * and translates nothing until the user allows it; this holds for automatic
 * translation and retranslation as well.
 * With the subject switch on, start() also asks for the subject of the
 * message (the content script cannot see the header) and, unless it is
 * already in the target language, puts it in a line above the body. That
 * line is one more unit, translated like a paragraph through the same tiers,
 * cache and consent rules, and removed by stop().
 * A final translation of the AI tier shows its Markdown rendered while the
 * Markdown switch is on (shared/markdown.ts); the subject line and the units
 * of `plainText` show it as text without the marks. Every other result, the
 * provisional ones included, is shown as text. The results keep the text as
 * the service returned it, so a change of the switch only renders again.
 * The images of the message (images.ts) start with the translation and stop
 * with it; a change of their settings, a new display mode or Markdown switch
 * never asks for them again, a retranslation does.
 */

import { describeError, type MissingData } from "../shared/errors"
import { getI18n, t } from "../shared/i18n"
import { isInTargetLanguage, type LanguageDetector } from "../shared/lang-detect"
import { createMailContext, type MailContext } from "../shared/mail-context"
import type { TabState, TranslateRequest, TranslateResponse } from "../shared/messages"
import { type Tier, TIER_NAME_KEYS, TIERS } from "../shared/providers"
import type { ConsentNeed, DisplayMode, PublicSettings } from "../shared/settings"
import { type SubjectParts, subjectToTranslate } from "../shared/subject"
import type { ImageTranslator } from "./images"
import { CLS_SUBJECT, type Collected, collectParagraphs, extractText, type Unit } from "./paragraphs"
import { Renderer, styleVars, type TextFormat, type TranslationMark } from "./render"
import { hasTranslatableText } from "../shared/text"

export interface ControllerDeps {
  root: () => HTMLElement | null
  /** Ask the given tiers; each result comes through onTier, the promise settles when the request is complete. */
  translate: (request: TranslateRequest, onTier: (tier: Tier, result: TranslateResponse) => void) => Promise<void>
  /** Precise mode: register the message with the background before its paragraphs are requested; bypassCache for a retranslation. */
  setContext?: (context: MailContext, bypassCache: boolean) => void
  detect?: LanguageDetector
  report?: (state: Omit<TabState, "connected">) => void
  /** Told when a translation starts and when every paragraph has its answers, of each paragraph without a dictionary pack or offline model, and when the translation stops. */
  notice?: { begin(): void; add(missing: MissingData): void; end(): void; clear(again?: boolean): void }
  /**
   * Asks the user before message text first goes to the online services `needs`; resolves true once they are allowed
   * (and recorded by the background script). Without it nothing is asked: the extension pages translate their own sample.
   */
  consent?: { ask(needs: ConsentNeed[], precise: boolean): Promise<boolean>; clear(): void }
  /** The subject of the message on screen, null without one; without it no subject line is shown (the extension pages). */
  subject?: () => Promise<string | null>
  /** The units to translate under the root; the paragraphs of a message by default. The page of translated subjects gives one cell per subject. */
  collect?: (root: HTMLElement) => Collected
  /** A display mode of its own instead of the one of the settings: the page of translated subjects shows the translations in their own column. */
  mode?: DisplayMode
  /** The units show plain text: an AI translation appears without its Markdown marks. The page of translated subjects. */
  plainText?: boolean
  /** The text of the images of the message; the content script only. */
  images?: Pick<ImageTranslator, "start" | "update" | "stop">
}

/** What one tier has for one paragraph. */
type TierState = { status: "pending" } | { status: "ok"; text: string } | { status: "error"; error: string }

/** What a paragraph shows. */
type View =
  | { kind: "loading" }
  | { kind: "done"; text: string; tier: Tier }
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
  /** The position of each collected unit in the message, for the context of precise mode. */
  private positions = new Map<Unit, number>()
  private units: Unit[] = []
  /** The line above the body with the subject, while the message is translated. */
  private subjectLine: HTMLElement | null = null
  /** The unit of the subject line. */
  private subjectUnit: Unit | null = null
  private context: MailContext | null = null
  private results = new Map<Unit, Partial<Record<Tier, TierState>>>()
  private renderer: Renderer | null = null
  /** Results already received, keyed by tier signature + languages + text. */
  private memo = new Map<string, string>()
  /** The running translation is a retranslation: its requests pass the background's cache. */
  private bypassCache = false
  private lastError = ""
  /** Online services allowed in the consent panel of this message, before the settings that record them arrive. */
  private allowed = new Set<string>()
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
    if (prev.targetLang !== next.targetLang || prev.sourceLang !== next.sourceLang || prev.precise !== next.precise || prev.translateSubject !== next.translateSubject) {
      this.stop()
      await this.start()
      return
    }
    const changed = TIERS.filter((tier) => prev.signatures[tier] !== next.signatures[tier])
    // A tier now uses an online service the user has not allowed yet: translate again from the start, which asks first.
    if (changed.length > 0 && this.consentNeeds(next).length > 0) {
      this.stop()
      await this.start()
      return
    }
    this.deps.images?.update(next.image, next.targetLang)
    for (const state of this.results.values()) for (const tier of changed) delete state[tier]
    if (changed.length > 0 || prev.mode !== next.mode || prev.style.preset !== next.style.preset || prev.renderMarkdown !== next.renderMarkdown) this.rerender()
    if (changed.length > 0) {
      this.report()
      await Promise.all(this.units.map((unit) => this.translateUnit(unit, this.session)))
    }
  }

  /**
   * The text of the message as precise translation registers it
   * (MailContext.text), for its summary: of the paragraphs found when the
   * translation started, else of those found now, whose DOM is put back at once.
   */
  messageText(): string {
    const root = this.root()
    if (!root) return ""
    const collected = this.collected ?? (this.deps.collect ?? collectParagraphs)(root)
    const text = createMailContext(collected.units.map((unit) => unit.text), []).text
    if (collected !== this.collected) collected.restore()
    return text
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

  /** Translate the message on screen again, past every cache; nothing happens while it is not translated. */
  async retranslate(): Promise<void> {
    if (!this.active) return
    this.memo.clear()
    this.stop(true)
    await this.start(true)
  }

  async toggle(): Promise<void> {
    if (this.active) this.stop()
    else await this.start()
  }

  /** The online services of `s` that still need the user's consent. */
  private consentNeeds(s: PublicSettings): ConsentNeed[] {
    return this.deps.consent ? s.consent.filter((need) => !this.allowed.has(need.id)) : []
  }

  /** The settings to translate with once the user allowed the online services `needs`; null when the user declined or the state changed meanwhile. */
  private async consented(s: PublicSettings, needs: ConsentNeed[]): Promise<PublicSettings | null> {
    if (!(await this.deps.consent!.ask(needs, s.precise))) return null
    for (const need of needs) this.allowed.add(need.id)
    // The settings may have changed while the panel was open.
    const now = this.settings!
    return this.active || this.consentNeeds(now).length > 0 ? null : now
  }

  async start(bypassCache = false): Promise<void> {
    if (this.active || !this.settings || !this.deps.root()) return
    const needs = this.consentNeeds(this.settings)
    // Without a question the translation starts at once.
    const s = needs.length === 0 ? this.settings : await this.consented(this.settings, needs)
    if (!s) return
    const root = this.deps.root()
    if (!root) return
    this.active = true
    this.bypassCache = bypassCache
    const session = ++this.session
    this.renderer = new Renderer(root.ownerDocument)
    this.renderer.stylePreset = s.style.preset
    this.applyStyleVars()
    this.collected = (this.deps.collect ?? collectParagraphs)(root)

    const all = this.collected.units
    this.positions = new Map(all.map((unit, i) => [unit, i]))
    // The subject comes from the background script and is translated beside the paragraphs, which do not wait for it.
    const subject = this.subjectToTranslate(s)
    const inTarget = await Promise.all(all.map((unit) => isInTargetLanguage(unit.text, s.targetLang, this.deps.detect, s.sourceLang)))
    // Stopped or restarted while the language was detected.
    if (session !== this.session) return
    const targets = all.flatMap((_, i) => (inTarget[i] ? [] : [i]))
    const candidates = targets.map((i) => all[i])
    this.units = candidates
    this.deps.notice?.begin()
    if (s.precise && candidates.length > 0) {
      this.context = createMailContext(all.map((u) => u.text), targets)
      this.deps.setContext?.(this.context, bypassCache)
    }
    this.deps.images?.start({ settings: s.image, targetLang: s.targetLang, units: all, ...(this.context ? { context: this.context.id } : {}), ...(bypassCache ? { fresh: true } : {}) })
    this.report()
    const subjectDone = subject.then((parts) => {
      if (!parts || session !== this.session) return
      const unit = this.showSubject(root, parts.prefix, parts.text)
      this.units = [unit, ...this.units]
      return this.translateUnit(unit, session)
    })
    await Promise.all(candidates.map((unit) => this.translateUnit(unit, session)))
    if (session === this.session) this.deps.notice?.end()
    await subjectDone
  }

  /** The subject to put above the body: its prefixes and the text to translate; null when it is off, missing or already in the target language. */
  private async subjectToTranslate(s: PublicSettings): Promise<SubjectParts | null> {
    if (!s.translateSubject || !this.deps.subject) return null
    const subject = await this.deps.subject().catch(() => null)
    return subject ? subjectToTranslate(subject, s, this.deps.detect) : null
  }

  /** The line with the subject at the top of the body; its text is the unit, the prefixes stay outside it. */
  private showSubject(root: HTMLElement, prefix: string, text: string): Unit {
    const doc = root.ownerDocument
    const line = doc.createElement("div")
    line.className = CLS_SUBJECT
    line.setAttribute("dir", "auto")
    const el = doc.createElement("span")
    el.className = `${CLS_SUBJECT}-text`
    el.textContent = text
    if (prefix) line.append(Object.assign(doc.createElement("span"), { className: `${CLS_SUBJECT}-prefix`, textContent: prefix }))
    line.append(el)
    root.prepend(line)
    this.subjectLine = line
    this.subjectUnit = { el, text, pre: false }
    return this.subjectUnit
  }

  /** `again`: a retranslation follows. */
  stop(again = false): void {
    this.deps.consent?.clear()
    this.deps.images?.stop()
    this.session++
    this.active = false
    this.renderer?.clearAll()
    this.subjectLine?.remove()
    this.subjectLine = null
    this.subjectUnit = null
    this.collected?.restore()
    this.collected = null
    this.positions.clear()
    this.renderer = null
    this.units = []
    this.context = null
    this.results.clear()
    this.lastError = ""
    this.deps.notice?.clear(again)
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
    const index = this.positions.get(unit) ?? -1
    return {
      text: unit.text,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      tiers,
      ...(this.context && index >= 0 ? { context: { id: this.context.id, index } } : {}),
      ...(this.bypassCache ? { bypassCache: true } : {}),
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
        if (res.missing) this.deps.notice?.add(res.missing)
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
    // No tier answered at all (the background could not read its settings, or newer ones left the tier out): the paragraph fails and can be retried.
    const top = wanted.at(-1)!
    if (current(top) && !s.tiers.some((tier) => state[tier])) {
      state[top] = { status: "error", error: describeError(undefined, getI18n()) }
      if (top === s.tiers.at(-1)) this.lastError = state[top].error
    }
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
      if (best === tiers.at(-1)) return { kind: "done", text, tier: best }
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
        mark = { kind: "fallback", label: t("statusTierFailed", [topName]), title: view.error, onRetry: retry, retryHint: t("tipRetryTier") }
        break
    }
    // Identical output adds nothing in bilingual mode.
    if (view.text.trim() === unit.text.trim() || !view.text.trim()) {
      if (view.kind === "fallback") this.renderer.showError(unit, view.error, t("statusFailed"), retry)
      else if (view.kind === "provisional") this.renderer.showLoading(unit, t("statusTranslating"))
      else this.renderer.clear(unit)
      return
    }
    this.renderer.showTranslation(unit, view.text, this.deps.mode ?? s.mode, s.targetLang, mark, this.format(unit, view))
  }

  /** Markdown only for a final AI translation with the switch on; the subject line and plain-text units without the marks. */
  private format(unit: Unit, view: View): TextFormat {
    if (view.kind !== "done" || view.tier !== "ai" || !this.settings?.renderMarkdown) return "text"
    return this.deps.plainText || unit === this.subjectUnit ? "strip" : "markdown"
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
    style.textContent = `:root{${Object.entries(styleVars(s.style)).map(([name, value]) => `${name}:${value};`).join("")}}`
  }
}
