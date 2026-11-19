import { sparDevtools } from "spar/devtools/vite"
import { sparJsx } from "spar/transform/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [sparJsx, sparDevtools],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  server: { host: "127.0.0.1", port: 4181 },
})
