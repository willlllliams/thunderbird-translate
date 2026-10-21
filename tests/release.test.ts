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

describe("workflows", () => {
  const workflow = (name: string) => readFileSync(join(root, ".github", "workflows", name), "utf8")

  it("shell lines continued with a backslash go on in the next line", () => {
    for (const name of ["release.yml", "dicts.yml"]) {
      const lines = workflow(name).split("\n")
      lines.forEach((line, i) => {
        if (line.trimEnd().endsWith("\\")) expect(lines[i + 1]?.trim().replace(/^\\$/, ""), `${name}:${i + 2}`).toBeTruthy()
      })
    }
  })

  it("I1: release from main only, and attach the source archive", () => {
    const release = workflow("release.yml")
    const job = release.slice(release.indexOf("\n  release:"))
    expect(job).toMatch(/^ {4}if: .*github\.ref == 'refs\/heads\/main'/m)
    expect(job).toContain("thunderbird-translate-$VERSION-source.zip")
    expect(release).toContain("npm run source-zip")
  })

  it("I9: run no third-party action by a tag that can move; actions of GitHub by their major version", () => {
    for (const name of ["release.yml", "dicts.yml"]) {
      for (const [, action, ref] of workflow(name).matchAll(/uses: ([\w.-]+\/[\w.-]+)@(\S+)/g)) {
        if (!action.startsWith("actions/")) expect(ref, `${name}: ${action}`).toMatch(/^[0-9a-f]{40}$/)
      }
    }
  })
})
