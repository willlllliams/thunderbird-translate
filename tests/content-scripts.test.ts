/** Registering the content script and injecting it into the messages on screen (background/content-scripts.ts). */
import { describe, expect, it } from "vitest"
import { registerContentScripts } from "../src/background/content-scripts"
import { stubBrowser } from "./fixtures/browser"

describe("content script registration", () => {
  it("registers the content script and injects it into the messages already on screen", async () => {
    const { api } = stubBrowser({
      tabs: [{ id: 1, type: "mail" }, { id: 2, type: "messageDisplay" }, { id: 3, type: "content" }, { type: "mail" }, { id: 4, type: "mail" }, { id: 5, type: "mail" }],
    })
    api.tabs.insertCSS.mockImplementation(async (tabId: number) => {
      if (tabId === 4) throw new Error("No message displayed")
    })
    await registerContentScripts()
    expect(api.messageDisplayScripts.register).toHaveBeenCalledWith({ js: [{ file: "/content.js" }], css: [{ file: "/content.css" }] })
    expect(api.tabs.insertCSS.mock.calls.map(([id, details]) => [id, details])).toEqual([1, 2, 4, 5].map((id) => [id, { file: "/content.css" }]))
    expect(api.tabs.executeScript.mock.calls).toEqual([1, 2, 5].map((id) => [id, { file: "/content.js" }]))
  })
})
