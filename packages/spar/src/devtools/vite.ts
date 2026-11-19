const entry = "spar/devtools/entry"

export const sparDevtools = {
  name: "spar-devtools",
  apply: "serve",
  transformIndexHtml: () => [
    {
      tag: "script",
      attrs: { type: "module", src: `/@id/${entry}` },
      injectTo: "head-prepend",
    },
  ],
} as const
