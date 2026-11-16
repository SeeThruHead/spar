import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "sidebar",
    include: ["test/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "istanbul",
      include: ["src/domain.ts"],
      reporter: ["text-summary", ["text", { skipFull: true }]],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
