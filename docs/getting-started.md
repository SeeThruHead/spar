# Getting started

Spar apps are Bun and Effect v4 projects. Every example below is taken from code in this repo that
is type-checked and tested in CI; the file is named under each one.

## Set up a project

In `tsconfig.json`, point JSX at Spar:

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "spar" } }
```

In `vite.config.ts`, add the build check and the same JSX setting:

```ts
import { sparJsx } from "spar/transform/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [sparJsx],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
})
```

(`apps/stories/vite.config.ts`. For `Bun.build` use `spar/transform/bun`, as `apps/demo/scripts/build.ts` does.)

## A store

App state lives in stores. A store is a Schema for its state, an initial state, pure actions
with a Schema for each payload, and named selectors with a Schema for what each gives.

```ts
import { Schema } from "effect"
import { Model, Store } from "spar"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

const initialState: State = { count: 0 }

export class CounterStore extends Model.Tag<CounterStore>()("demo/counter/CounterStore", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
    reset: Store.action(Schema.Void, (): State => initialState),
  },
  selectors: {
    count: Store.selector(Schema.Finite, (state: State) => state.count),
    doubled: Store.selector(Schema.Finite, (state: State) => state.count * 2),
  },
}) {}
```

(`apps/demo/src/counter/CounterStore.ts`)

## A component

A component is one expression: the behaviours it has, then its markup. `compose` takes
enhancers, each a small function that adds props: a store's values and commands, UI state, a
query, a key press. The last call is the view, written inline; its props are inferred from the
enhancers, with nothing declared twice.

```tsx
import { compose, withStore } from "spar"
import { CounterStore } from "./CounterStore.ts"

export const Counter = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    doubled: store.select.doubled,
    onIncrement: store.commands.incremented({ by: 1 }),
    onReset: store.commands.reset(),
  })),
)((props) => (
  <section aria-label="Counter">
    <h2>Counter</h2>
    <p>
      Count <output aria-label="Count">{props.count}</output>, doubled{" "}
      <output aria-label="Doubled">{props.doubled}</output>
    </p>
    <button onClick={props.onIncrement}>Add one</button>
    <button onClick={props.onReset}>Reset</button>
  </section>
))
```

(`apps/demo/src/counter/Counter.tsx`)

The enhancers and the view run once, when the component mounts. A reactive value in the markup
updates the one text node or attribute it sits in; nothing runs again. The component is named
`Counter` in the devtools and the trace, taken from its constant by the build.

A component that takes props from its parent names them with a Schema in `withProps`, and its
parent writes it in JSX like any element:

```tsx
export const Dropdown = compose(
  withProps({
    label: Schema.String,
    items: Schema.Array(Schema.String),
    onPick: Props.Callback(Schema.String),
  }),
  withUiState("open", Schema.Boolean, false),
)((props) => <div class="dropdown">...</div>)

export const Toolbar = compose(withUiState("sort", Schema.String, "Newest"))((props) => (
  <header>
    <Dropdown
      label="Sort by"
      items={["Newest", "Oldest"]}
      onPick={(item) => UiState.set(props.sort, item)}
    />
  </header>
))
```

(`packages/spar/test/composed.tsx`, which also has a query, `For`, `Show` and your own enhancer)

An enhancer is a plain function from the props so far to an Effect of what it adds, so your own is
one line: `(props: { readonly name: string }) => Effect.succeed({ initials: props.name.slice(0, 1) })`.
A group of enhancers is `compose(...)` without a view, and is used like any other.

## Mount it

```ts
import { Effect } from "effect"
import { App } from "spar"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Counter, {
    target,
    layer: CounterStore.layer,
  })
})

Effect.runFork(program)
```

A store's layer needs nothing from you: it brings its own source of ids. Leave the layer out and
it does not compile. `App.mount` only accepts a component with no errors left and a layer that
provides everything it needs. What a child written in JSX needs is not in its parent's type,
because TypeScript gives every JSX expression the same type, so the Vite plugin checks it when you
build: a child needing a service the mount's layer does not provide stops the build.

## Test it

```ts
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Testing from "spar/testing"

it.live("the counter counts", () =>
  Effect.gen(function* () {
    yield* Testing.mount(Counter)
    yield* Testing.click("button", "Add one")

    const count = yield* Testing.find("status", "Count")

    yield* Testing.eventually(() => expect(count.textContent).toBe("1"))
  }).pipe(Effect.provide(CounterStore.layer)),
)
```

## Where to go next

- [Principles](principles.md) for the rules and what each one rules out.
- [API](api.md) for lists, conditionals, UI state, forms, routing, overlays and the outbox.
- `apps/sidebar` for a whole app.
