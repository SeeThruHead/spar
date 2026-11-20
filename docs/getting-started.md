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
import { Store } from "spar"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

const initialState: State = { count: 0 }

export class CounterStore extends Store.Tag<CounterStore>()("demo/counter/CounterStore", {
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

## A view

A view is made with `View.make`: a name, a Schema for each prop, and a function from those props to
JSX, in a `.tsx` file. It cannot reach a service. Reactive values go straight into the markup; each
one updates the single text node or attribute it sits in. A plain function that returns JSX is
rejected by the build, because its props would have no Schema.

```tsx
import { Schema } from "effect"
import { Props, View } from "spar"

export const CounterView = View.make(
  "CounterView",
  {
    count: Props.Reactive(Schema.Finite),
    doubled: Props.Reactive(Schema.Finite),
    onIncrement: Props.Action,
    onReset: Props.Action,
  },
  ({ count, doubled, onIncrement, onReset }) => (
    <section aria-label="Counter">
      <h2>Counter</h2>
      <p>
        Count <output aria-label="Count">{count}</output>, doubled{" "}
        <output aria-label="Doubled">{doubled}</output>
      </p>
      <button onClick={onIncrement}>Add one</button>
      <button onClick={onReset}>Reset</button>
    </section>
  ),
)
```

`Props` has the Schemas for what is not plain data: `Props.Reactive(schema)`, `Props.State(schema)`,
`Props.Action`, `Props.Handler("keydown")`, `Props.Callback(schema)`, `Props.Element` and
`Props.Handle`, next to `Form.Field(schema)`, `Router.Link` and `Overlay.Placement`.

(`apps/demo/src/counter/CounterView.tsx`)

## A component

`View.connect` joins an Effect that makes the props to the view that shows them. The Effect runs
once, when the component mounts. A component that takes props from its parent names them with a
Schema too: `View.taking({ id: Schema.String }, ({ id }) => ...)(View)`.

```ts
import { Effect } from "effect"
import { View } from "spar"
import { CounterStore } from "./CounterStore.ts"
import { CounterView } from "./CounterView.tsx"

export const Counter = View.connect(
  Effect.fnUntraced(function* () {
    const store = yield* CounterStore

    return {
      count: store.select.count,
      doubled: store.select.doubled,
      onIncrement: store.commands.incremented({ by: 1 }),
      onReset: store.commands.reset(),
    }
  }),
)(CounterView)
```

(`apps/demo/src/counter/Counter.ts`)

`Counter` has the type `Component<unknown, never, CounterStore>`: it takes no props, cannot fail,
and needs the counter store.

## Mount it

```ts
import { Effect } from "effect"
import { App } from "spar"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Counter, {
    target,
    layer: CounterStore.layer(),
  })
})

Effect.runFork(program)
```

A store's layer needs nothing from you: it brings its own source of ids. Leave the layer out and
it does not compile. `App.mount` only accepts a component with no errors
left and a layer that provides everything the tree needs.

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
  }).pipe(Effect.provide(CounterStore.layer())),
)
```

Pure views are rendered with plain props: `Testing.render(CounterView, { ... })`.

## Where to go next

- [Principles](principles.md) for the rules and what each one rules out.
- [API](api.md) for lists, conditionals, UI state, forms, routing, overlays and the outbox.
- `apps/sidebar` for a whole app.
