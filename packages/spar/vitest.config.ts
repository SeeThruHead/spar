import { defineConfig } from "vitest/config"
import { sparJsx } from "./src/transform/vite.ts"

export default defineConfig({
  plugins: [sparJsx],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  test: {
    name: "spar",
    environment: "happy-dom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    coverage: {
      enabled: true,
      provider: "istanbul",
      include: ["src/**"],
      reporter: ["text-summary", ["text", { skipFull: true }]],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
