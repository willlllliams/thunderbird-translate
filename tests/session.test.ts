// @vitest-environment jsdom
/** SettingsSession: saving the edits of a page, failed saves, and changes made elsewhere while the page edits or saves. */
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDefaultSettings, type Settings, SETTINGS_KEY } from "../src/shared/settings"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.useRealTimers()
})

/** A session over a fake storage.local. `refuse` makes writes fail; `hold` keeps writes from reporting back until the returned function is called. */
async function open(settings: Settings = createDefaultSettings("en")) {
  let stored = structuredClone(settings)
  const listeners: ((changes: object, area: string) => void)[] = []
  const notify = () => listeners.forEach((l) => l({ [SETTINGS_KEY]: { newValue: structuredClone(stored) } }, "local"))
  let refuse = false
  let gate: Promise<void> | null = null
  const set = vi.fn(async (v: Record<string, unknown>) => {
    if (refuse) throw new Error("quota exceeded")
    stored = structuredClone(v[SETTINGS_KEY] as Settings)
    notify()
    // The change event goes out before the write reports back.
    if (gate) await gate
  })
  vi.stubGlobal("browser", {
    storage: { local: { get: async () => ({ [SETTINGS_KEY]: structuredClone(stored) }), set }, onChanged: { addListener: (l: (typeof listeners)[number]) => listeners.push(l) } },
    i18n: { getUILanguage: () => "en" },
  })
  vi.resetModules()
  const { SettingsSession } = await import("../src/options/session")
  const session = await SettingsSession.open()
  return {
    session,
    set,
    stored: () => stored,
    refuse: (value: boolean) => (refuse = value),
    hold() {
      let release!: () => void
      gate = new Promise<void>((r) => (release = r))
      return () => {
        gate = null
        release()
      }
    },
    /** Another page writes the settings. */
    external(change: (s: Settings) => void) {
      change(stored)
      notify()
    },
  }
}

describe("SettingsSession", () => {
  it("M3: keeps the edits pending after a failed save and writes them with the next flush", async () => {
    const page = await open()
    const errors: unknown[] = []
    page.session.onSaveError = (error) => errors.push(error)
    page.refuse(true)
    page.session.settings.mode = "translation-only"
    page.session.save()
    const failed = await page.session.flush()
    expect(errors).toHaveLength(1)
    expect(page.stored().mode).toBe("bilingual")
    page.refuse(false)
    const saved = await page.session.flush()
    expect(page.stored().mode).toBe("translation-only")
    expect([failed, saved]).toEqual([false, true])
  })

  it("M3: reports success when nothing is pending, without writing", async () => {
    const page = await open()
    expect(await page.session.flush()).toBe(true)
    expect(page.set).not.toHaveBeenCalled()
  })

  it("saves the edits of 300 ms with one write", async () => {
    vi.useFakeTimers()
    const page = await open()
    page.session.settings.mode = "translation-only"
    page.session.save()
    page.session.settings.autoTranslate = true
    page.session.save()
    await vi.advanceTimersByTimeAsync(300)
    expect(page.set).toHaveBeenCalledTimes(1)
    expect(page.stored()).toMatchObject({ mode: "translation-only", autoTranslate: true })
  })

  it("L2: keeps an edit made during a save that restores the value the page started from", async () => {
    const page = await open()
    const { session } = page
    session.settings.mode = "translation-only"
    session.save()
    const release = page.hold()
    const first = session.flush()
    await vi.waitFor(() => expect(page.set).toHaveBeenCalled())
    // While the write runs, the user switches back.
    session.settings.mode = "bilingual"
    session.save()
    release()
    await first
    expect(session.settings.mode).toBe("bilingual")
    expect(await session.flush()).toBe(true)
    expect(page.stored().mode).toBe("bilingual")
  })

  it("L2: takes over changes made elsewhere during a save, next to the page's own edit", async () => {
    const page = await open()
    const { session } = page
    session.settings.mode = "translation-only"
    session.save()
    const release = page.hold()
    const saving = session.flush()
    await vi.waitFor(() => expect(page.set).toHaveBeenCalled())
    // Another page writes after this page did, while this page still waits for its write to report back.
    page.external((s) => (s.autoTranslate = true))
    release()
    await saving
    expect(session.settings).toMatchObject({ mode: "translation-only", autoTranslate: true })
    expect(page.stored()).toMatchObject({ mode: "translation-only", autoTranslate: true })
  })

  it("L2: redraws a control once it loses the focus when its setting changed elsewhere meanwhile", async () => {
    const page = await open()
    document.body.innerHTML = '<input id="targetLang"><button id="other"></button>'
    const input = page.session.bind("targetLang", "change", (el) => (el.value = page.session.settings.targetLang), (el) => (page.session.settings.targetLang = el.value))
    expect(input.value).toBe("en")
    input.focus()
    page.external((s) => (s.targetLang = "ja"))
    expect(page.session.settings.targetLang).toBe("ja")
    expect(input.value).toBe("en")
    input.blur()
    expect(input.value).toBe("ja")
    // Without a change made elsewhere, leaving the control redraws nothing.
    input.focus()
    input.value = "typing"
    input.blur()
    expect(input.value).toBe("typing")
  })
})
