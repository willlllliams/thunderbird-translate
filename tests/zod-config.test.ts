import { expect, it, vi } from "vitest"

// A file of its own: zod caches the result of its probe in the first module that loads it.
it("the AI chunk keeps zod from calling the Function constructor", async () => {
  const calls: unknown[][] = []
  vi.stubGlobal("Function", new Proxy(Function, { construct: (target, args) => (calls.push(args), Reflect.construct(target, args)) }))
  await import("../src/background/translators/llm")
  const { z } = await import("zod")
  expect(z.object({ a: z.string() }).parse({ a: "x" })).toEqual({ a: "x" })
  expect(calls).toEqual([])
  expect((globalThis as { __zod_globalConfig?: { jitless?: boolean } }).__zod_globalConfig?.jitless).toBe(true)
})
