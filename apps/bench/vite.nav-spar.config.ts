import { sparJsx } from "spar/transform/vite"
import { defineConfig } from "vite"

export default defineConfig({
  root: "src/nav-spar",
  base: "./",
  plugins: [sparJsx],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  build: { outDir: "../../dist/nav-spar", emptyOutDir: true },
})
