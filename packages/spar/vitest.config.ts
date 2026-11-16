import { defineConfig } from "vitest/config"
import { sparJsx } from "./src/transform/vite.ts"

export default defineConfig({
  plugins: [sparJsx],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  test: {
    name: "spar",
    environment: "happy-dom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
})
