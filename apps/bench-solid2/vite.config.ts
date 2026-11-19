import solid from "@solidjs/vite-plugin"
import { defineConfig } from "vite"

export default defineConfig({
  root: "src",
  base: "./",
  plugins: [solid()],
  build: { outDir: "../../bench/dist/solid2", emptyOutDir: true },
})
