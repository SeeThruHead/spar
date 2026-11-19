import { describeServices, mentionsComponents } from "../transform/services.ts"

const entry = "spar/devtools/entry"

const isSource = (id: string): boolean => /\.tsx?(\?|$)/.test(id) && !id.includes("/node_modules/")

export const sparDevtools = {
  name: "spar-devtools",
  apply: "serve",
  enforce: "pre",
  transformIndexHtml: () => [
    {
      tag: "script",
      attrs: { type: "module", src: `/@id/${entry}` },
      injectTo: "head-prepend",
    },
  ],
  transform: (source: string, id: string): { readonly code: string; readonly map: null } | null => {
    if (!isSource(id) || !mentionsComponents(source)) return null

    return { code: describeServices(id, source), map: null }
  },
} as const
