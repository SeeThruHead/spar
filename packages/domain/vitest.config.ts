import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "domain",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "istanbul",
      include: ["src/**"],
      reporter: ["text-summary", ["text", { skipFull: true }]],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
