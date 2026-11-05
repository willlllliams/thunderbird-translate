/** The hooks of src/hooks/: undefined in every build but the e2e build, which takes the modules of src/e2e/hooks/ instead. */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(__dirname, "..")
const names = readdirSync(join(root, "src", "hooks")).sort()
const modules: Record<string, Record<string, unknown>> = Object.fromEntries(
  await Promise.all(names.map(async (name) => [name, await import(`../src/hooks/${name.replace(/\.ts$/, "")}.ts`)])),
)
/** The names a module exports as values (`export const`). */
const exported = (text: string) => [...text.matchAll(/^export const (\w+)/gm)].map((m) => m[1]).sort()
const source = (...path: string[]) => readFileSync(join(root, "src", ...path), "utf8")

describe("hooks", () => {
  it("exist", () => {
    expect(names).toEqual(["background.ts", "content.ts", "servers.ts", "welcome.ts"])
  })

  it.each(names)("%s: every export is undefined", (name) => {
    const module = modules[name]
    expect(Object.keys(module).sort()).toEqual(exported(source("hooks", name)))
    for (const [key, value] of Object.entries(module)) expect(value, key).toBeUndefined()
  })

  it.each(names)("%s: src/e2e/hooks/ defines the same hooks", (name) => {
    expect(exported(source("e2e", "hooks", name))).toEqual(exported(source("hooks", name)))
  })

  it("A3: are never called as hook?.(), which a regular build turns into a call of (void 0)", () => {
    const hooks = names.flatMap((name) => exported(source("hooks", name)))
    const files = (dir: string): string[] =>
      readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (entry.name === "e2e" ? [] : files(join(dir, entry.name))) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : []))
    for (const file of files("src")) {
      // Comments may name the form.
      const text = readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
      for (const hook of hooks) expect([file, hook, new RegExp(`\\b${hook}\\?\\.\\(`).test(text)]).toEqual([file, hook, false])
    }
    expect(readFileSync(join(root, "docs", "development.md"), "utf8")).toContain("`if (hook) hook(args)`")
  })

  it("src/e2e/hooks/ has no module without a module of src/hooks/", () => {
    expect(readdirSync(join(root, "src", "e2e", "hooks")).sort()).toEqual(names)
  })
})
