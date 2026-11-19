import { defineConfig } from "vite"

export default defineConfig({
  root: "src/react",
  base: "./",
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  define: { "process.env.NODE_ENV": '"production"' },
  build: { outDir: "../../dist/react", emptyOutDir: true },
})
