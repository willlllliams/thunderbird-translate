/** Error texts of the offline engine for keys the locales do not have yet. */
import { describe, expect, it, vi } from "vitest"

vi.mock("../src/shared/i18n", async (importOriginal) => ({ ...(await importOriginal<object>()), EN_MESSAGES: {} }))

const { BergamotError } = await import("../src/offline/bergamot/errors")

describe("offline engine errors without locale texts", () => {
  it("uses the built-in English text, with the detail when there is one", () => {
    expect(new BergamotError("bergamotModelMissing", ["ja", "en", "ja → en"]).message).toBe(
      "The offline translation model for ja → en is not installed. Install these language pairs in the settings: ja → en",
    )
    expect(new BergamotError("bergamotDownloadFailed", ["lex.bin"], "HTTP 404").message).toBe("Could not download the offline model file lex.bin. - HTTP 404")
  })
})
