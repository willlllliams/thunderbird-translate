/** The keyboard commands of the background script (background/commands.ts). */
import { describe, expect, it, vi } from "vitest"
import { createCommandRunner } from "../src/background/commands"
import type { PortPush } from "../src/shared/messages"
import { createDefaultSettings, type Settings, SETTINGS_KEY } from "../src/shared/settings"
import { stubBrowser } from "./fixtures/browser"

/** The runner over a fake API whose active tab is `activeTabs`; `pushed` lists what went to which tab. */
function commands(activeTabs: { id?: number }[] = []) {
  const browser = stubBrowser({ stored: { [SETTINGS_KEY]: createDefaultSettings() }, activeTabs })
  const pushed: [number, PortPush][] = []
  const run = createCommandRunner({ ready: () => Promise.resolve(), postToTab: (tabId, msg) => void pushed.push([tabId, msg]) })
  return { run, pushed, browser }
}

describe("keyboard commands", () => {
  it("toggles the translation of the tab of the shortcut, else of the active tab", async () => {
    const { run, pushed, browser } = commands([{ id: 5 }])
    await run("toggle-translation", { id: 4 } as browser.tabs.Tab)
    expect(pushed).toEqual([[4, { type: "toggle" }]])
    expect(browser.api.tabs.query).not.toHaveBeenCalled()
    await run("toggle-translation")
    expect(browser.api.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true })
    expect(pushed.at(-1)).toEqual([5, { type: "toggle" }])
  })

  it("retranslates the message of the tab of the shortcut, else of the active tab", async () => {
    const { run, pushed } = commands([{ id: 5 }])
    await run("retranslate", { id: 4 } as browser.tabs.Tab)
    await run("retranslate")
    expect(pushed).toEqual([
      [4, { type: "retranslate" }],
      [5, { type: "retranslate" }],
    ])
  })

  it("does nothing without an active tab", async () => {
    const { run, pushed, browser } = commands()
    await run("toggle-translation")
    await run("retranslate")
    await run("unknown-command", { id: 4 } as browser.tabs.Tab)
    await run("toString", { id: 4 } as browser.tabs.Tab)
    expect(pushed).toEqual([])
    expect(browser.local.set).not.toHaveBeenCalled()
  })

  it("switches the display mode back and forth in the stored settings", async () => {
    const { run, browser } = commands()
    const mode = () => (browser.local.data[SETTINGS_KEY] as Settings).mode
    await run("toggle-display-mode")
    expect(mode()).toBe("translation-only")
    await run("toggle-display-mode")
    expect(mode()).toBe("bilingual")
  })

  it("waits until the settings are read", async () => {
    stubBrowser({ activeTabs: [{ id: 5 }] })
    let settle!: () => void
    const postToTab = vi.fn()
    const read = new Promise<void>((resolve) => (settle = resolve))
    const run = createCommandRunner({ ready: () => read, postToTab })
    const done = run("toggle-translation", { id: 4 } as browser.tabs.Tab)
    await Promise.resolve()
    expect(postToTab).not.toHaveBeenCalled()
    settle()
    await done
    expect(postToTab).toHaveBeenCalledWith(4, { type: "toggle" })
  })
})
