# Spar, for agents

This file is everything an agent needs to write a Spar app. It is put together by
`bun run llms` from this guide, the principles, the API reference, the recipes and the source of
the showcase app, so the examples are code that is built and tested, not sketches. When this file
and the code disagree, the code is right and this file is stale: run `bun run llms`.

## What Spar is

Spar is a UI framework for people who are all in on Effect. It is not general purpose and does
not try to be. A Spar app is an Effect program front to back: components are Effects, state lives
in Schema-described stores, the backend is an Effect RPC group, and one trace follows a click
from the page through the backend and back. The framework sees every state change and every
backend call, logs each one, and shows them in devtools that people use in the page and agents
use over MCP or from a shell.

If a thing can be done two ways, Spar picks one and refuses the other, at compile time or at
build time. Do not look for the escape hatch. There is not meant to be one.

## Read this first

"Routes, data and no waterfalls", the part right after this guide, is the one way to load data:
declare a query, ask for it in the component that needs it, pass values down as reactive props.
Never fetch in a component's Effect and never wait there.

## The shape of an app

```
src/
  api.ts            the RPC contract shared with the backend: groups, payloads, errors
  routes.ts         Router.route(path, Schema) values
  SomeStore.ts      Store.Tag: state Schema, actions, selectors
  Some.tsx          components: compose(...enhancers)((props) => <jsx />)
  main.ts           App.mount with the layers
  server/           what runs on the server, or stands in for it
server/             the backend's handlers
```

A component is one expression: `compose(...enhancers)((props) => <jsx />)`. The enhancers add
props (a store's values and commands, UI state, a query, a key press); the view comes last,
inline, and its props are inferred from them. The view never runs an Effect; an enhancer never
writes markup. Child components are written in JSX inside the view. Your own behaviour, written
inside `compose`, is `withEffectProps((props) => effect)` for props made by an Effect or
`withHandlers((props) => values)` for plain values. Written as a named function, give its
parameter a type: `const withDraft = (props: { readonly id: string }) => Effect.succeed({ ... })`.
A group of enhancers is `compose(...)` without a view. `compose` takes up to 10 enhancers; group
some with `compose(...)` beyond that.

If TypeScript says `'props' is of type 'unknown'` or that a property you added does not exist,
an untyped inline function among the enhancers is the cause (the build says so too, with
`SPAR_ENHANCER_UNTYPED`): wrap it in `withEffectProps` or `withHandlers`.

Three other errors to avoid:

- `For` and `Show` are imported from `"spar"` like everything else.
- In a `.tsx` file a generic arrow is read as a JSX tag: write `<A,>(item: A) => ...` with the
  comma, or use a `function`.
- `exactOptionalPropertyTypes` is on: never pass `undefined` to an optional prop or attribute.
  Leave it out (`{...(title === undefined ? {} : { title })}`) or give a value (`title ?? ""`).

`For` reads its item type from `each`. When `each` is an inline expression such as
`Reactive.map(props.rows, (all) => all.filter(...))`, TypeScript cannot infer it; compute the list
in an enhancer and pass `props.shown` instead.

## The one way to do each thing

| You want to                               | Do this                                                                                                                                 | Not this                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Make a component                          | `compose(...enhancers)((props) => <jsx />)` in a `.tsx` file                                                                            | A plain function returning JSX                                                                                 |
| Take props from the parent                | `withProps({ name: Schema })` as the first enhancer                                                                                     | Untyped props                                                                                                  |
| Make props with an Effect                 | `withEffectProps(Effect.fnUntraced(function* (props) { ... return { ... } }))`                                                          | `(props) => Effect.gen(...)` written inline among enhancers: every enhancer after it sees `props` as `unknown` |
| Read a store                              | `withStore(Store, (store) => ({ count: store.select.count, onAdd: store.commands.added() }))`                                           | Reading a store inside the view                                                                                |
| Hold state only the screen cares about    | `withUiState(name, Schema, initial)`                                                                                                    | `Ref`, `SubscriptionRef`, `let`, a module variable                                                             |
| Add a behaviour of your own               | A named function with a typed parameter, `(props: { readonly id: string }) => Effect.succeed({ ... })`, or `compose(a, b)` with no view | Copying the same enhancers into every component; an untyped inline function among enhancers                    |
| Use a child component                     | Write it in JSX in the view: `<Dropdown label="Sort" onPick={pick} />`                                                                  | Passing elements down as props                                                                                 |
| Hold data the app cares about             | A `Store.Tag` with actions and selectors                                                                                                | UI state seeded from a store, a service with a Ref                                                             |
| Put a store where one component uses it   | `SomeStore.with(Component)`, then mount the result                                                                                      | Wiring a layer at the root for a store one screen owns                                                         |
| Share a store across the app              | `SomeStore.layer()` in the layers given to `App.mount`                                                                                  | A global                                                                                                       |
| Change app state                          | `store.commands.<action>(payload)`                                                                                                      | Writing to state anywhere else                                                                                 |
| Change UI state                           | `UiState.set` or `UiState.update` in a handler                                                                                          | Writing UI state from a command, a stream or a service                                                         |
| Show a list                               | `<For each={props.items} by={(item) => item.id}>{(item) => <li>...</li>}</For>`                                                         | `.map` inside JSX                                                                                              |
| Show a tree (a component inside itself)   | `const Row: View.Component<Props> = compose(...)(... <Row node={child} /> ...)`, a `Schema.suspend` Schema                              | Flattening the tree by hand; leaving the type off                                                              |
| Show one thing or another                 | `<Show when={props.open}>...</Show>`                                                                                                    | A ternary inside JSX                                                                                           |
| Load data from the server                 | A `Query.Tag`, and `withQuery(name, TheQuery, (props) => input)` where it is needed                                                     | Fetching in a component and passing the result down                                                            |
| Use loaded data in an action              | Read the query store in the action's `Store.after` effect, then `send` the result                                                       | Props or arguments that carry server data                                                                      |
| Stop a command that is wrong right now    | A guard as the third argument of `Store.action`, returning the reason                                                                   | Disabling the button and hoping nothing else sends it                                                          |
| Run a flow with a wait in it              | A state field, an action that starts it, `Store.after` that waits and `send`s the finish                                                | A lock, a queue, a flag in UI state                                                                            |
| Call your backend                         | `Backend.rpc(Group, url)` and call the client                                                                                           | `fetch`, axios, tRPC, a hand-rolled client                                                                     |
| Call someone else's HTTP API              | An Effect `HttpClient` call, or an HttpApi client, with `Backend.layer` provided                                                        | `fetch`, `FetchHttpClient.layer`                                                                               |
| Send something that must not be lost      | `Store.outbox(action, send)`: saved on the device, retried with an idempotency key                                                      | Calling the server from a handler and hoping                                                                   |
| Do something after an action              | `Store.after(action, effect)`                                                                                                           | An Effect inside a reducer                                                                                     |
| Handle a failure a component can have     | `View.recover(ErrorSchema, FallbackView)`                                                                                               | `catchAll` that hides it; leaving it (compile error)                                                           |
| Show something while a component loads    | `View.pending(LoadingView)`                                                                                                             | A loading flag in UI state                                                                                     |
| Navigate                                  | `Router.route(path, Schema)`, `router.link(route, params)`, `router.go(route, params)`                                                  | `location.href`, string paths                                                                                  |
| Build a form                              | `Form.make(Schema, initial)`, `form.field(name)`, `form.submit` or `form.submitThen`                                                    | UI state for each input plus hand validation                                                                   |
| React to a key press                      | `withKey("Escape", (props) => UiState.set(props.open, false))`                                                                          | `addEventListener`                                                                                             |
| Run something while mounted               | `withEffect((props) => effect)`; `Events.onWindow` / `onDocument` inside it                                                             | A module-level listener                                                                                        |
| Focus or measure an element               | `Handle.make`, passed as a `Props.Handle`                                                                                               | `document.querySelector`                                                                                       |
| Open a dialog, menu, popover or tooltip   | The ones in `@spar/ui`, or `View.portal` with `Overlay`                                                                                 | A positioned div                                                                                               |
| Note something that happened, for the log | `Timeline.note(kind, name, detail)`                                                                                                     | `console.log`                                                                                                  |
| Test a store                              | Provide its layer and call commands in `it.effect`                                                                                      | Mounting a page to test a reducer                                                                              |
| Test a component                          | `spar/testing`: `Testing.mount`, then find and click by role                                                                            | Reaching into nodes by class name                                                                              |

## What is refused, and why

Compile errors (the proofs are the files in `apps/demo/forbidden`, each of which must fail to
compile):

- A component from a plain function, a view without a Schema for its props, UI state, a store, a
  selector or route params without a Schema. Everything declared has a Schema so the devtools and
  agents can read it as data.
- A component whose Effect needs a service nobody provided, or can fail with an error nobody
  recovers, mounted anyway. Needs and failures are settled at mount.
- A backend error from the shared contract that the component does not handle.
- A reducer returning an object literal with a literal-typed field needs its return type written
  (`(state: State): State => ...`), or TypeScript widens the literal and the action is rejected.
- UI state made in a service, written from a command, a stream or a service listener, or seeded
  from a store. UI state belongs to one component and changes only in its handlers.
- A connected component written as a JSX tag, a service passed into a view, a modal outside a
  portal, `View.pending` placed before `View.recover`, a route mounted with the wrong page.

Build errors (the Vite plugin stops the build and names the file, line and rule):

- `views-need-a-schema`: JSX outside `View.make`.
- `jsx-only-in-views`: JSX inside an expression or a call, such as `.map` or a ternary in a hole.
- `no-effect-run-in-views`: `Effect.run*` in a view file.
- `state-only-through-spar`: `Ref.make`, `SubscriptionRef.make`, `SynchronizedRef.make`,
  `MutableRef.make`, `TxRef.make`, `let`, `var`. State the framework did not make is state the
  log cannot show and the devtools cannot rewind.
- `backend-only-through-spar`: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
  `sendBeacon`, `FetchHttpClient.layer`, and imports of axios, ky, got, superagent,
  graphql-request, openapi-fetch, `@trpc/client`, `@apollo/client`, socket.io-client. A call the
  framework did not make is a call missing from the trace.

The two `-through-spar` rules look at app source. They skip `node_modules`, tests, config files,
`scripts/` and any `server/` folder (server code is not page state).

House rules the linter holds everywhere: no loops, no mutation, no comments, no casts, `type`
not `interface`, no nested ifs.

## UI state and app state

UI state is what one component remembers about its own screen: a menu is open, what was typed,
which tab is showing. It is made with `UiState.make` in that component's Effect, lives in one tree
by component path, and goes away when the component unmounts. Nothing else can write it.

App state is what the app knows: the agents, the notes, the cart. It lives in a store. A store is
a Schema for the state, named actions with pure reducers, and named selectors. It changes only
through `store.commands.<action>(payload)`, and every command is an entry in the store's log.

A store does not have to be declared at the root. `SomeStore.with(Component)` makes one unit of a
store and the component that uses it. Mount that unit twice and there are two stores, each with
its own state, each registered in the same root registry the devtools read. So it is still model,
view, update: one registry, one log, every change an action. It only does not look like it,
because the store and its view sit in the same file.

## Flows, refusals and server data

Read the "State, events that interleave, and server data" part below before writing any store
with async work. The short version:

- A store is plain unless some commands are wrong in some states. Then give it a state field and
  give those actions a guard. A refused command is visible in the log, the trace and
  `store.refused`. Never guard only in the view.
- Async work is always three steps in a store: a command records the intent, a `Store.after`
  effect does the work, and it `send`s a command with the result.
- Server data is a `Query.Tag`. Views never fetch and props never carry server data: an action
  that needs it reads the query store itself.
- There is no way to make a command wait for another to finish, on purpose.
- When only the newest answer matters (a search box, a filter), use `Store.afterLatest` instead of
  `Store.after`, or a Query. With `Store.after` an older answer can land last.
- When a second press must not start the work again (Pay, Save, Send), use `Store.afterLeading`:
  the store refuses the repeat while the first run lasts, and says why.
- To change one row of a long list in a reducer, return `Store.withRow(state.rows, index, row)`:
  the list rewrites that row only.
- A query's `value` is null while a new input loads. To keep the last rows on screen while the
  next page or filter loads, show the handle's `latest`; for "load more", use `TheQuery.pages`.
- A query with no input is asked for with no argument, `yield* TheQuery.ask()`. Giving it an
  input, such as one made from another query's value, does not compile (`SPAR_NEEDLESS_WAIT`).
- A draft the user is typing is never overwritten with a saved or loaded value. Keep both.
- Spar reports four timing mistakes while the app runs (`SPAR_DUPLICATE_CALL`,
  `SPAR_OLDER_ANSWER`, `SPAR_SENT_AGAIN`, `SPAR_TYPING_REPLACED`). After a
  change, run the app and read the log for `noticed` and `waited` entries; each names its fix.
- A store's layer needs no `SecureRandom` from you. A UI write (`UiState.set`, `update`) can be
  yielded inside `Effect.gen`. Give every reducer its state type: `(state: State, payload) => ...`.
- A form field's problem is shown by `TextField`, `Select` and `Checkbox` with the role `alert`.

## The backend

Declare the contract once, in a file both sides import:

```ts
export class Agents extends RpcGroup.make(
  Rpc.make("Start", {
    payload: { name: Schema.String, idempotencyKey: Schema.String },
    error: ServerUnreachable,
  }),
) {}
```

On the page, `Backend.rpc(Agents, url)` gives a typed client. Its calls are spans in the trace of
whatever caused them, the trace context travels to the backend in the request, and the backend's
spans join the same trace. Provide `Backend.layer` once, where the app is mounted.

## Devtools

`sparDevtools({ backends })` from `spar/devtools/vite` adds the tools on the dev server only. In
the page they give the inspector, the one log with rewind, step and fork, the trace waterfall
across page and backend, and the stores with their outbox. No collector has to run to see a
trace.

An agent gets the same over MCP (`bun run --filter @spar/devtools-mcp start`, then connect to
`http://127.0.0.1:4188/mcp`) or from a shell
(`bun run --filter @spar/devtools-mcp cli call <tool> '<json>'`). A useful loop when debugging:

1. `get_timeline` to see what happened, in order.
2. `step` with `by: -1` to walk back; each answer has the moment and the spans it caused.
3. `diff_states` to see what an action changed in a store.
4. `fork`, then `run_action` or `set_ui_state` to try something else from that point.
5. `switch_branch` with `branch: 0` to return to what really happened.

## Working in this repo

- `bun run showcase` starts the showcase app, its backend and the devtools.
- `bun run check` is everything that must pass: format, lint, types, tests with 100% coverage,
  the forbidden-code proofs, the production build check.
- `bun run bench` reruns the benchmarks and rewrites `docs/benchmarks.md` and
  `docs/benchmarks.html`.
- Browser suites are moon tasks: `bun run moon run sidebar:features sidebar:walkthrough
  sidebar:devtools sidebar:traced demo:browser stories:play ssr:browser --concurrency 1`.
- Only run tools through package scripts or moon tasks.
