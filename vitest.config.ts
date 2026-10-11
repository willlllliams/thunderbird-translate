import { defineConfig } from "vitest/config"

export default defineConfig({
  define: { __DEBUG__: "false" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
})
