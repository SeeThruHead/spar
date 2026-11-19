import { defineConfig } from "vite"

export default defineConfig({
  root: "src/nav-foldkit",
  base: "./",
  build: { outDir: "../../dist/nav-foldkit", emptyOutDir: true },
})
