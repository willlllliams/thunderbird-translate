/**
 * Settings as edited on an extension page (settings page, welcome page).
 * Edits are saved SAVE_DELAY_MS after the last change, on top of what is in
 * storage, so changes made elsewhere in the meantime survive; changes made
 * elsewhere are taken over, except for the settings the page has changed
 * and not stored yet. A control being edited shows such a change once it
 * loses the focus. A failed save is reported through onSaveError; its edits
 * stay pending and go with the next save.
 */

import { $ } from "../shared/page"
import type { Settings } from "../shared/settings"
import { loadSettings, mergeChanges, onStoredSettings, readSettings, saveChanges } from "../shared/settings-store"

/** Edits are saved this long after the last change, together. */
export const SAVE_DELAY_MS = 300

/** Any form control of a page: input, select or textarea. */
export type Control = HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement

export class SettingsSession {
  /** Runs after changes made elsewhere were taken over; gets the settings as they were before. */
  onRemoteChange: (before: Settings) => void = () => {}
  /** Runs after each save. */
  onSaved: () => void = () => {}
  /** Runs when a save failed; the edits stay on the page and go with the next save. */
  onSaveError: (error: unknown) => void = () => {}
  /** Settings as this page last read or wrote them: the reference for what the user changed. */
  private baseline: Settings
  /** The page has edits that are not stored yet. */
  private dirty = false
  /** A save is writing; settings stored elsewhere meanwhile wait in `remote`. */
  private writing = false
  private remote: Settings | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<boolean> = Promise.resolve(true)
  /** Redraw the control of one setting; run again when the settings change elsewhere. */
  private readonly controls: (() => void)[] = []

  private constructor(public readonly settings: Settings) {
    this.baseline = structuredClone(settings)
  }

  /** Load the settings and follow the changes made by the popup, other pages and the background script. */
  static async open(): Promise<SettingsSession> {
    const session = new SettingsSession(await loadSettings())
    onStoredSettings((stored) => {
      const remote = readSettings(stored)
      if (session.writing) session.remote = remote
      else session.absorb(remote)
    })
    return session
  }

  /**
   * Take over the stored settings `remote`, keeping the page's own changes:
   * what differs from the settings as last stored and, after a save, from
   * `sent`, the settings that save wrote (an edit made during the save may
   * restore a stored value).
   */
  private absorb(remote: Settings, sent?: Settings): void {
    const before = structuredClone(this.settings)
    mergeChanges(this.settings, this.baseline, remote, sent ? [this.baseline, sent] : [this.baseline])
    this.baseline = structuredClone(remote)
    for (const show of this.controls) show()
    this.onRemoteChange(before)
  }

  /** Save soon; changes within SAVE_DELAY_MS go into one write. */
  save(): void {
    this.dirty = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS)
  }

  /** Save now what is pending. Resolves with false when the save failed; never rejects. */
  flush(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.saving = this.saving.then(async () => {
      if (!this.dirty) return true
      this.dirty = false
      this.writing = true
      const sent = structuredClone(this.settings)
      let saved = false
      try {
        this.absorb(await saveChanges(this.baseline, sent), sent)
        this.onSaved()
        saved = true
      } catch (error) {
        this.dirty = true
        this.onSaveError(error)
      }
      this.writing = false
      const remote = this.remote
      this.remote = null
      if (remote) this.absorb(remote)
      return saved
    })
    return this.saving
  }

  /** A control that shows a setting. The one being edited shows a change made elsewhere once it loses the focus. */
  track(input: HTMLElement, show: () => void): void {
    let stale = false
    const update = () => {
      stale = document.activeElement === input
      if (!stale) show()
    }
    // During blur the control may still count as focused, so it is drawn here directly.
    input.addEventListener("blur", () => {
      if (!stale) return
      stale = false
      show()
    })
    this.controls.push(update)
    update()
  }

  /** A control of the page bound to one setting: `show` draws the setting, `apply` takes the control's value, then the settings are saved. */
  bind(id: string, event: "input" | "change", show: (el: Control) => void, apply: (el: Control) => void): Control {
    const el = $<Control>(id)
    this.track(el, () => show(el))
    el.addEventListener(event, () => {
      apply(el)
      this.save()
    })
    return el
  }

  bindCheck(id: string, get: () => boolean, set: (v: boolean) => void): void {
    this.bind(id, "change", (el) => (el.checked = get()), (el) => set(el.checked))
  }

  /** Number field, clamped to its min and max. An empty field (also what a number field reports for invalid input) keeps the value. */
  bindNumber(id: string, get: () => number, set: (v: number) => void): void {
    const show = (el: Control) => (el.value = String(get()))
    this.bind(id, "change", show, (el) => {
      const v = el.value.trim() === "" ? Number.NaN : Number(el.value)
      if (Number.isFinite(v)) set(Math.min(Number(el.max), Math.max(Number(el.min), v)))
      show(el)
    })
  }
}
