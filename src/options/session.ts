/**
 * Settings as edited on an extension page (settings page, welcome page).
 * Edits are saved 300 ms after the last change, on top of what is in
 * storage, so changes made elsewhere in the meantime survive; changes made
 * elsewhere are taken over, except for the control being edited. A failed
 * save is reported through onSaveError and does not stop later saves.
 */

import { ext } from "../shared/ext"
import { $ } from "../shared/page"
import { SETTINGS_KEY, type Settings } from "../shared/settings"
import { loadSettings, mergeChanges, readSettings, saveChanges } from "../shared/settings-store"

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
  private timer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<void> = Promise.resolve()
  /** Redraw the control of one setting; run again when the settings change elsewhere. */
  private readonly controls: (() => void)[] = []

  private constructor(public readonly settings: Settings) {
    this.baseline = structuredClone(settings)
  }

  /** Load the settings and follow the changes made by the popup, other pages and the background script. */
  static async open(): Promise<SettingsSession> {
    const session = new SettingsSession(await loadSettings())
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[SETTINGS_KEY]) session.absorb(readSettings(changes[SETTINGS_KEY].newValue))
    })
    return session
  }

  private absorb(remote: Settings): void {
    const before = structuredClone(this.settings)
    mergeChanges(this.settings, this.baseline, remote, true)
    this.baseline = structuredClone(remote)
    for (const show of this.controls) show()
    this.onRemoteChange(before)
  }

  /** Save soon; changes within 300 ms go into one write. */
  save(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), 300)
  }

  /** Save now what is pending. Never rejects. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.saving = this.saving.then(async () => {
        try {
          this.absorb(await saveChanges(this.baseline, this.settings))
          this.onSaved()
        } catch (error) {
          this.onSaveError(error)
        }
      })
    }
    return this.saving
  }

  /** A control that shows a setting. The one being edited is left alone when the settings change elsewhere. */
  track(input: HTMLElement, show: () => void): void {
    const update = () => {
      if (document.activeElement !== input) show()
    }
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
