import { describeServices, mentionsComponents } from "../transform/services.ts"
import { backendPath } from "./paths.ts"

const entry = "spar/devtools/entry"

const isSource = (id: string): boolean => /\.tsx?(\?|$)/.test(id) && !id.includes("/node_modules/")

const proxied = (target: string, index: number) =>
  [
    backendPath(index),
    {
      target,
      changeOrigin: true,
      rewrite: (path: string): string => path.replace(backendPath(index), ""),
    },
  ] as const

export const sparDevtools = (
  options: { readonly backends: ReadonlyArray<string> } = { backends: [] },
) =>
  ({
    name: "spar-devtools",
    apply: "serve",
    enforce: "pre",
    config: () => ({ server: { proxy: Object.fromEntries(options.backends.map(proxied)) } }),
    transformIndexHtml: () => [
      {
        tag: "script",
        children: `globalThis.sparBackends = ${options.backends.length}`,
        injectTo: "head-prepend",
      },
      {
        tag: "script",
        attrs: { type: "module", src: `/@id/${entry}` },
        injectTo: "head-prepend",
      },
    ],
    transform: (
      source: string,
      id: string,
    ): { readonly code: string; readonly map: null } | null => {
      if (!isSource(id) || !mentionsComponents(source)) return null

      return { code: describeServices(id.replace(/\?.*$/, ""), source), map: null }
    },
  }) as const
