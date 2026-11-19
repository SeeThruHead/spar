import * as Diagnostics from "../packages/spar/src/Diagnostics.ts"
import { codeOf, guides } from "../packages/lint/house-rules.ts"

const root = new URL("..", import.meta.url).pathname

const reportedBy: Readonly<Record<Diagnostics.Kind, string>> = {
  build: "The build (the Vite or Bun plugin), with the file, line and column.",
  run: "The running app: an error's message, or an entry in the log.",
  refusal:
    "A store, as the reason a command was refused. It is in the log and on the command's span.",
  types: "The TypeScript compiler, in the text of a type error.",
  tools: "The agents' server, as the reason a tool call failed.",
}

const spar = Object.entries(Diagnostics.all).map(([code, found]) => ({
  code,
  kind: found.kind,
  what: found.what,
  fix: found.fix,
  reportedBy: reportedBy[found.kind],
}))

const house = Object.entries(guides).map(([name, found]) => ({
  code: codeOf(name),
  kind: "lint",
  what: found.what,
  fix: found.fix,
  reportedBy: `The linter, as house(${name}), with the file and line.`,
}))

const all = [...spar, ...house]

const section = (found: (typeof all)[number]): string =>
  [
    `### ${found.code}`,
    "",
    found.what,
    "",
    `Fix: ${found.fix}`,
    "",
    `Reported by: ${found.reportedBy}`,
  ].join("\n")

const page = `# Diagnostics

Every error, refusal and lint finding Spar reports has a code that does not change. A report is
the code and what happened, where it happened when that is known, the fix, and a pointer to its
section here:

\`\`\`
[SPAR_WAIT_IN_COMPONENT] A component's Effect does not wait. Whatever it waits for holds back every component below it, and their queries start late: a waterfall.
  at src/AgentPage.ts:41:23
  fix: Declare the data with a Query and ask for it (yield* TheQuery.ask(input)); the handle is there at once and the view shows its status.
  see: LLMS.md, section "SPAR_WAIT_IN_COMPONENT"
\`\`\`

The same list is in \`packages/spar/diagnostics.json\` for tools.

${all.map(section).join("\n\n")}
`

const json = `${JSON.stringify(all, null, 2)}\n`

const files: ReadonlyArray<readonly [string, string]> = [
  ["docs/diagnostics.md", page],
  ["packages/spar/diagnostics.json", json],
]

if (Bun.argv.includes("--check")) {
  const stale = (
    await Promise.all(
      files.map(async ([path, text]) =>
        (await Bun.file(`${root}${path}`)
          .text()
          .catch(() => "")) === text
          ? []
          : [path],
      ),
    )
  ).flat()

  if (stale.length > 0) {
    console.error(`Out of date: ${stale.join(", ")}. Run \`bun run diagnostics\`.`)
    process.exit(1)
  }

  console.log("The diagnostics page and list are up to date")
  process.exit(0)
}

await Promise.all(files.map(([path, text]) => Bun.write(`${root}${path}`, text)))
console.log(`Wrote ${all.length} diagnostics`)
