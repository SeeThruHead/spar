# Getting started

Spar apps are Bun and Effect v4 projects. Every example below is copied from code in this repo when
the docs are built, and that code is type-checked and tested in CI; the file is named under each one.

## Set up a project

In `tsconfig.json`, point JSX at Spar: `"jsx": "react-jsx"` and `"jsxImportSource": "spar"` under
`compilerOptions` (this repo sets them once, in `tsconfig.base.json`).

In `vite.config.ts`, add the build check and the same JSX setting:

<<< apps/stories/vite.config.ts

For `Bun.build` use `spar/transform/bun`, as `apps/demo/scripts/build.ts` does.

## A store

App state lives in stores. A store is a Schema for its state, an initial state, pure actions
with a Schema for each payload, and named selectors with a Schema for what each gives.

<<< apps/demo/src/counter/CounterStore.ts

## A component

A component is one expression: the behaviours it has, then its markup. `compose` takes
enhancers, each a small function that adds props: a store's values and commands, UI state, a
query, a key press. The last call is the view, written inline; its props are inferred from the
enhancers, with nothing declared twice.

<<< apps/demo/src/counter/Counter.tsx

The enhancers and the view run once, when the component mounts. A reactive value in the markup
updates the one text node or attribute it sits in; nothing runs again. The component is named
`Counter` in the devtools and the trace, taken from its constant by the build.

A component that takes props from its parent names them with a Schema in `withProps`, and its
parent writes it in JSX like any element:

<<< packages/spar/test/composed.tsx#Dropdown

<<< packages/spar/test/composed.tsx#Toolbar

That file also has a query, `For`, `Show` and an enhancer of its own. An enhancer is a plain
function from the props so far to an Effect of what it adds, so your own is one line:
`(props: { readonly name: string }) => Effect.succeed({ initials: props.name.slice(0, 1) })`. A
group of enhancers is `compose(...)` without a view, and is used like any other.

## Mount it

<<< packages/spar/test/gettingStarted.test.tsx#program

Run it with `Effect.runFork(program)`. A store's layer needs nothing from you: `App.mount` provides
the one state its slot lives in. Leave the layer out and it does not compile. `App.mount` only
accepts a component with no errors left and a layer that provides everything it needs. What a child
written in JSX needs is not in its parent's type, because TypeScript gives every JSX expression the
same type, so the Vite plugin checks it when you build: a child needing a service the mount's layer
does not provide stops the build.

## Test it

<<< packages/spar/test/gettingStarted.test.tsx#theCounterCounts

`it.live("the counter counts", () => theCounterCounts)` runs it with `@effect/vitest`.

## Where to go next

- [Principles](principles.md) for the rules and what each one rules out.
- [API](api.md) for lists, conditionals, UI state, forms, routing, overlays and the outbox.
- `apps/sidebar` for a whole app.
