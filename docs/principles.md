# Spar: principles

Spar is the working name for an Effect-native UI framework. Each principle says what it is and what it rules out.

## 1. Set up once, bind at the leaf

A view function runs one time and builds real DOM nodes. A reactive value placed in the markup is bound to exactly one text node or attribute, and only that node is written when the value changes. There is no virtual DOM and nothing re-renders.

Rules out: Stale closures, dependency arrays, memoization, and every bug that comes from a component function running again.

## 2. A component is a pure view plus one Effect that makes its props

View.connect((outerProps) => Effect<Props, E, R>)(View), with the view last as in Redux's connect. Every component keeps its pure view as .view, so a story can render it with sample props. The view is a plain function from props to an element and cannot reach a service. The Effect is ordinary Effect code (pipe or generators). It runs once when the component mounts, in the component's own scope, and everything it started is cancelled when the component unmounts.

Rules out: Hook ordering rules, effects that run again, leaked subscriptions and timers, and views that fetch.

## 3. Errors and layers are part of a component's type and are settled at mount

Component<Props, E, R> carries what can fail and what it needs, the same way an Effect does. App.mount only accepts a component with no errors left and a layer that provides everything it needs.

Rules out: A load failure nobody handles and a missing provider. Both are compile errors, not runtime surprises.

## 4. Children with needs are placed by the Effect, not by JSX

TypeScript gives every JSX expression the same type, so a connected component used as a tag would silently lose its errors and layers. A connected component is therefore not a function and cannot be a tag. The parent's Effect mounts it with View.child, Reactive.mapBy or Reactive.when and hands the view a finished element. Only pure views are JSX tags.

Rules out: Requirements and errors that disappear somewhere in the middle of the tree.

## 5. Composition is plain data-last functions

recover, pending, mapProps, branch and withSpan each take a component and return a component, and are combined with pipe. recover removes the error it handles from the type. pending only accepts a component with no errors left, because a placeholder would hide a failure that arrives later.

Rules out: Class components, a context API, lifecycle hooks and wrapper hierarchies.

## 6. UI state and app state are different types

UiState.make(initial) only works inside a component's Effect. It can be read anywhere it is passed, including child views, but it can only be changed by a UiState.set or UiState.update value, and the only thing that runs those is a DOM event handler. It has no Schema, so it cannot be a command payload. App state lives in stores and nowhere else.

Rules out: Local state kept in sync with a store, UI state created in a service, UI state sent to the server or persisted.

## 7. App state changes only through named commands, and every one is logged

A store is an initial state, pure actions (state, payload) => state with a Schema for each payload, and named selectors. Selectors are reactive values that emit only when their own result changes. Commands return an Effect. The state is always computed from the encoded payload that went into the log, so replaying the log gives the same state by construction.

Rules out: State changed from anywhere, actions that cannot be saved or replayed, and a log that drifts from the state.

## 8. Side effects sit beside the store, and anything leaving the device goes through the outbox

Store.after(action, effect) runs an Effect after an action. Store.outbox(action, send) saves the item on the device before the state changes, sends it with retries under one idempotency key, removes it only when the send succeeds, and picks up anything left over the next time the app starts.

Rules out: Effects inside reducers, a sent item that is lost on reload, and a retry that the server sees as a second send.

## 9. Lists and conditionals are functions over reactive values

Reactive.mapBy(key, Component, toProps) keeps one mounted row per key and moves, adds and removes rows as the list changes. Reactive.when(Component, props) mounts a component while a condition holds and closes its scope when it stops. Neither takes a function that returns JSX, and JSX cannot appear inside an expression in other JSX.

Rules out: Unkeyed lists, rows rebuilt on every change, inline ternaries and maps in markup, and render props.

## 10. The compiler and the build enforce the rules; nothing is a lint rule

Every rule above is a type error, or a failure of the framework's own JSX build step for the two things types cannot see (JSX inside an expression, and Effect.run in a view file). A rule that neither can check is left out instead of being written down as a convention.

Rules out: Rules that hold only while everyone remembers them.

## 11. One way to do each thing

The whole surface is six modules: View (connect, child, recover, pending, mapProps, branch, withSpan), Reactive (map, mapBy, when), UiState (make, set, update), Store (Tag, action, after, outbox, replay), Outbox and App.mount.

Rules out: Two styles of the same app in one codebase.

## Where this differs from the brief

- **recover takes one tag at a time.** The brief asked for recover({ Tag: Component }). Looking up a handler by tag in a record and calling it with the matching error cannot be typed without a cast, so it is recover("Tag", View), chained with pipe. The handled error still leaves the type, and a misspelled tag is a compile error.
- **No selectKeys.** Building one reactive value per state key with the right type per key also needs a cast. Key selectors are written as ordinary selectors (count: (state) => state.count), which keeps one way to define a selector.
- **A reducer has to name its state type.** Store.action(Schema, (state: State, payload) => ...). TypeScript does not carry the store's state type into the action's reducer from the surrounding object.
- **Two things types cannot catch were dropped.** Seeding UI state from a one-off read of a store (UiState.make(yield* selector.get)) looks like any other value. Running an Effect in a view is caught by name (Effect.run...), so an alias gets past the build step. Keeping UI state in sync with a store is not expressible at all.
- **One trusted boundary.** JSX props are checked by the JSX types, then stored as plain data. The renderer turns an event handler back into a typed action with two type guards in src/internal/action.ts. Those two guards are the only place the code trusts a type it did not check.
