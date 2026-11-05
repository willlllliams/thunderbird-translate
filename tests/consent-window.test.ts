/** The window of the popup page that shows the consent questions of a tab when the message header button is in no toolbar (background/consent-window.ts). */
import { describe, expect, it, vi } from "vitest"
import { createConsentWindows } from "../src/background/consent-window"
import { fakeEvent } from "./fixtures/events"

function windowsApi() {
  const onRemoved = fakeEvent<[number]>()
  let last = 0
  const windows = {
    create: vi.fn(async (_options: object) => ({ id: ++last })),
    update: vi.fn(async (_id: number, _info: object) => ({})),
    remove: vi.fn(async (id: number) => void onRemoved.fire(id)),
    onRemoved,
  }
  return { windows, api: { windows } as unknown as Parameters<typeof createConsentWindows>[0] }
}
const tabUrl = (tabId: number) => `popup/${tabId}`

describe("consent windows", () => {
  it("opens one window per tab, focuses it for the next question, even one asked while it opens, and closes it with the last question", async () => {
    const { windows, api } = windowsApi()
    const consent = createConsentWindows(api, tabUrl)
    // Two panels ask at once (text and images): one window.
    await Promise.all([consent.show(3), consent.show(3)])
    expect(windows.create).toHaveBeenCalledTimes(1)
    expect(windows.create).toHaveBeenCalledWith(expect.objectContaining({ type: "popup", url: "popup/3" }))
    expect(windows.update).toHaveBeenCalledWith(1, { focused: true })
    await consent.show(3)
    expect(windows.create).toHaveBeenCalledTimes(1)
    // Another tab has a window of its own.
    await consent.show(4)
    expect(windows.create).toHaveBeenCalledTimes(2)
    consent.close(3)
    await vi.waitFor(() => expect(windows.remove).toHaveBeenCalledWith(1))
    expect(windows.remove).toHaveBeenCalledTimes(1)
    // A closed tab has no window: the next question opens one.
    await consent.show(3)
    expect(windows.create).toHaveBeenCalledTimes(3)
  })

  it("opens a new window when the user closed the old one, and forgets a window the user closed", async () => {
    const { windows, api } = windowsApi()
    const consent = createConsentWindows(api, tabUrl)
    await consent.show(3)
    windows.onRemoved.fire(1)
    await Promise.resolve()
    await consent.show(3)
    expect(windows.create).toHaveBeenCalledTimes(2)
    expect(windows.update).not.toHaveBeenCalled()
    // A window that cannot be focused any more (closed meanwhile) is replaced.
    windows.update.mockRejectedValueOnce(new Error("no window"))
    await consent.show(3)
    expect(windows.create).toHaveBeenCalledTimes(3)
    // Closing a tab without a window, or a window already gone, does nothing.
    consent.close(9)
    windows.remove.mockRejectedValueOnce(new Error("no window"))
    consent.close(3)
    await Promise.resolve()
    expect(windows.remove).toHaveBeenCalledTimes(1)
  })
})
