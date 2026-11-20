export type Entry = { readonly slug: string; readonly title: string }

export type Group = { readonly title: string; readonly entries: ReadonlyArray<Entry> }

export const groups: ReadonlyArray<Group> = [
  {
    title: "Start",
    entries: [
      { slug: "getting-started", title: "Getting started" },
      { slug: "principles", title: "Principles" },
    ],
  },
  {
    title: "Guides",
    entries: [
      { slug: "routing-and-data", title: "Routes, data and no waterfalls" },
      { slug: "state-and-server-data", title: "State and server data" },
      { slug: "navigation", title: "Navigation" },
      { slug: "recipes", title: "Recipes" },
    ],
  },
  {
    title: "Reference",
    entries: [
      { slug: "api", title: "API" },
      { slug: "diagnostics", title: "Error codes" },
      { slug: "llms-guide", title: "For agents" },
    ],
  },
  {
    title: "Beside others",
    entries: [
      { slug: "from-react", title: "Coming from React" },
      { slug: "from-foldkit", title: "Coming from Foldkit" },
      { slug: "beside-elm-architecture", title: "Beside the Elm architecture" },
      { slug: "beside-solid-2", title: "Beside Solid 2.0" },
      { slug: "beside-treflex", title: "Beside Treflex" },
      { slug: "devtools-compared", title: "Devtools compared" },
      { slug: "benchmarks", title: "Benchmarks" },
    ],
  },
  { title: "Status", entries: [{ slug: "gaps", title: "What is not done" }] },
]

export const entries: ReadonlyArray<Entry> = groups.flatMap((group) => group.entries)
