/** The link check of the Markdown files (scripts/check-doc-links.mjs, npm run docs:check) and GitHub's heading anchors. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { anchorsOfText, checkLinks, slug } from "../scripts/check-doc-links.mjs"

describe("heading anchors", () => {
  it("number a repeated heading until the anchor is free", () => {
    expect([...anchorsOfText("# A\n## A\n### A-1\n")]).toEqual(["a", "a-1", "a-1-1"])
    expect([...anchorsOfText("# A\n# A-1\n# A\n# A\n")]).toEqual(["a", "a-1", "a-2", "a-3"])
  })

  it("keep letters, marks and decimal digits of every script, and drop other numbers", () => {
    expect(slug("Étape 2: Übersicht")).toBe("étape-2-übersicht")
    expect(slug("设置 ٣ 項目")).toBe("设置-٣-項目")
    expect(slug("Area m² ½ ①")).toBe("area-m--")
    expect(slug("snake_case and kebab-case")).toBe("snake_case-and-kebab-case")
  })

  it("leave out images and keep the text of links, code and emphasis", () => {
    expect(slug("![logo](logo.png) Thunderbird Translate")).toBe("-thunderbird-translate")
    expect(slug("[Docs](docs/settings.md) and `npm run e2e` in **bold**")).toBe("docs-and-npm-run-e2e-in-bold")
  })

  it("include named anchors and ignore headings in code blocks", () => {
    expect([...anchorsOfText('<a name="top"></a>\n```\n# Not a heading\n```\n# Real\n')]).toEqual(["top", "real"])
  })
})

describe("link check", () => {
  it("reports missing files and anchors, anchors on other files, and skips URLs and code", () => {
    const dir = mkdtempSync(join(tmpdir(), "doc-links-"))
    try {
      mkdirSync(join(dir, "docs"))
      writeFileSync(join(dir, "docs", "guide.md"), "# Guide\n## Guide\n")
      writeFileSync(join(dir, "notes.txt"), "")
      writeFileSync(
        join(dir, "README.md"),
        [
          "[ok](docs/guide.md#guide-1) [here](#readme) [web](https://example.com/x.md#y) `[code](nowhere.md)`",
          "[gone](docs/missing.md) [bad](docs/guide.md#guide-2) [text](notes.txt#top)",
          "# Readme",
        ].join("\n"),
      )
      const { problems, checked } = checkLinks(dir)
      expect(checked).toBe(5)
      expect(problems).toEqual([
        "README.md:2: missing file docs/missing.md",
        "README.md:2: missing anchor docs/guide.md#guide-2",
        "README.md:2: anchor on a non-Markdown file notes.txt#top",
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
