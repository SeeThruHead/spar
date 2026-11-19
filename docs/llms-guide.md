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

## The shape of an app

```
src/
  api.ts            the RPC contract shared with the backend: groups, payloads, errors
  routes.ts         Router.route(path, Schema) values
  SomeStore.ts      Store.Tag: state Schema, actions, selectors
  Some.ts           components: an Effect that makes the props of a view
  SomeView.tsx      views: View.make(name, props Schema, draw). JSX lives only here
  main.ts           App.mount with the layers
  server/           what runs on the server, or stands in for it
server/             the backend's handlers
```

A component is always two things: a view (`.tsx`, pure, draws props) and an Effect (`.ts`, makes
those props from stores, UI state, routes and services). `View.connect(effect)(view)` joins them.
The view never runs an Effect and the Effect never writes markup.

## The one way to do each thing

| You want to                               | Do this                                                                                | Not this                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Draw something                            | `View.make(name, { prop: Schema }, (props) => <jsx />)` in a `.tsx` file               | A plain function returning JSX                         |
| Give a view its props                     | `View.connect(() => Effect)` or `View.taking(outerProps, (outer) => Effect)`           | Passing services into a view                           |
| Hold state only the screen cares about    | `UiState.make(name, Schema, initial)` in the component's Effect                        | `Ref`, `SubscriptionRef`, `let`, a module variable     |
| Hold data the app cares about             | A `Store.Tag` with actions and selectors                                               | UI state seeded from a store, a service with a Ref     |
| Put a store where one component uses it   | `SomeStore.with(Component)`, then mount the result                                     | Wiring a layer at the root for a store one screen owns |
| Share a store across the app              | `SomeStore.layer()` in the layers given to `App.mount`                                 | A global                                               |
| Change app state                          | `store.commands.<action>(payload)`                                                     | Writing to state anywhere else                         |
| Change UI state                           | `UiState.set` or `UiState.update` in a handler                                         | Writing UI state from a command, a stream or a service |
| Read state in a view                      | A `Props.Reactive(Schema)` prop fed from `store.select.<name>` or the UI state itself  | Reading a store inside a view                          |
| Show a list                               | `Reactive.mapBy(key, RowView, props)` in the Effect, passed as a `Props.Element`       | `.map` inside JSX                                      |
| Show one thing or another                 | `Reactive.when` in the Effect, or `View.branch`                                        | A ternary inside JSX                                   |
| Mount a child that needs services         | `yield* View.child(Child, props)` in the Effect, passed as a `Props.Element`           | Writing a connected component as a JSX tag             |
| Call your backend                         | `Backend.rpc(Group, url)` and call the client                                          | `fetch`, axios, tRPC, a hand-rolled client             |
| Call someone else's HTTP API              | An Effect `HttpClient` call, or an HttpApi client, with `Backend.layer` provided       | `fetch`, `FetchHttpClient.layer`                       |
| Send something that must not be lost      | `Store.outbox(action, send)`: saved on the device, retried with an idempotency key     | Calling the server from a handler and hoping           |
| Do something after an action              | `Store.after(action, effect)`                                                          | An Effect inside a reducer                             |
| Handle a failure a component can have     | `View.recover(ErrorSchema, FallbackView)`                                              | `catchAll` that hides it; leaving it (compile error)   |
| Show something while a component loads    | `View.pending(LoadingView)`                                                            | A loading flag in UI state                             |
| Navigate                                  | `Router.route(path, Schema)`, `router.link(route, params)`, `router.go(route, params)` | `location.href`, string paths                          |
| Build a form                              | `Form.make(Schema, initial)`, `form.field(name)`, `form.submit` or `form.submitThen`   | UI state for each input plus hand validation           |
| Listen to the window or document          | `Events.onWindow`, `Events.onDocument` in the Effect                                   | `addEventListener`                                     |
| Focus or measure an element               | `Handle.make`, passed as a `Props.Handle`                                              | `document.querySelector`                               |
| Open a dialog, menu, popover or tooltip   | The ones in `@spar/ui`, or `View.portal` with `Overlay`                                | A positioned div                                       |
| Note something that happened, for the log | `Timeline.note(kind, name, detail)`                                                    | `console.log`                                          |
| Test a store                              | Provide its layer and call commands in `it.effect`                                     | Mounting a page to test a reducer                      |
| Test a component                          | `spar/testing`: `Testing.mount`, then find and click by role                           | Reaching into nodes by class name                      |

## What is refused, and why

Compile errors (the proofs are the files in `apps/demo/forbidden`, each of which must fail to
compile):

- A component from a plain function, a view without a Schema for its props, UI state, a store, a
  selector or route params without a Schema. Everything declared has a Schema so the devtools and
  agents can read it as data.
- A component whose Effect needs a service nobody provided, or can fail with an error nobody
  recovers, mounted anyway. Needs and failures are settled at mount.
- A backend error from the shared contract that the component does not handle.
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
