import { sparJsx } from "spar/transform/vite"
import { defineConfig } from "vite"

export default defineConfig({
  root: "src/spar-composed",
  base: "./",
  plugins: [sparJsx],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  build: { outDir: "../../dist/spar-composed", emptyOutDir: true },
})
