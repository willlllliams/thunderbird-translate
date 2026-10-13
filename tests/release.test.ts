/** The release: the version in its four places and the release notes from CHANGELOG.md (scripts/release-notes.mjs). */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_REPOSITORY, releaseNotes } from "../scripts/release-notes.mjs"

const root = join(__dirname, "..")
const json = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8"))

const CHANGELOG = [
  "# Changelog",
  "",
  "Intro.",
  "",
  "## 2.0.0 - 2026-10-13",
  "",
  "First line.",
  "",
  "### Fixed",
  "",
  "- See [settings](docs/settings.md#prompts), [the top](#changelog), [./LICENSE](./LICENSE) and [a site](https://example.com/x).",
  "",
  "## 1.13.0 - 2026-10-12",
  "",
  "- Older.",
  "",
  "## 1.2.0",
  "",
].join("\n")

describe("release notes", () => {
  it("are the section of the version up to the next one, without its heading", () => {
    const notes = releaseNotes(CHANGELOG, "2.0.0", "owner/repo")
    expect(notes.startsWith("First line.\n\n### Fixed\n\n- See ")).toBe(true)
    expect(notes).not.toContain("Older")
    expect(notes.endsWith(".\n")).toBe(true)
    expect(releaseNotes(CHANGELOG, "1.13.0")).toBe("- Older.\n")
  })

  it("point relative links to the files at the tag of the version; anchors and absolute links stay", () => {
    expect(releaseNotes(CHANGELOG, "2.0.0", "owner/repo")).toContain(
      "[settings](https://github.com/owner/repo/blob/v2.0.0/docs/settings.md#prompts), [the top](#changelog), [./LICENSE](https://github.com/owner/repo/blob/v2.0.0/LICENSE) and [a site](https://example.com/x)",
    )
    expect(DEFAULT_REPOSITORY).toBe("willlllliams/thunderbird-translate")
  })

  it("fail for a version without a section, a version that only starts like one, and an empty section", () => {
    expect(() => releaseNotes(CHANGELOG, "3.0.0")).toThrow('CHANGELOG.md has no section "## 3.0.0 - <date>"')
    expect(() => releaseNotes(CHANGELOG, "2.0")).toThrow("no section")
    expect(() => releaseNotes(CHANGELOG, "1.2.0")).toThrow("The section of 1.2.0 in CHANGELOG.md is empty")
    // A dot in the version is a dot, not any character.
    expect(() => releaseNotes(CHANGELOG.replace("## 1.13.0", "## 1x13x0"), "1.13.0")).toThrow("no section")
  })
})

describe("version", () => {
  it("is the same in the manifest, package.json and both fields of package-lock.json, and CHANGELOG.md has its section", () => {
    const { version } = json("static/manifest.json") as { version: string }
    const lock = json("package-lock.json") as { version: string; packages: Record<string, { version?: string }> }
    expect([json("package.json").version, lock.version, lock.packages[""].version]).toEqual([version, version, version])
    const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8")
    expect(changelog).toMatch(new RegExp(`^## ${version.replaceAll(".", "\\.")} - \\d{4}-\\d{2}-\\d{2}$`, "m"))
    expect(releaseNotes(changelog, version).length).toBeGreaterThan(20)
  })
})
