import { defineConfig } from "vitest/config"

export default defineConfig({
  define: { __DEBUG__: "false" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // A test that loads the modules of a page or of the background script, or works through IndexedDB, can take more than
    // the default 5 s on a busy machine (CI runners, several test runs at once); a test that hangs still fails.
    testTimeout: 20_000,
    // Before every test: globals stubbed with vi.stubGlobal() are restored, spies of vi.spyOn() get their original back.
    unstubGlobals: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        // Worker entry: hands the real Bergamot wasm module to worker-core.ts, which the unit tests cover with a stand-in; the e2e build loads the real one.
        "src/offline/bergamot/worker.ts",
        // The e2e build puts src/e2e/hooks/ in place of src/hooks/; this code runs in npm run e2e only.
        "src/e2e/**",
      ],
      reporter: ["text", "json-summary"],
      // npm run test:coverage (CI) fails below these values.
      thresholds: { lines: 97, statements: 97, branches: 93, functions: 96 },
    },
  },
})
