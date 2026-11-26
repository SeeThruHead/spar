import { defineConfig } from "vite"

export default defineConfig({
  root: "src/effect-ui",
  base: "./",
  build: { outDir: "../../dist/effect-ui", emptyOutDir: true },
})
