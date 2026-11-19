import { sparDevtools } from "spar/devtools/vite"
import { sparJsx } from "spar/transform/vite"
import { defineConfig } from "vite"

const backend = process.env["SIDEBAR_BACKEND"]

const backends = backend === undefined ? [] : [backend]

const servedByBackend = {
  name: "sidebar-backend",
  apply: "serve",
  transformIndexHtml: () =>
    backends.map(() => ({
      tag: "meta",
      attrs: { name: "sidebar-backend", content: "/rpc" },
      injectTo: "head",
    })),
} as const

export default defineConfig({
  plugins: [sparJsx, sparDevtools({ backends }), servedByBackend],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  server: {
    host: "127.0.0.1",
    port: 4181,
    proxy: Object.fromEntries(backends.map((target) => ["/rpc", target])),
  },
})
