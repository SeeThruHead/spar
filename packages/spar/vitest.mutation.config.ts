import { defineConfig } from "vitest/config"
import { sparJsx } from "./src/transform/vite.ts"

const here = new URL(".", import.meta.url).pathname

export default defineConfig({
  plugins: [sparJsx],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  resolve: {
    alias: [
      { find: /^spar$/, replacement: `${here}src/index.ts` },
      { find: /^spar\/testing$/, replacement: `${here}src/testing.ts` },
      { find: /^spar\/jsx-(dev-)?runtime$/, replacement: `${here}src/jsx-runtime.ts` },
    ],
  },
  test: {
    name: "spar-mutation",
    environment: "happy-dom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    exclude: ["test/transform.test.ts"],
    coverage: { enabled: false },
  },
})
