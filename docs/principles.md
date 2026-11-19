# Principles

Each principle says what it is and what it rules out. Rules are enforced by types or by Spar's own
JSX build step, never by a lint rule, and each has a file under `apps/demo/forbidden` that must fail
to compile.

How one component is put together: its Effect runs once with the props it was given and the
services it asks for, and hands plain props to a pure view. After that, only reactive values
touch the page.

```mermaid
flowchart TB
  given[Props given] --> effect[Component Effect]
  services[Services] --> effect
  effect --> props[View props]
  props --> view[Pure view]
  view --> page[DOM nodes]
  values[Reactive values] -.-> page
```

## 1. Set up once, bind at the leaf

A view function runs one time and builds real DOM nodes. A reactive value placed in the markup is
bound to exactly one text node or attribute, and only that node is written when the value changes.
There is no virtual DOM and nothing re-renders. A store command updates the screen before it
returns.

Rules out: stale closures, dependency arrays, memoization, and every bug that comes from a
component function running again.

## 2. A component is a pure view plus one Effect that makes its props

`View.connect(() => Effect<Props, E, R>)(View)`, with the view last, or
`View.taking(fields, (outerProps) => Effect<Props, E, R>)(View)` when the parent gives it props. The
view is made with `View.make(name, fields, draw)`: a function from props to an element that cannot
reach a service. Both kinds of props are declared with a Schema for each one, and the build rejects a
view written as a plain function. The Effect is ordinary Effect code. It
runs once when the component mounts, in the component's own scope, and everything it started is
cancelled when the component unmounts. Every component keeps its pure view as `.view`, so a test or
a story can render it with sample props. `connect` rejects props the view does not take.

Rules out: hook ordering rules, effects that run again, leaked subscriptions and timers, views that
fetch, and services smuggled into a view.

## 3. Errors and layers are part of a component's type and are settled at mount

`Component<Props, E, R>` carries what can fail and what it needs, the same way an Effect does.
`App.mount` only accepts a component with no errors left and a layer that provides everything it
needs.

Rules out: a load failure nobody handles and a missing provider. Both are compile errors.

## 4. Children with needs are placed by the Effect, not by JSX

TypeScript gives every JSX expression the same type, so a connected component used as a tag would
silently lose its errors and layers. A connected component is therefore not a function and cannot be
a tag. The parent's Effect mounts it with `View.child`, `Reactive.mapBy`, `Reactive.when` or
`Router.outlet` and hands the view a finished element. Only pure views are JSX tags.

Rules out: requirements and errors that disappear somewhere in the middle of the tree.

## 5. Composition is plain functions

`recover`, `pending`, `crash`, `mapProps`, `branch` and `portal` each take a component and return a
component, combined with `pipe` or `flow`. `recover` removes the error it handles from the type.
`pending` only accepts a component with no errors left, because a placeholder would hide a failure
that arrives later. `portal` supplies the overlay layer that `Overlay.modal` needs, so modal
behaviour outside a portal does not compile.

Rules out: class components, a context API, lifecycle hooks and wrapper hierarchies.

## 6. UI state and app state are different types

`UiState.make(name, schema, initial)` only works inside a component's Effect. It can be read anywhere it is
passed, but it can only be changed by a `UiState.set` or `UiState.update` value, and the only thing
that runs those is a DOM event handler (including `Events.onDocument` and `Events.onWindow`, which
also only work inside a component). Its Schema describes the value for the devtools and for
restoring it; the state itself is a live handle, not data, so it cannot be a command payload. Form input
is UI state inside `Form`. App state lives in stores and nowhere else.

Rules out: local state kept in sync with a store, UI state created in a service, UI state sent to
the server or saved.

## 7. App state changes only through named commands, and every one is logged

A store is a Schema for its state, an initial state, pure actions `(state, payload) => state` with a
Schema for each payload, and named selectors with a Schema for what each gives. None of the three
can be declared without its Schema. Commands return an Effect. The state is always computed from the
encoded payload that went into the log, so replaying the log gives the same state. Every store can
show any earlier state (`travelTo`), which is what the devtools use.

Rules out: state changed from anywhere, actions that cannot be saved or replayed, and a log that
drifts from the state.

## 8. Nothing the user did is lost

A durable store writes each action to the device before the state changes and comes back after a
reload. Anything leaving the device goes through the outbox: saved first, sent in order with one
idempotency key, retried, held while offline, sent by one tab at a time, and set aside with its
reason if it can never be sent.

Rules out: effects inside reducers, a sent item that is lost on reload, a retry the server sees as a
second send, and two tabs sending the same thing.

## 9. Lists, conditionals and pages are functions over reactive values

`Reactive.mapBy(key, Component, toProps)` keeps one mounted row per key and moves, adds and removes
rows as the list changes. `Reactive.when(Component, props)` mounts a component while a condition
holds. `Router.outlet` mounts the page for the current URL. None takes a function that returns JSX,
and JSX cannot appear inside an expression in other JSX.

Rules out: unkeyed lists, rows rebuilt on every change, inline ternaries and maps in markup, render
props, and a route whose page does not take that route's params.

## 10. A part that breaks does not take the page with it

`View.crash(Fallback)` shows a fallback for a part whose Effect dies. An event handler, a reactive
binding or a background load that dies is reported to `App.CrashReporter` and the rest keeps
working.

Rules out: a blank page, and failures nobody hears about.

## 11. The compiler and the build enforce the rules

Every rule above is a type error, or a failure of the JSX build step for the two things types cannot
see (JSX inside an expression, and `Effect.run` in a view file). A rule that neither can check is
left out instead of being written down as a convention.

Rules out: rules that hold only while everyone remembers them.

## 12. One way to do each thing

The surface is these modules: View, Reactive, UiState, Store, Outbox, Events, Handle, Form, Router,
Overlay, Devtools, App, and `spar/testing`. Timers are Effect's schedules and websockets are
`effect/socket`; Spar adds no wrapper for what Effect already ships.

Rules out: two styles of the same app in one codebase.

## 13. Everything declared has a Schema

Nothing that is data can be declared with a TypeScript type alone. Each of these takes a Schema, and
the plain form does not compile or does not build:

- a view's props (`View.make(name, fields, draw)`; a function that just returns JSX is rejected by
  the build), and a component's outer props (`View.taking(fields, props)`);
- UI state (`UiState.make(name, schema, initial)`);
- a store's state, each command's payload and each selector's output;
- a route's params, whenever its path has any, and the Schema must name every one of them;
- an error a component recovers from (`View.recover(ErrorSchema, ErrorView)`).

What is not data has a Schema of its own kind, checked by what it is: reactive values and UI state
carry the Schema of their value, and actions, handlers, callbacks, elements, handles, links, form
fields and placements each have one. Reactive values themselves are plumbing between these points
and take no Schema of their own: wherever one is shown, kept or passed it crosses one of the
declarations above. DOM events are not data either; a handler prop names the event it takes.

The Schemas are what the devtools read: a component's props and UI state can be shown as plain
values, restored, and sent to an agent, without any of it being written twice.

Rules out: props, state and params that exist only as types, which nothing at run time can read,
check, show or restore.

## Where this differs from the first brief

- `recover` takes one tag at a time. Looking up a handler by tag in a record cannot be typed without
  a cast.
- There is no `selectKeys`. Key selectors are ordinary selectors.
- A reducer names its state type: `Store.action(Schema, (state: State, payload) => ...)`.
- Two things types cannot catch were dropped: seeding UI state from a one-off read of a store, and
  an aliased `Effect.run` in a view file.
- Refs are `Handle` values, not an enhancer, because the component's Effect has to hold the handle
  to act on it.
- A span per component is automatic (named after the view), so there is no `withSpan`.
- Two internal modules are allowed to mutate, each behind a pure-looking interface: `internal/dom.ts`
  (all DOM writes) and `internal/cell.ts` (the value cell under reactive values, added after the
  benchmark showed a stream and a fiber per binding cost 10 seconds for 10,000 rows). The reactive
  values in `internal/reactive.ts` are small classes for the same reason: one object per value
  instead of an object, two effects and three closures, which with one list of things to stop per
  row took 10,000 rows from 61 MB to 19 MB. The lint rule lets a constructor set its own fields
  and nothing else.
