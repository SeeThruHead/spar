import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "lint",
    include: ["*.test.ts"],
    testTimeout: 60_000,
    coverage: {
      enabled: true,
      provider: "istanbul",
      include: ["attribution.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
