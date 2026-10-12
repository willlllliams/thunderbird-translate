import { defineConfig } from "vitest/config"

export default defineConfig({
  define: { __DEBUG__: "false", __E2E__: "false" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Before every test: globals stubbed with vi.stubGlobal() are restored, spies of vi.spyOn() get their original back.
    unstubGlobals: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        // Worker entry: hands the real Bergamot wasm module to worker-core.ts, which the unit tests cover with a stand-in; the e2e build loads the real one.
        "src/offline/bergamot/worker.ts",
        // Hooks of the e2e test build, stripped from every other build; they run in npm run e2e.
        "src/e2e/**",
      ],
      reporter: ["text", "json-summary"],
      // npm run test:coverage (CI) fails below these values.
      thresholds: { lines: 97, statements: 97, branches: 93, functions: 96 },
    },
  },
})
