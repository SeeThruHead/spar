import { sparJsx } from "spar/transform/vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [sparJsx],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  test: {
    name: "ui",
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
