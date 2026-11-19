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
    file: "route-missing-param.ts",
    rule: "Navigating to a route without the params its path needs",
    by: "types",
    expect: "Property 'id' is missing",
  },
  {
    file: "route-with-the-wrong-page.ts",
    rule: "Giving a route a page whose props are not that route's params",
    by: "types",
    expect: 'Route<{ readonly name: string; }, "/people/:name">\' is not assignable',
  },
  {
    file: "route-params-without-a-schema.ts",
    rule: "Declaring a route whose path has params without a Schema for them",
    by: "types",
    expect: "is not assignable to parameter of type 'never'",
  },
  {
    file: "route-under-missing-a-parent-param.ts",
    rule: "Declaring a route under another without the params of the whole path",
    by: "types",
    expect: 'PathParams<"/teams/:team/members/:member">',
  },
  {
    file: "route-under-a-closed-route.ts",
    rule: "Declaring a route under one that does not end with /*",
    by: "types",
    expect: "the parent route must end with /* to have routes under it",
  },
  {
    file: "reducer-without-a-state-type.ts",
    rule: "Writing a store action's reducer without a type on its state parameter",
    by: "types",
    expect: "SPAR_REDUCER_STATE_UNTYPED",
  },
  {
    file: "route-schema-missing-a-path-param.ts",
    rule: "Giving a route a Schema that lacks a param its path names",
    by: "types",
    expect: 'PathParams<"/threads/:id">',
  },
  {
    file: "mount-missing-layer.ts",
    rule: "Mounting without a layer the tree needs",
    by: "types",
    expect: "Layer<NoInfer<CounterStore>",
  },
  {
    file: "modal-outside-a-portal.ts",
    rule: "Giving a component modal behaviour without mounting it in a portal",
    by: "types",
    expect: "Layer<NoInfer<OverlayLayer>",
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
    rule: "Recovering an error by a tag name instead of its Schema",
    by: "types",
    expect: "Argument of type 'string' is not assignable to parameter of type 'Codec<",
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
    file: "service-leaked-into-a-view.ts",
    rule: "Handing a view a prop it does not take (here, a whole store)",
    by: "types",
    expect: '"props the view does not take": "store"',
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
    expect: "Reactive<number>' is not assignable to parameter of type 'number'",
  },
  {
    file: "view-without-a-schema.tsx",
    rule: "Writing a view as a plain function, with no Schema for its props",
    by: "build",
    expect: "views-need-a-schema",
  },
  {
    file: "component-props-without-a-schema.ts",
    rule: "Giving a component outer props without a Schema for them",
    by: "types",
    expect: "is not assignable to parameter of type '() => Effect<",
  },
  {
    file: "component-from-a-plain-function.ts",
    rule: "Making a component from a function that is not a view with a props Schema",
    by: "types",
    expect: "Declared",
  },
  {
    file: "backend-error-unhandled.ts",
    rule: "Mounting a component that calls the backend without handling the failure its contract names",
    by: "types",
    expect: "Component<unknown, ThreadGone,",
  },
  {
    file: "store-without-a-state-schema.ts",
    rule: "Declaring a store whose state has no Schema",
    by: "types",
    expect: "Property 'state' is missing",
  },
  {
    file: "selector-without-a-schema.ts",
    rule: "Declaring a selector whose output has no Schema",
    by: "types",
    expect: "is not assignable to type 'Selector<",
  },
  {
    file: "ui-state-without-a-schema.ts",
    rule: "Declaring UI state without a Schema",
    by: "types",
    expect: "Expected 3 arguments, but got 2",
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
