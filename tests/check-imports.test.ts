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
    expect(importsOf(text).map(({ spec, line }) => ({ spec, line }))).toEqual([
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

  it("tell imports of types only from the others", () => {
    const text = ['import type { A } from "./a"', 'export type { B } from "./b"', 'import type * as C from "./c"', 'import { type D } from "./d"', 'import "./e"', 'const f = () => import("./f")'].join("\n")
    expect(importsOf(text).map(({ spec, typeOnly }) => [spec, typeOnly])).toEqual([
      ["./a", true],
      ["./b", true],
      ["./c", true],
      ["./d", false],
      ["./e", false],
      ["./f", false],
    ])
  })

  it("skip comments and strings that only look like imports", () => {
    const text = ['// import a from "./a"', '/* import("./b")', 'import "./c" */', 'const url = "https://example.com" // import "./d"', 'const s = "import of ./e"'].join("\n")
    expect(importsOf(text)).toEqual([])
  })

  it("find a dynamic import whose path is a template literal, and mark one with substitutions as computed", () => {
    const text = ["const a = () => import(`../offline/a`)", "const b = (name: string) => import(`../offline/${name}/b`)", "const c = `${`${import(`./c`)}`}`"].join("\n")
    expect(importsOf(text)).toEqual([
      { spec: "../offline/a", line: 1, typeOnly: false },
      { spec: "../offline/", line: 2, typeOnly: false, computed: true },
      { spec: "./c", line: 3, typeOnly: false },
    ])
  })

  it("read the code after strings and regular expressions that contain comment or quote characters", () => {
    const text = [
      'const glob = "src/*"',
      'import { a } from "../offline/a"',
      'const end = "*/"; const url = "http: //x"; import { b } from "../offline/b"',
      "const quote = /\"/; const slash = /\\/\\//g; import { c } from '../offline/c'",
      "const ratio = 4 / 2; import { d } from '../offline/d' // /",
      'const t = `${"}"} //`; import { e } from "../offline/e"',
    ].join("\n")
    expect(importsOf(text).map(({ spec, line }) => [spec, line])).toEqual([
      ["../offline/a", 2],
      ["../offline/b", 3],
      ["../offline/c", 4],
      ["../offline/d", 5],
      ["../offline/e", 6],
    ])
  })

  it("take a default import named type for a value import", () => {
    const text = [
      'import type from "./a"',
      'import type, { b } from "./b"',
      'import type = require("./c")',
      'import type from from "./d"',
      'import type { from } from "./e"',
      'import { from } from "./f"',
      'import x = require("./g")',
    ].join("\n")
    expect(importsOf(text).map(({ spec, typeOnly }) => [spec, typeOnly])).toEqual([
      ["./a", false],
      ["./b", false],
      ["./c", false],
      ["./d", true],
      ["./e", true],
      ["./f", false],
      ["./g", false],
    ])
  })

  it("leave out import.meta, properties named import and export statements without a path", () => {
    const text = ['const u = import.meta.url', 'const o = { import: 1 }; o.import; o?.import', "export { u }", "export const v = 1", 'export default "./w"', "export type X = 1"].join("\n")
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
        "src/background/index.ts": 'import { x } from "../offline/x"\nimport { hook } from "../hooks/hook"',
        "src/hooks/hook.ts": 'import type { X } from "../offline/x"\nexport type { B } from "../shared/b"',
        "src/options/index.ts": 'import { r } from "../content/render"',
        "src/welcome/index.ts": 'import { o } from "../options/index"',
        "src/e2e/hook.ts": 'import { w } from "../welcome/index"\nimport { p } from "../popup/index"\nimport { h } from "../hooks/hook"',
      },
      (dir) => expect(checkImports(dir)).toEqual({ problems: [], checked: 12 }),
    )
  })

  it("report every import across a layer boundary, with file and line", () => {
    withTree(
      {
        "src/shared/a.ts": 'import type {\n  X,\n} from "../background/x"\nexport * from "../offline/y"',
        "src/content/c.ts": 'const dom = () => import("../options/dom")',
        "src/popup/index.ts": 'import "../background/side"\nimport { hook } from "../e2e/hook"',
        "src/offline/o.ts": 'import data from "../../vendor/data.json"',
        "src/options/o.ts": 'import { DictionaryStore } from "../offline/dictionary/store"',
        "src/tools/t.ts": "export {}",
        "src/background/index.ts": 'import { setUp } from "../e2e/background"',
        "src/hooks/hook.ts": 'import { run } from "../background/run"\nimport type { X } from "../popup/x"\nimport type from "../shared/t"',
        "src/welcome/w.ts": 'const glob = "*/*"\nconst b = () => import(`../background/b`)\nconst c = (n: string) => import(`../${n}/c`)',
      },
      (dir) =>
        expect(checkImports(dir).problems).toEqual([
          "src/background/index.ts:1: background must not import e2e (../e2e/background)",
          "src/content/c.ts:1: content must not import options (../options/dom)",
          "src/hooks/hook.ts:1: hooks may import types only (../background/run)",
          "src/hooks/hook.ts:2: hooks must not import popup (../popup/x)",
          "src/hooks/hook.ts:3: hooks may import types only (../shared/t)",
          "src/offline/o.ts:1: ../../vendor/data.json is outside src/",
          "src/options/o.ts:1: options must not import offline (../offline/dictionary/store)",
          "src/popup/index.ts:1: popup must not import background (../background/side)",
          "src/popup/index.ts:2: popup must not import e2e (../e2e/hook)",
          "src/shared/a.ts:3: shared must not import background (../background/x)",
          "src/shared/a.ts:4: shared must not import offline (../offline/y)",
          "src/tools/t.ts: directory src/tools/ belongs to no layer",
          "src/welcome/w.ts:2: welcome must not import background (../background/b)",
          "src/welcome/w.ts:3: the path of a dynamic import is computed and cannot be checked (../…)",
        ]),
    )
  })

  it("pass on the repository", () => {
    expect(checkImports().problems).toEqual([])
  })
})
