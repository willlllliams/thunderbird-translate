import { defineConfig } from "vitest/config"

export default defineConfig({
  define: { __DEBUG__: "false", __E2E__: "false" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
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
      thresholds: { lines: 99, statements: 99, branches: 96, functions: 98 },
    },
  },
})
