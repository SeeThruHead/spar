## A component is enhancers, then a view

Enhancers make a component's props; the view comes last and only draws. An enhancer is a plain
function from the props so far to an Effect. What the enhancers need and how they can fail are in
the component's type, all the way up the tree.

```tsx
export const Counter = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    onAdd: store.commands.added(),
  })),
)((props) => <button onClick={props.onAdd}>Count is {props.count}</button>)
```

**What it removes.** A missing provider and an unhandled failure. `App.mount` only accepts a
component with no errors left and a layer that provides everything the tree needs, so both are
compile errors and neither can reach a user.

## Server data is declared, not fetched

A component says which data it needs by asking a query. It never fetches. Queries asked for in the
same render start together, and one request runs for each input however many components ask.

```tsx
const userOf = (props: { readonly params: Reactive<Params> }) =>
  Reactive.map(props.params, (now) => now.user)

const ReportPage = compose(
  withProps({ params: Props.Reactive(Params) }),
  withQuery("profile", ProfileQuery, userOf),
  withQuery("orders", OrdersQuery, userOf),
  withQuery("suggestions", SuggestionsQuery, (props) =>
    Reactive.map(props.profile.value, (found) => Option.fromNullishOr(found?.taste)),
  ),
)((props) => (
  <section>
    <h1>{nameOf(props.profile)}</h1>
    <p>{countOf(props.orders)} orders</p>
    <p>{listOf(props.suggestions)}</p>
  </section>
))
```

The third query waits for the first only because its input is made from the first one's value.
That dependency is written down, so the trace viewer can draw it and name what waited for what.

[[demo:loads]]

**What it removes.** Accidental request waterfalls, the same request made by every row of a list,
and an old answer landing over a newer one: an answer carries the number of the request it answers
and a late one is ignored.

## A store is an Effect over one state

All app state lives in one place, and changes only through named commands. A store is a schema,
pure actions and selectors over its part of that state. What takes time is a plain Effect: the
reset below is one fiber, so pressing Reset again while it runs does nothing.

```ts
const reset = Effect.gen(function* () {
  yield* store.commands.resetClicked()
  yield* Effect.sleep("2 seconds")
  yield* store.commands.resetCompleted()
})

FiberHandle.run(running, reset, { onlyIfMissing: true })
```

[[demo:store]]

**What it removes.** State that was changed from somewhere nobody can find, and work that runs
twice because two events arrived in an order the author did not think of. Every command is in the
log and the trace, with what it carried.

## Everything that happens is logged and traced

Every command, every write to UI state, every route change and every request is an entry in one
log, in one order, with the trace it belongs to. A press of a button is the root of a trace that
runs through the store, the request, the backend and the redraw.

**What it removes.** Guessing. The devtools show the log, let you step back through it and fork
from a moment in the past, and draw each trace as a waterfall across the page and the backend. An
agent reads the same data from the command line or over MCP.

## Mistakes are reported with a code, a place and a fix

Where the types can refuse a mistake, it does not compile. Where a build rule can, the build stops
and names the file and line. What can only be seen while the app runs is reported then, in one
format: a code, what happened, the component and file it happened in, and what to do instead.

```text
[SPAR_DUPLICATE_CALL] The same request was made again while an identical one was still on its way.
  in: Dashboard > StockRow
  at: src/StockRow.tsx:12:3
  fix: Load it once with a Query and let each component that needs it ask for it.
```

**What it removes.** Errors an agent cannot act on. Every code has an entry in the
[error reference](/docs/diagnostics).

## Nothing the user did is lost

What must reach the server goes through an outbox: it is saved on the device first and sent with
an idempotency key until the server confirms it. A form's values are UI state, so they are in the
log and can be stepped back to like anything else.

**What it removes.** Work that vanished because a request failed, a tab closed or the network
dropped at the wrong moment.

## One application, front to back

The page and the backend share one typed contract over Effect RPC, one trace and one way to
declare data. The same components render on a server and are picked up in the browser without
being drawn again. This site is built that way: it is a Spar app, rendered on the server, and its
search box is a query.

Read on in [Getting started](/docs/getting-started), or see how Spar sits beside
[React](/docs/from-react), [Foldkit](/docs/from-foldkit) and [Solid 2.0](/docs/beside-solid-2).
