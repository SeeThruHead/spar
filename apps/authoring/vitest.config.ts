import { defineConfig } from "vitest/config"

const domain = new URL("../../packages/alchemy-domain/src/", import.meta.url).pathname

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@alchemy\.run\/domain$/, replacement: `${domain}index.ts` },
      { find: /^@alchemy\.run\/domain\/(.*)$/, replacement: `${domain}$1.ts` },
    ],
  },
  test: {
    name: "authoring",
    include: ["test/**/*.test.ts"],
  },
})
