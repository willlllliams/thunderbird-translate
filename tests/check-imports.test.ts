/** The layer check of src/ (scripts/check-imports.mjs, npm run imports:check). */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { checkImports, importsOf } from "../scripts/check-imports.mjs"

describe("import specifiers", () => {
  it("find every import form, also over several lines, with the line of the specifier", () => {
    const text = [
      'import a from "./a"',
      'import type { B } from "./b"',
      "import {",
      "  c,",
      "  type D,",
      '} from "./c"',
      'export { e } from "./e"',
      'export * from "./f"',
      'import * as g from "./g"',
      'import "./side-effect"',
      'const h = () => import("./h")',
      'import x from "npm-package"',
    ].join("\n")
    expect(importsOf(text)).toEqual([
      { spec: "./a", line: 1 },
      { spec: "./b", line: 2 },
      { spec: "./c", line: 6 },
      { spec: "./e", line: 7 },
      { spec: "./f", line: 8 },
      { spec: "./g", line: 9 },
      { spec: "./side-effect", line: 10 },
      { spec: "./h", line: 11 },
      { spec: "npm-package", line: 12 },
    ])
  })

  it("skip comments and strings that only look like imports", () => {
    const text = ['// import a from "./a"', '/* import("./b")', 'import "./c" */', 'const url = "https://example.com" // import "./d"', 'const s = "import of ./e"'].join("\n")
    expect(importsOf(text)).toEqual([])
  })
})

describe("layer check", () => {
  const withTree = (files: Record<string, string>, check: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "check-imports-"))
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

  it("accept the allowed directions, npm packages and locales/*.json", () => {
    withTree(
      {
        "src/shared/a.ts": 'import en from "../../locales/en.json"\nimport { z } from "zod"\nimport { b } from "./b"',
        "src/shared/b.ts": "export const b = 1",
        "src/offline/x.ts": 'import { b } from "../shared/b"',
        "src/background/index.ts": 'import { x } from "../offline/x"\nimport { hook } from "../e2e/hook"',
        "src/options/index.ts": 'import { x } from "../offline/x"\nimport { r } from "../content/render"',
        "src/welcome/index.ts": 'import { o } from "../options/index"',
        "src/e2e/hook.ts": 'import { w } from "../welcome/index"\nimport { p } from "../popup/index"',
      },
      (dir) => expect(checkImports(dir)).toEqual({ problems: [], checked: 10 }),
    )
  })

  it("report every import across a layer boundary, with file and line", () => {
    withTree(
      {
        "src/shared/a.ts": 'import type {\n  X,\n} from "../background/x"\nexport * from "../offline/y"',
        "src/content/c.ts": 'const dom = () => import("../options/dom")',
        "src/popup/index.ts": 'import "../background/side"\nimport { hook } from "../e2e/hook"',
        "src/offline/o.ts": 'import data from "../../vendor/data.json"',
        "src/tools/t.ts": "export {}",
      },
      (dir) =>
        expect(checkImports(dir).problems).toEqual([
          "src/content/c.ts:1: content must not import options (../options/dom)",
          "src/offline/o.ts:1: ../../vendor/data.json is outside src/",
          "src/popup/index.ts:1: popup must not import background (../background/side)",
          "src/popup/index.ts:2: popup must not import e2e (../e2e/hook)",
          "src/shared/a.ts:3: shared must not import background (../background/x)",
          "src/shared/a.ts:4: shared must not import offline (../offline/y)",
          "src/tools/t.ts: directory src/tools/ belongs to no layer",
        ]),
    )
  })

  it("pass on the repository", () => {
    expect(checkImports().problems).toEqual([])
  })
})
