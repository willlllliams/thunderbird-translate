/** The third-party notices of the xpi (scripts/notices.mjs, written by scripts/build.mjs). */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { bundledPackages, CC_BY_SA_URL, copyrightLine, ECDICT_COPYRIGHT, MPL_URL, PACKAGES, packageNotices, thirdPartyNotices } from "../scripts/notices.mjs"

const root = join(__dirname, "..")
/** One file of every declared package, as esbuild lists the files it read. */
const declaredInputs = Object.keys(PACKAGES).map((name) => `node_modules/${name}/dist/index.mjs`)

describe("bundled packages", () => {
  it("take the innermost package of every file under node_modules/, scoped or not, and skip the sources", () => {
    const inputs = [
      "src/background/index.ts",
      "node_modules/zod/v4/core/core.js",
      "node_modules/zod/v4/classic/schemas.js",
      "node_modules/@ai-sdk/openai/dist/index.mjs",
      "node_modules/ai/node_modules/@ai-sdk/provider/dist/index.mjs",
      "node_modules\\fzstd\\esm\\index.mjs",
    ]
    expect([...bundledPackages(inputs)]).toEqual([
      ["@ai-sdk/openai", "node_modules/@ai-sdk/openai"],
      ["@ai-sdk/provider", "node_modules/ai/node_modules/@ai-sdk/provider"],
      ["fzstd", "node_modules/fzstd"],
      ["zod", "node_modules/zod"],
    ])
  })
})

describe("copyright line", () => {
  it("is the first notice with a year, also over several lines, and not the template of the Apache License appendix", () => {
    expect(copyrightLine("MIT License\n\nCopyright (c) 2016 A, the University of\r\nB\n\nPermission is hereby granted")).toBe("Copyright (c) 2016 A, the University of B")
    expect(copyrightLine("   Copyright [yyyy] [name of copyright owner]\n\n   Licensed under")).toBeNull()
    expect(copyrightLine("   APPENDIX\n\n   Copyright 2017 Vercel, Inc.\n\n   Licensed under")).toBe("Copyright 2017 Vercel, Inc.")
  })
})

describe("notices of the repository", () => {
  const text = thirdPartyNotices({ root, inputs: declaredInputs, version: "9.9.9" })
  const readme = readFileSync(join(root, "vendor", "bergamot", "README.md"), "utf8")

  it("list every bundled package with the version of node_modules/, its license and copyright line", () => {
    const notices = packageNotices({ root, inputs: declaredInputs })
    expect(notices.map((n) => n.name).sort()).toEqual(Object.keys(PACKAGES).sort())
    for (const n of notices) {
      const pkg = JSON.parse(readFileSync(join(root, "node_modules", n.name, "package.json"), "utf8")) as { version: string; license: string }
      expect([n.version, n.license]).toEqual([pkg.version, pkg.license])
      expect(n.copyright).toMatch(/^Copyright (\(c\) )?\d{4} \S/)
      expect(text).toContain(`${n.name} ${n.version}\n  License:      ${n.license}\n  Copyright:    ${n.copyright}`)
    }
    expect(notices.filter((n) => n.license === "Apache-2.0")).toHaveLength(22)
    expect(notices.filter((n) => n.license === "MIT")).toHaveLength(3)
    expect(text).toContain("25 packages: 22 under Apache-2.0, 3 under MIT.")
  })

  it("take the license texts the npm packages lack from licenses/, naming where they come from", () => {
    expect(text).toMatch(/@ai-sdk\/provider-utils [\d.]+\n(.+\n){3}  License text: \[A\][^\n]*\n  Text from:    https:\/\/github\.com\/vercel\/ai\/blob\/main\/LICENSE/)
    expect(text).toMatch(/@workflow\/serde [\d.]+\n  License:      Apache-2.0\n  Copyright:    Copyright 2025 Vercel Inc\.\n(.+\n){2}  Text from:    https:\/\/github\.com\/vercel\/workflow/)
  })

  it("hold the Apache License 2.0 once, and the text of each MIT package", () => {
    expect(text.split("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION")).toHaveLength(2)
    for (const name of ["eventsource-parser", "fzstd", "zod"]) {
      const own = readFileSync(join(root, "node_modules", name, "LICENSE"), "utf8").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim()
      expect(text).toContain(own)
    }
  })

  it("name release, revision, license and source code of the Bergamot engine as vendor/bergamot/README.md does", () => {
    const revision = /revision `([0-9a-f]{40})`/.exec(readme)![1]
    const release = /release (v[\d.]+)/.exec(readme)![1]
    expect([release, revision]).toEqual(["v0.6.0", "1de4a085d3a7afb625c51a60aabb5ad298e4059f"])
    expect(text).toContain(`release ${release}`)
    expect(text).toContain(`revision ${revision}`)
    expect(text).toContain(`Mozilla Public License 2.0 (MPL-2.0), ${MPL_URL}`)
    expect(text).toContain(`https://github.com/mozilla/translations/tree/${revision}`)
  })

  it("credit the dictionary data with CC BY-SA 4.0 and the copyright and MIT text of ECDICT", () => {
    expect(text.replace(/\s+/g, " ")).toContain("adapted (extracted, filtered and trimmed) from Wiktionary")
    expect(text).toContain(CC_BY_SA_URL)
    expect(text.replace(/\s+/g, " ")).toContain(`from ECDICT, ${ECDICT_COPYRIGHT} (https://github.com/skywind3000/ECDICT), under the MIT License`)
    expect(text).toContain(`MIT License\n\n${ECDICT_COPYRIGHT}\n\nPermission is hereby granted`)
  })
})

describe("build guard", () => {
  const mit = (holder: string) => `MIT License\n\nCopyright (c) 2024 ${holder}\n\nPermission is hereby granted, free of charge.`
  const withPackages = (files: Record<string, string>, check: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "notices-"))
    try {
      for (const [name, text] of Object.entries(files)) {
        mkdirSync(join(dir, dirname(name)), { recursive: true })
        writeFileSync(join(dir, name), text)
      }
      check(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const pkg = (name: string, license = "MIT") => JSON.stringify({ name, version: "1.2.3", license, repository: { url: `git+https://github.com/x/${name}.git` } })

  it("accepts declared packages with license text and copyright line", () => {
    withPackages({ "node_modules/a/package.json": pkg("a"), "node_modules/a/LICENSE.md": mit("A") }, (dir) =>
      expect(packageNotices({ root: dir, inputs: ["node_modules/a/index.js"], packages: { a: { license: "MIT" } } })).toEqual([
        { name: "a", version: "1.2.3", license: "MIT", copyright: "Copyright (c) 2024 A", text: mit("A"), source: undefined, repository: "https://github.com/x/a" },
      ]),
    )
  })

  it("fails on a bundled package that is not declared, a declared one no longer bundled, a missing text or copyright line, and another license", () => {
    withPackages(
      {
        "node_modules/new/package.json": pkg("new"),
        "node_modules/new/LICENSE": mit("New"),
        "node_modules/bare/package.json": pkg("bare"),
        "node_modules/plain/package.json": pkg("plain"),
        "node_modules/plain/LICENSE": "Permission is hereby granted, free of charge.",
        "node_modules/other/package.json": pkg("other", "ISC"),
        "node_modules/other/LICENSE": mit("Other"),
        "node_modules/kept/package.json": pkg("kept"),
      },
      (dir) => {
        const inputs = ["new", "bare", "plain", "other", "kept"].map((name) => `node_modules/${name}/index.js`)
        const packages = { bare: { license: "MIT" }, plain: { license: "MIT" }, other: { license: "MIT" }, gone: { license: "MIT" }, kept: { license: "MIT", licenseFile: "licenses/kept.txt" } }
        expect(() => packageNotices({ root: dir, inputs, packages })).toThrow(
          [
            "Third-party notices:",
            "gone is declared in scripts/notices.mjs but no longer bundled",
            "bare: no license text (no LICENSE file in node_modules/bare); put one into licenses/ and name it in scripts/notices.mjs",
            "kept: no license text (licenses/kept.txt); put one into licenses/ and name it in scripts/notices.mjs",
            "new is bundled but not declared in scripts/notices.mjs (license, license text)",
            'other: package.json names the license "ISC", scripts/notices.mjs MIT',
            "plain: the license text node_modules/plain/LICENSE has no copyright line",
          ].join("\n"),
        )
      },
    )
  })
})
