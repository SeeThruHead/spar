import { sparDevtools } from "spar/devtools/vite"
import { sparJsx } from "spar/transform/vite"
import { defineConfig } from "vite"

export default defineConfig({
  root: "src/spar",
  plugins: [sparJsx, sparDevtools({ backends: [] })],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
})
