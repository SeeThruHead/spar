import { check } from "spar/transform/check"

type Expectation = {
  readonly file: string
  readonly rule: string
  readonly by: "types" | "build"
  readonly expect: string
}

type Proof = Expectation & {
  readonly source: string
  readonly errors: ReadonlyArray<string>
  readonly holds: boolean
}

const root = new URL("..", import.meta.url).pathname

const expectations: ReadonlyArray<Expectation> = [
  {
    file: "mount-missing-layer.ts",
    rule: "Mounting without a layer the tree needs",
    by: "types",
    expect: "Layer<NoInfer<CounterStore>",
  },
  {
    file: "mount-unhandled-error.ts",
    rule: "Mounting a component whose error nobody recovers",
    by: "types",
    expect: "Component<unknown, ThreadLoadFailed, MailApi,",
  },
  {
    file: "pending-before-recover.ts",
    rule: "Showing a placeholder for a load whose failure is unhandled",
    by: "types",
    expect: "ThreadLoadFailed",
  },
  {
    file: "recover-wrong-tag.ts",
    rule: "Recovering a tag the handler's error does not have",
    by: "types",
    expect: '"ThreadLoadFaild"',
  },
  {
    file: "connected-component-in-jsx.tsx",
    rule: "Using a connected component as a JSX tag (it would lose its errors and layers)",
    by: "types",
    expect: "cannot be used as a JSX component",
  },
  {
    file: "handler-needs-a-service.tsx",
    rule: "A view reaching a service through an event handler",
    by: "types",
    expect: "CounterStore",
  },
  {
    file: "ui-state-in-command.ts",
    rule: "Passing UI state to a store command",
    by: "types",
    expect: "is not assignable to type 'string'",
  },
  {
    file: "ui-state-in-a-service.ts",
    rule: "Creating UI state outside a component (in a service)",
    by: "types",
    expect: "ViewScope",
  },
  {
    file: "ui-state-written-from-a-service-listener.ts",
    rule: "Changing UI state from a document listener that a service set up",
    by: "types",
    expect: "ViewScope",
  },
  {
    file: "ui-state-seeded-from-store.ts",
    rule: "Seeding UI state from a store selector",
    by: "types",
    expect: "Reactive<number>' is not assignable to parameter of type 'never'",
  },
  {
    file: "ui-state-written-from-a-stream.ts",
    rule: "Keeping UI state in sync with a store stream",
    by: "types",
    expect: "Type 'UiWrite' is missing",
  },
  {
    file: "boolean-child.tsx",
    rule: "Inline conditional text in a view",
    by: "types",
    expect: "is not assignable to type 'Children'",
  },
  {
    file: "jsx-map-in-hole.tsx",
    rule: "Mapping a list to JSX inside a view",
    by: "build",
    expect: "jsx-only-in-views",
  },
  {
    file: "jsx-ternary-in-hole.tsx",
    rule: "Choosing between JSX branches inside a view",
    by: "build",
    expect: "jsx-only-in-views",
  },
  {
    file: "jsx-inline-view-in-mapby.tsx",
    rule: "Passing mapBy a function that returns JSX",
    by: "build",
    expect: "jsx-only-in-views",
  },
  {
    file: "effect-run-in-view.tsx",
    rule: "Running an Effect from a view",
    by: "build",
    expect: "no-effect-run-in-views",
  },
]

const compilerOutput = async (): Promise<ReadonlyArray<string>> => {
  const child = Bun.spawn(["bun", "run", "typecheck:forbidden"], { cwd: root, stdout: "pipe" })
  const text = await new Response(child.stdout).text()

  return text.split("\n").filter((line) => line.includes("error TS"))
}

const typeErrors = (lines: ReadonlyArray<string>, file: string): ReadonlyArray<string> =>
  lines
    .filter((line) => line.startsWith(`forbidden/${file}(`))
    .map((line) => line.replace(" with 'exactOptionalPropertyTypes: true'.", "."))
    .map((line) =>
      line.replace(" Consider adding 'undefined' to the types of the target's properties.", ""),
    )

const buildErrors = (file: string, source: string): ReadonlyArray<string> =>
  check(`forbidden/${file}`, source).map(
    ({ line, column, rule, message }) =>
      `forbidden/${file}(${line},${column}): ${rule}: ${message}`,
  )

const prove = async (lines: ReadonlyArray<string>, expectation: Expectation): Promise<Proof> => {
  const source = await Bun.file(`${root}forbidden/${expectation.file}`).text()
  const errors =
    expectation.by === "types"
      ? typeErrors(lines, expectation.file)
      : buildErrors(expectation.file, source)

  return {
    ...expectation,
    source,
    errors,
    holds: errors.some((error) => error.includes(expectation.expect)),
  }
}

const lines = await compilerOutput()
const proofs = await Promise.all(expectations.map((expectation) => prove(lines, expectation)))
const broken = proofs.filter((proof) => !proof.holds)

await Bun.write(`${root}artifacts/proofs.json`, JSON.stringify(proofs, null, 2))

console.log(
  proofs.map((proof) => `${proof.holds ? "rejected" : "ACCEPTED"}  ${proof.file}`).join("\n"),
)

if (broken.length > 0) {
  console.error(`${broken.length} forbidden files were not rejected as expected`)
  process.exit(1)
}
