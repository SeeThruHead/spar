import { expanded } from "./includes.ts"

const root = new URL("..", import.meta.url).pathname

const read = async (path: string): Promise<string> =>
  expanded(await Bun.file(`${root}${path}`).text())

const deeper = (markdown: string): string => markdown.replace(/^(#+) /gm, "#$1 ")

const part = async (title: string, path: string): Promise<string> =>
  `# ${title}\n\n${deeper(await read(path)).replace(/^## .*\n+/, "")}`

const fence = (path: string): string => (path.endsWith(".tsx") ? "tsx" : "ts")

const source = async (path: string, about: string): Promise<string> =>
  `## ${path}\n\n${about}\n\n\`\`\`${fence(path)}\n${(await read(path)).trimEnd()}\n\`\`\``

const examples: ReadonlyArray<readonly [string, string]> = [
  [
    "apps/sidebar/src/api.ts",
    "The contract the page and the backend share: one RPC group, its payloads and its errors.",
  ],
  ["apps/sidebar/server/handlers.ts", "The backend's handlers for that contract."],
  [
    "apps/sidebar/src/server/Server.ts",
    "The page's side of the backend: a service whose remote layer is a `Backend.rpc` client, and an in-memory stand-in used when there is no backend.",
  ],
  ["apps/sidebar/src/routes.ts", "Routes are values with a Schema for their params."],
  [
    "apps/sidebar/src/BoardStore.ts",
    "An app-wide store: state Schema, actions, selectors, and an outbox for what must reach the server.",
  ],
  [
    "apps/sidebar/src/Notes.tsx",
    "A composed component with its own enhancer (`withDraft`) and a store declared beside it, shipped as one unit. It is mounted twice in the app and each place has its own notes.",
  ],
  [
    "apps/sidebar/src/ResetCounterStore.ts",
    "A store that is a state machine: Foldkit's counter with a delayed reset. Add 1 is refused while resetting, whoever sends it.",
  ],
  [
    "apps/sidebar/src/ResetCounter.tsx",
    "Its component, composed with `withStore`. The buttons are never disabled; the store decides.",
  ],
  [
    "apps/sidebar/src/People.ts",
    "Server data in a query store, a second store for the selection, and Export CSV as an Effect that reads the people from the query store itself.",
  ],
  ["apps/sidebar/src/PeoplePanel.tsx", "The people table, composed, its rows in a For."],
  [
    "apps/sidebar/test/people.test.ts",
    "Tests of the export: the file, what it says with nobody selected, one trace for the click and the result.",
  ],
  [
    "packages/spar/test/query.test.ts",
    "Tests of a query store: one request at a time, stale time, failure, late answers, invalidation.",
  ],
  [
    "apps/sidebar/src/Deep.ts",
    "A page five segments deep: each segment asks for its own data, and the author's query takes its input from the report's answer.",
  ],
  [
    "apps/sidebar/src/DeepPage.tsx",
    "Its components: each segment composed from small enhancers of its own, children written as JSX.",
  ],
  [
    "apps/sidebar/src/AgentPage.tsx",
    "A page: route params in, a failure recovered, a loading view, a child that calls the backend, and the notes unit, both written as JSX tags.",
  ],
  [
    "apps/sidebar/src/Shell.tsx",
    "The shell: the router's outlet and the second place the notes unit is mounted, every child a JSX tag.",
  ],
  [
    "apps/sidebar/src/main.ts",
    "The entry point: the layers, `Backend.layer`, telemetry, and `App.mount`.",
  ],
  [
    "apps/sidebar/vite.config.ts",
    "The build: the Spar check and the devtools plugin pointed at the backend.",
  ],
  [
    "apps/sidebar/test/trace.test.ts",
    "A test that one click is one trace through the page and the backend.",
  ],
  [
    "packages/spar/test/unit.test.ts",
    "Tests of a store beside its view: no layer at the root, one state for each place.",
  ],
]

const body = [
  await read("docs/llms-guide.md"),
  await part("Routes, data and no waterfalls", "docs/routing-and-data.md"),
  await part("Principles", "docs/principles.md"),
  await part("API reference", "docs/api.md"),
  await part("State, events that interleave, and server data", "docs/state-and-server-data.md"),
  await part("Getting started", "docs/getting-started.md"),
  await part("Recipes", "docs/recipes.md"),
  await part("Aggregates as stores", "docs/domain.md"),
  await part("Coming from React", "docs/from-react.md"),
  await part("Coming from Foldkit", "docs/from-foldkit.md"),
  await part("Spar beside an Elm-architecture framework", "docs/beside-elm-architecture.md"),
  await part("Spar beside Solid 2.0", "docs/beside-solid-2.md"),
  await part("Spar beside Treflex", "docs/beside-treflex.md"),
  await part("Diagnostics", "docs/diagnostics.md"),
  await part("What is not done", "docs/gaps.md"),
  `# Worked examples from the showcase\n\nEvery file below is in the repo as shown and is built, linted and tested by \`bun run check\`.\n\n${(
    await Promise.all(examples.map(([path, about]) => source(path, about)))
  ).join("\n\n")}`,
].join("\n\n")

const text = `${body.trimEnd()}\n`

if (Bun.argv.includes("--check")) {
  const current = await Bun.file(`${root}LLMS.md`)
    .text()
    .catch(() => "")

  if (current !== text) {
    console.error("LLMS.md is out of date. Run `bun run llms`.")
    process.exit(1)
  }

  console.log("LLMS.md is up to date")
  process.exit(0)
}

await Bun.write(`${root}LLMS.md`, text)
console.log(`Wrote LLMS.md (${text.split("\n").length} lines)`)
