import { defineConfig } from "vite"

export default defineConfig({
  root: "src/foldkit",
  base: "./",
  build: { outDir: "../../dist/foldkit", emptyOutDir: true },
})
