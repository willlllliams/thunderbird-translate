/** Subjects: the reply and forward prefixes that stay untranslated (shared/subject.ts) and the subject of a displayed message (background/subject.ts). */
import { describe, expect, it, vi } from "vitest"
import { displayedSubject } from "../src/background/subject"
import { splitSubject } from "../src/shared/subject"

describe("splitSubject", () => {
  it.each([
    ["Budget", "", "Budget"],
    ["Re: Budget", "Re: ", "Budget"],
    ["RE: Fwd: FW: Budget", "RE: Fwd: FW: ", "Budget"],
    ["Re[2]: Budget", "Re[2]: ", "Budget"],
    ["AW: WG: Angebot", "AW: WG: ", "Angebot"],
    ["SV: Möte", "SV: ", "Möte"],
    ["Odp: Spotkanie", "Odp: ", "Spotkanie"],
    ["YNT: Toplantı", "YNT: ", "Toplantı"],
    ["İLT: Toplantı", "İLT: ", "Toplantı"],
    ["回复：预算", "回复：", "预算"],
    ["転送: 会議", "転送: ", "会議"],
    ["답장: 회의", "답장: ", "회의"],
    ["  Re:Budget  ", "  Re:", "Budget"],
    // A word that starts like a prefix but has no colon after it is part of the subject.
    ["Report: Q3", "", "Report: Q3"],
    ["Res publica", "", "Res publica"],
  ])("%s", (subject, prefix, text) => {
    expect(splitSubject(subject)).toEqual({ prefix, text })
  })
})

describe("displayedSubject", () => {
  it("reads the subject of the message on screen in the tab", async () => {
    const getDisplayedMessage = vi.fn(async (_tabId: number) => ({ id: 1, subject: "Budget", author: "a@example.com", date: 0 }))
    vi.stubGlobal("browser", { messageDisplay: { getDisplayedMessage } })
    expect(await displayedSubject(4)).toBe("Budget")
    expect(getDisplayedMessage).toHaveBeenCalledWith(4)
  })

  it.each([
    ["no message", null],
    ["an empty subject", { id: 1, subject: "  ", author: "", date: 0 }],
    ["a subject that is no string", { id: 1, subject: undefined, author: "", date: 0 }],
  ])("is null for %s", async (_name, message) => {
    vi.stubGlobal("browser", { messageDisplay: { getDisplayedMessage: async () => message } })
    expect(await displayedSubject(4)).toBeNull()
  })
})
