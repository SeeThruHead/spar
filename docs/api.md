# API

Everything is imported from `spar` unless a line says otherwise. Each section names a file in this
repo where the API is used and type-checked.

## Compose

A component is `compose(...enhancers)((props) => <jsx />)`: enhancers first, the view last and
inline. Each enhancer is a function from the props so far to an Effect of what it adds; the view's
props are inferred from them. Enhancers and the view run once, on mount.

| Function                                                  | What it adds                                                                                                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose(...enhancers)(view)`                             | A component. Called without the view, a group of enhancers that is itself an enhancer.                                                                                                                           |
| `withProps({ name: Schema })`                             | The props its parent passes in JSX, each with a Schema. A wrong prop in the parent's JSX is a compile error.                                                                                                     |
| `withStore(Store, (store) => props)`                      | Values and commands read from a store, or from any service with the same shape.                                                                                                                                  |
| `withUiState(name, Schema, initial)`                      | One piece of UI state, under `name`, kept in the UI tree and rewound with everything else.                                                                                                                       |
| `withQuery(name, Query, (props) => input)`                | A query's handle under `name`, asked with an input made from the props.                                                                                                                                          |
| `withHandlers((props) => handlers)`                       | Plain values or actions made from the props.                                                                                                                                                                     |
| `withEffectProps((props) => effect)`                      | The props an Effect makes from the props so far, for example `withEffectProps(Effect.fnUntraced(function* (props) { ... }))`. Use it rather than an untyped inline function.                                     |
| `withKey(key, (props) => action)`                         | Runs an action when a key is pressed, for as long as the component is mounted.                                                                                                                                   |
| `withEffect((props) => effect)`                           | Runs an Effect for as long as the component is mounted.                                                                                                                                                          |
| `<For each={list} by={key}>{(item, key) => <li />}</For>` | A keyed list. `each` is an array or a reactive one; `by` gives each row's key, a string or a number. `item` is a `Reactive` of the row, not the row: read a field with `Reactive.map(item, (row) => row.label)`. |
| `<Show when={reactiveBoolean}>...</Show>`                 | Shows its children while the value is true.                                                                                                                                                                      |
| `uses(["Service", ...])`                                  | Nothing to the props: tells the inspector which services the component uses. The dev plugin adds it for you; write it only without the plugin.                                                                   |

A child component is written in JSX inside the view: `<Dropdown label="Sort by" onPick={pick} />`.
It keeps its own UI state, and runs with the services of the component that draws it. What it
needs is not part of its parent's type, because TypeScript gives every JSX expression one type, so
the build checks it instead: a child that needs a service no layer given to `App.mount` provides
(and no store beside a component above it) stops the build with `SPAR_CHILD_NEEDS_A_SERVICE`.
The build names each component after the constant it is
given to. A named view can stand at the end instead of an inline one:
`compose(withHover)(CardView)`.

<<< packages/spar/test/composed.tsx#withHover

<<< packages/spar/test/composed.tsx#Card

### A component that draws itself

A folder tree: each row draws a row for each folder inside it, as a JSX tag inside its own view.
Write the component's type out (`View.Component<Props>`), because TypeScript cannot work out a
type that refers to itself. Each row has its own UI state, kept under its key, so closing a
folder and opening it again starts its children closed.

<<< packages/spar/test/folderTree.tsx#FolderRow

The Schema of a tree refers to itself too: `Schema.suspend` and a written-out type.

<<< packages/spar/test/folderTree.tsx#Folder

## View

What a component made with `compose` can be wrapped in. A view made with `View.make` can also be
the last thing given to `compose`, in place of an inline view; the component then keeps that view
as `.view` and the inspector shows its name.

| Function                               | What it does                                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View.make(name, fields, draw)`        | Makes a view: `fields` gives a Schema for each prop, `draw` turns the props into JSX.                                                                                                              |
| `View.child(component, props)`         | Mounts a child from an enhancer and gives back its element, for a child that can still fail.                                                                                                       |
| `View.recover(ErrorSchema, ErrorView)` | Handles one tagged error with a view and removes it from the type.                                                                                                                                 |
| `View.pending(PlaceholderView)`        | Shows a placeholder until the component's Effect finishes. Needs errors handled first.                                                                                                             |
| `View.SlowAfter`                       | How many milliseconds a component's Effect may take before it is reported as `SPAR_COMPONENT_WAITED` (16). Provide a larger number for slow devices, or `Infinity` in a test that is not about it. |
| `View.split(PlaceholderView, load)`    | A component whose code is imported when it is first shown; the placeholder takes the same props.                                                                                                   |
| `View.crash(FallbackView)`             | Shows a fallback if the component's Effect dies, and reports it.                                                                                                                                   |
| `View.mapProps(f)`                     | Changes the props a component takes.                                                                                                                                                               |
| `View.branch(test, Other)`             | Mounts `Other` instead when `test(props)` holds.                                                                                                                                                   |
| `View.portal`                          | Mounts the component in a layer above the app.                                                                                                                                                     |

<<< apps/sidebar/src/AgentPage.tsx#AgentPage

## Props

A view's props are declared as a record of Schemas. Plain data uses `Schema` as it is; what is
not data has a Schema of its own kind:

| Schema                                                           | A prop that is                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Props.Reactive(schema)`                                         | a reactive value of that type                                                                               |
| `Props.State(schema)`                                            | UI state the view may also set                                                                              |
| `Props.Action`                                                   | something to run from a handler: an Effect (which may return the action to run next), a UI write, or a list |
| `Props.Handler("keydown")`, `Props.Handler("input", "textarea")` | a handler for that event, on that element when named                                                        |
| `Props.Callback(schema)`                                         | a function from a value to an action                                                                        |
| `Props.Element`, `Props.Handle`                                  | an element to place, a handle to an element                                                                 |
| `Form.Field(schema)`, `Router.Link`, `Overlay.Placement`         | a form field, a link, where an overlay sits                                                                 |

For a type of your own, `Schema.declare(guard)` is a prop kind like any other. The inspector and
the MCP tools show each prop as plain JSON where its Schema can encode it.

## Markup

`Markup.trusted(html)` marks a string of HTML as safe to put on the page, and the `markup` attribute
puts it in an element: `<article markup={body} />`, where `body` is a `Markup` or a reactive one.
A view declares such a prop as `Markup.Markup`, or `Props.Reactive(Markup.Markup)`. The element
has no other children. It is drawn the same on the server, and hydrating keeps the nodes the
server sent. Use it for HTML you made yourself, such as rendered markdown; never for text a user
typed.

## Reactive

A `Reactive<A>` is a value that changes: `get` reads it and `changes` is a stream that starts with
the current value.

| Function                                                                                      | What it does                                                          |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Reactive.map(reactive, f)`                                                                   | A derived value.                                                      |
| `Reactive.zip(a, b)`                                                                          | Both values as a pair (an Effect, scoped to the component).           |
| `Reactive.mapBy(key, Component, toProps)`                                                     | A keyed list. `toProps(item, key)` gets each row's own reactive item. |
| `Reactive.when(Component, props)`                                                             | Mounts a component while a boolean is true.                           |
| `Reactive.fromStream(initial, stream)`                                                        | Any stream as a reactive value, owned by the scope.                   |
| `Reactive.fromSubscriptionRef(ref)`, `Reactive.succeed(value)`, `Reactive.make(get, changes)` | Other ways to make one.                                               |

<<< apps/sidebar/src/Sidebar.ts#agentRows

## UiState

`UiState.make(name, schema, initial)` in a component's Effect; `UiState.set(state, value)` and
`UiState.update(state, f)` as event handlers. A `UiState` is also a `Reactive`.

Every piece is kept in one tree, under its component's place: the names of the views from the root
down, with a row's key in brackets (`Board / Note[a]`), and a number when two share a place
(`Panel#2`). It is there while the component is mounted and gone when it leaves. The tree is
the same one state that stores live in, so the devtools and agents read, set and rewind UI state
through it. Give an app or a test its own with `State.layer`; a server render always has its own.
A handler that flips one is `onClick={UiState.update(open, (shown) => !shown)}`.

## Store

| Function                                                              | What it does                                                                                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Store.Tag<Self>()(key, { state, initialState, actions, selectors })` | Defines a store as a service class.                                                                                                |
| `Store.selector(Schema, select)`                                      | One named reading of the state, with a Schema for what it gives. A plain function is a compile error.                              |
| `Store.action(Schema, reduce)`                                        | One action: a payload Schema and a pure reducer.                                                                                   |
| `Self.layer`                                                          | The store for the whole app: provide it where the app is mounted.                                                                  |
| `Self.layerFrom(effect)`                                              | The same, starting from what the Effect gives, such as data a server loaded.                                                       |
| `Self.layerSaved`                                                     | The same, saved after each command and read back on start (needs a `KeyValueStore`). Other tabs that save it are followed.         |
| `Self.with(component)`                                                | The store beside one component: mounting the result makes the store, and each place it is mounted has its own.                     |
| `Store.withRow(rows, index, row)`                                     | In a reducer, the rows with one replaced. A keyed list showing those rows then rewrites that row only, without walking the others. |

A store service has `state`, `select.<name>` and `commands.<name>(payload)`. Its state is a slot
in the one state, so every command is in the log and the trace with its payload, and the devtools
step and fork the whole app.

(`apps/sidebar/src/BoardStore.ts`)

### Work that takes time

Work that takes time is a task of the store: `Store.task(payload, { result, run, finish, mode,
refuses })` in the store's `tasks`. `run` is the Effect, `finish` changes the state once with what
it returned, `mode` (`"switch"`, `"queue"`, `"concurrent"`) says what a second start does, and
`refuses` names the commands and tasks refused while it runs. The store gains `tasks.<name>(payload)`
to start it and `running.<name>`, a reactive boolean. What must survive a reload goes on an
`Outbox.channel` (`apps/sidebar/src/ResetCounterStore.ts`, `docs/state-and-server-data.md`).

### A store beside its view

<<< apps/sidebar/src/Notes.tsx

`Notes` is one unit: mount it anywhere with `<Notes id="..." title="..." />` and nothing is wired at the
app root. The store is made when the unit mounts and closed when it unmounts. Its key is the
store's key and the place it is mounted (`sidebar/Notes @ ShellView / NotesView`), a second one
beside it is numbered (`... NotesView#2`), and it registers with the devtools like every other
store, so its actions are in the one log and it rewinds and forks with the rest. Underneath it is
the same model, view, update as an app-wide store: one definition, pure reducers, every change an
action. (`apps/sidebar/src/Notes.ts`)

The build refuses any other way to hold state in app code (rule `state-only-through-spar`):
`Ref.make`, `SubscriptionRef.make` and their relatives, `let` and `var`. Code under a `server/`
folder is not page state and is left alone.

### Several tabs

A store placed with `TheStore.layerSaved` saves its state on the device in the same step as each
command, so a reload or a close straight after a click loses nothing, and it starts from what was
saved. Provide `Tabs.layerBrowser` in a browser and every open tab shows the same saved store: after
saving, a tab tells the others, and each reads the saved state again (on the broadcast message and
on the browser's own storage event, whichever arrives once the new value is visible). Two tabs that
write at the same moment end on whichever saved last. Without the layer a store behaves as if it
were the only tab.

## Outbox

`Outbox.Outbox.layer` (or `layerWith({ maxAttempts, attemptTimeout })`) needs a `KeyValueStore`.
Provide `Outbox.layerBrowser` in a browser: it follows the connection, lets one tab send, and tells
other tabs when something was added. The service has `pending`, `dead`, `retry(key)` and
`discard(key)`.

## Events

| Function                                                             | What it does                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Events.onDocument(type, handler)`, `Events.onWindow(type, handler)` | A typed handler outside one element, in a component's scope.             |
| `Events.fromDocument(type)`, `Events.fromWindow(type)`               | The same events as streams.                                              |
| `Events.prevent(handler)`, `Events.stop(handler)`                    | A handler that prevents the default or stops propagation, synchronously. |
| `Events.online`, `Events.visible`, `Events.mediaQuery(query)`        | Reactive values for the connection, tab visibility and a media query.    |
| `Events.title(text)`                                                 | Keeps the document's title in step with a reactive value while mounted.  |

Event props are `on` plus the DOM event name capitalised: `onClick`, `onKeydown`, `onPointerdown`.

## Handle

`Handle.make` in a component's Effect, `ref={handle}` on an element, then `Handle.focus(handle)`,
`Handle.focusInPlace(handle)` (focus without scrolling the page, as the router does after going
back), `Handle.scrollIntoView(handle)` or `Handle.measure(handle)`.

`Handle.measure(handle)` is an `Effect<Option<Box>>`: `Option.none()` while nothing is attached,
and a `Box` is `{ x, y, width, height }` in pixels, not a DOMRect (there is no `top`, `left`,
`right` or `bottom`; the bottom edge is `y + height`). Read it with `Option.match` or
`Option.map(box => box.y + box.height)`.

## Form

<<< apps/sidebar/src/Sidebar.ts#ProjectForm

A form's values, which fields have been left, whether a submit was tried and what the server
rejected are the component's UI state, under a name such as `form (name)`. So typing, leaving a
field and a refused submit are entries in the log, and rewinding puts a form back as it was.
Whether a send is in flight (`submitting`) is not kept there: going back to a moment does not
restart a send.

A text input's or textarea's `value` takes a plain string, UI state, or a form field's value, and
nothing else: binding it to a store selector or a query's data is a type error, because whatever
changes that value would replace what is being typed. A hidden input, and a textarea marked
`readOnly`, can show any reactive value.

`Form.text(field)` and `Form.checkbox(field)` are the props to spread on an input. A field's problem
shows once the field has been left or a submit was tried. Fail the submit Effect with
`new Form.Rejected({ message, fields })` to put a server's messages on their fields.
`form.submitThen(onValid, onDone)` also runs an action (closing a dialog, clearing the form) once
the submit has worked, and not when the input was invalid or the server refused it.

(`apps/sidebar/src/Sidebar.ts`, `packages/spar/test/form.test.ts`)

## Router

<<< apps/sidebar/src/routes.ts

<<< apps/sidebar/src/Shell.tsx#withPage

`Router.route(path, Schema)` decodes path and query params with a Schema. A path with `:params` cannot be declared without one, and the Schema must have every param the path names. A path ending in `/*` is a
layout that stays mounted while inner pages change. `Router.under(parent, path, Schema)` declares a route inside such a layout: the path is added to the parent's, and the Schema must carry every param of the whole path. The service has `location`, `go(route, params)`,
`replace`, `back`, `link(route, params)` and `followLinks`, a click handler for a container of
links you did not write as JSX (trusted markup), which follows links to this site in place.
`Router.focusOnChange(handle)` moves focus after a
navigation. `Router.live(route, Page)` keeps the page mounted while only the query changes and
gives it `params` as a reactive value, where `Router.on` mounts a fresh page for every change. In
a browser, a new page starts at the top and going back or forward puts the page where it was
scrolled to, waiting for late content for up to two seconds. `Router.focusOnChange(handle)` moves
focus to the page on every navigation; after a link it lets the browser bring the page into view,
and after back or forward it leaves the scroll position alone. Layers: `Router.Router.layerBrowser` and `Router.Router.layerMemory(url)`.

(`apps/sidebar/src/Shell.ts`, `packages/spar/test/router.test.ts`)

## Overlay

Inside a component wrapped in `View.portal`: `Overlay.modal({ onDismiss, initialFocus? })` makes
everything beneath inert, locks scrolling, keeps Tab inside, dismisses on Escape and returns focus;
`Overlay.dismissable({ onDismiss, anchor? })` is for menus; `Overlay.position(anchor)` gives styles
that place the layer by its anchor: below it or above, whichever has more room, from the left edge
or the right, never past the edge of the window, and no taller than the room there is.

## On a server

```mermaid
sequenceDiagram
  participant B as Browser
  participant S as Server
  B->>S: ask for page
  Note over S: run component
  Note over S: wait for data
  S-->>B: finished HTML
  Note over B: page is readable
  B->>S: ask for script
  Note over B: keep the nodes
  Note over B: attach listeners
```

`Server.render(Component, { layer })` runs the same component on a server, drawn by the
`Renderer.html` its layer gives, and gives its HTML and the state it drew from: each store's state encoded by its Schema, the UI state tree, and the
trace of the render. `Server.renderToString` gives only the HTML. `Server.renderInPieces` sends the page as first drawn and then, as each query's data lands, that data and the finished HTML of each component it changed, put in place between that component's marks (`docs/routing-and-data.md`). Loading parts (`View.pending`)
are waited for, so the page arrives complete; overlays are left out; `Events` values take their
resting values (online, visible, no media query matching) and window listeners are not attached.

There are no directives. The component is the same in both places, and the layers it is given
decide where its data comes from. On the server a store starts from data loaded there,
`Self.layerFrom(load)`, and a service reads the database directly. In the browser the same store
is `Self.layer`, which starts from the state the server sent, and the same service asks over
the network.

`Server.renderToStream(Component, { layer, open, close, end })` sends the document in parts:
`open` at once, before anything is drawn, then the page, `close`, the state as a
`<script type="application/json" id="spar-state">`, and `end`. `Server.stateScript(state)` is that
script on its own.

In the browser, `App.hydrate(Component, { target, layer })` takes the page over instead of
building it again: it keeps the server's nodes, attaches listeners and bindings to them, and
repairs whatever does not match what the component would have drawn. It reads the state script,
so stores and UI state start where the server left them, and its span `App.hydrate` is a child of
the server's `Server.render`: the render and the takeover are one trace. While it takes over,
loading parts are waited for as on the server, so nothing flickers back to a placeholder.
`App.mount` and `App.hydrate` both take `shown`, an effect run once the first picture is up.

(`apps/ssr`: `server/layers.ts` and `src/client.ts` are the two sets of layers.)

## One application, front to back

Every DOM handler runs in a span named `on <event>`, the root of a trace. What it causes stays in
that trace: the store command (`<store>/<action>`), what the outbox saves and later sends, even
after a restart (`Outbox.persist`, `Outbox.deliver`), navigation (`Router.go`), each component
that mounts because of it (a span with the view's name), and each call to the backend. Calls go
through Effect RPC, which carries the trace to the server, so the backend's spans are children of
the page's.

The contract is shared: an `RpcGroup` whose payloads, results and failures are Schemas. A failure
named in the contract is in the calling component's error type, so a component that calls the
backend and does not `View.recover` it cannot be mounted.

`spar/devtools/spans` is a span buffer for either side: `Spans.layer()` wraps whatever tracer is
installed and keeps the newest spans; `SpanBuffer.ofTrace(id)` and `recent()` give them as plain
data. `spar/devtools/span-routes` has `route` (`GET /spans/:traceId`) and `recentRoute`
(`GET /spans`) for an Effect HTTP server.

(`apps/sidebar`: `src/api.ts` is the contract, `server/handlers.ts` and `scripts/backend.ts` the
backend; `bun run backend` serves the app with it, and `bun run traced` follows one trace through
both in a real browser.)

## Query

Server data lives in a store. `Query.Tag` declares one: it is a `Store.Tag` underneath, so it is
in the log, the devtools and the traces like any other.

| Function                                                                       | What it does                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Query.Tag<Self>()(key, { input, success, failure, load, staleAfter, retry })` | Declares the query: Schemas for its input, what it loads and how it fails, `load(input)`, how long an answer stays fresh (500 ms unless set; `"0 millis"` asks again every time), and a schedule to try again on before it counts as failed. |
| `Self.ask(input)`                                                              | Declares, in a component's Effect, that this input is needed. Returns a handle at once.                                                                                                                                                      |
| `Self.read(input)`                                                             | The loaded value for an input, or null. For another store's after-effect.                                                                                                                                                                    |
| `Self.live`                                                                    | Its layer, for the whole app.                                                                                                                                                                                                                |
| `Self.beside(component)`                                                       | The query beside one component, as `.with` does for a store.                                                                                                                                                                                 |
| `Self.invalidate`                                                              | An Effect: load everything it holds again.                                                                                                                                                                                                   |
| `Self.patch(input, change)`                                                    | An Effect: change the loaded value for `input` at once. Followed by an `Outbox.channel` send, an optimistic update; run `Self.invalidate` on `Outbox.givenUp(channel)` so the change is taken back when the outbox gives up on it.           |

`ask` takes a plain value, a reactive value, or a reactive `Option` (`Schema.Void` as the input
means no argument). The handle has `result` and `refetch`. `result` is a reactive
`AsyncResult` from `effect/reactivity`: `Initial` while the input is none or nothing has loaded,
`Success` with the value, `Failure` with the typed error (and the last success, if any), each with
`waiting: true` while a request runs. While a new input loads, `result` stays the last `Success`,
marked `waiting`, so paging never blanks. It asks again
when the input changes; an input that is still fresh is a cache hit. One request runs for each
input at a time (a second is not sent) and an answer to an earlier request is ignored. Because
nothing awaits in a component's Effect, every query declared in a tree starts in the same pass,
and a query whose input comes from another query's value waits only for that value.
While a component is using it, a query asks again for what has gone stale when the tab is shown
again or the connection comes back. Data already there is served with a short span that links to
the trace that loaded it. An entry no component is using is released, then dropped after `dropAfter` (5 minutes unless
set); over `keepAtMost` entries (100 unless set) the longest unused are dropped at once. An entry
in use is never dropped. `Self.pages({ first, next })` reads a list a page at a time: `pages`,
`loading`, `failed`, `more` and `loadMore`. (`apps/sidebar/src/People.ts`, `docs/state-and-server-data.md`)

## Backend

Every call to a backend goes through one client, so each is a span in the trace and an entry in
the log.

| Function                    | What it does                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Backend.layer`             | The `HttpClient` of the app. Each request is noted in the log as a `call` with the trace it belongs to.       |
| `Backend.layerFrom(client)` | The same over another `HttpClient` layer (a test double, a client with a base address).                       |
| `Backend.rpc(group, url)`   | A client for an Effect RPC group over that `HttpClient`. This is the blessed way to talk to your own backend. |
| `Backend.layerTelemetry`    | A client for telemetry exporters. It is deliberately not logged, or each export would log itself.             |
| `Backend.beacon(url, body)` | `navigator.sendBeacon`, for what must still be sent as the page goes away.                                    |

How the other ways fit:

- **Effect RPC** is the one to use for a backend you own: the contract, its errors and the trace
  context are shared, and an error the component does not handle is a compile error.
- **Effect HttpApi** clients and **hand-written JSON calls** take `HttpClient.HttpClient` from
  context. Provide `Backend.layer` and they are logged and traced like RPC.
- **Generated OpenAPI clients** fit when they are built on an Effect `HttpClient`. Ones that call
  `fetch` themselves are refused.
- **tRPC, axios, ky, got, superagent, graphql-request, openapi-fetch, Apollo, socket.io-client**,
  and plain `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` and
  `FetchHttpClient.layer` are refused by the build (rule `backend-only-through-spar`). Port a tRPC
  router to an RPC group.

(`apps/sidebar/src/server/Server.ts`, `apps/sidebar/src/main.ts`)

A WebSocket goes through `Backend.layerSocket(url)`, which gives Effect's `Socket` service: what
it sends and receives is in the log as calls, a batch of frames at a time. `Backend.heard(url,
socket)` does the same for a socket made another way. The build refuses `new WebSocket` and
`Socket.makeWebSocket` in app code.

## Timeline

`Timeline.note(kind, name, detail)` reports something that happened to whoever is recording; with
nobody recording it does nothing. Store commands, `UiState.set` and `update`, and route changes
report themselves; use it for data arriving from a server. Each note carries the trace and span it
happened in.

## Diagnostics

`Diagnostics.all` lists every `SPAR_` code with its kind (build, run, types or tools),
what happened and the fix; `Diagnostics.text(code, { said, in, at })` formats one report in the
agent format. It is also importable as `spar/diagnostics`, the same list is written to
`packages/spar/diagnostics.json`, and the reference page is
[Diagnostics](diagnostics.md). Tools that read Spar's output (an agent, a CI step) match on the
code.

## Devtools

The devtools are not part of an app. In development the Vite plugin adds them:

<<< apps/sidebar/vite.config.ts

It only acts on the dev server. A production build carries no devtools code at all
(`apps/sidebar` checks its own build for that as part of `check`). `backends` are the servers
that expose `GET /spans/:traceId`; leave it out when there is none.

What the tools show, docked at the corner of the page:

- **Inspector.** Pick a component on the page: it is outlined as you move over it, and picking it
  shows its place in the tree, the props its view receives as plain values (reactive ones as they
  are now, and the store selector each comes from), its UI state, the services its Effect uses,
  the failures it recovers from, and a list of what changed in it after each action.
- **Everything that happened.** One log of store commands, UI state changes, route changes and
  data arriving and backend calls, in order, each with its trace id. Jump to any moment, step
  earlier and later, or go back to now; the whole app, stores and UI state together, shows that
  moment, and stepping opens the trace of the moment stepped to. From the keyboard, with Alt and
  Shift held: ← and → step, End goes back to now, L shows or hides the lanes, and D opens or
  closes the panel. None of these is a key an app is likely to want.
- **Fork.** "Fork from here" carries the running program on from the moment being shown, in a new
  branch, and keeps the original. The Branches list switches between them. A fork lives in the
  page: a saved store's saved state is not rewritten, so a reload returns to what was saved.
- **Trace.** Any moment opens as a waterfall of its spans: the page's and the backends' on one
  time line, nested by parent, with how long each took and the failed ones marked.
- **Stores.** Each store's actions and state, with Back, Forward, Live and Go to; export a log as
  JSON text, or paste one and load it to see where it leads without touching the live state. When
  the app has an outbox: how many items are waiting, and what could not be sent, each with Retry
  and Discard.

An app can also include the stores panel on purpose: provide `Devtools.layer` (from
`spar/devtools`) to its store layers and mount `Devtools.Panel`.

### For agents

`bun run --cwd packages/devtools-mcp start` runs a small server on 127.0.0.1:4188 (set
`SPAR_DEVTOOLS_PORT` to change it). An app that provides
`DevtoolsLink.layer({ url })` from `@spar/devtools-mcp/client` beside `Devtools.layer` reports to
it over Effect RPC; the demo does when opened with `?devtools=http://127.0.0.1:4188`. An agent
connects to `http://127.0.0.1:4188/mcp` (MCP over HTTP) and can ask what the app is doing right
now:

| Tool                                     | What it gives                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `list_stores`, `get_state`, `get_log`    | The stores, a store's state, its recorded actions                                                  |
| `travel_to`, `run_action`, `load_log`    | Step one store through its log, carry out an action, replay another log                            |
| `get_ui_state`, `set_ui_state`           | Every piece of UI state by component path; set one (refused when it does not fit its Schema)       |
| `get_timeline`, `rewind`                 | The one log with trace ids; show the whole app as it was after a moment                            |
| `list_components`, `get_component`       | The mounted components; one component's props, UI state, services and recovered failures           |
| `get_trace`                              | The spans the page recorded for a trace                                                            |
| `get_navigation`                         | The newest route change, its trace id and its spans; `back` counts back, `lens` keeps one kind     |
| `step`                                   | One moment earlier or later; gives the moment and every span of its trace                          |
| `fork`, `list_branches`, `switch_branch` | Fork the program at the moment shown, list the branches, make another one the running one          |
| `count_moments`                          | How many times each thing happened, most frequent first                                            |
| `diff_states`                            | What changed in a store between two of its actions, by path                                        |
| `export_session`, `load_session`         | Every store's log and all UI state as one JSON value; replay it here or in another copy of the app |

The same tools answer from a shell: `bun run --filter @spar/devtools-mcp cli tools` lists them and
`bun run --filter @spar/devtools-mcp cli call <tool> '<json>'` asks one (add `--url` when the
server is not on 127.0.0.1:4188).

Each failure comes back as a plain sentence. With several pages linked, the tools speak for the
one that reported last.

## App

`App.mount(component, { target, layer })` never returns; interrupting it unmounts everything.
`App.CrashReporter` is the reference to replace to receive crashes.

### Any renderer, chosen by a layer

Where a component is drawn is a `Renderer` service. `target` is the short way of giving the page's
own renderer, `Renderer.dom(target)`; leave `target` out and give a `Renderer` in `layer` instead.
The component and its view do not change between them, and an update writes the same one node.

| Renderer                                           | Where it draws                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Renderer.dom(target)`                             | The page, into `target`, with overlays above it                                       |
| `Renderer.into(target, overlays)`                  | Any document's element; `spar/renderer/memory`'s `page()` makes one outside a browser |
| `Terminal.layer(print)` (`spar/renderer/terminal`) | A document of its own, printed as text through `print` after each change              |
| `Renderer.html`                                    | Text, for a server: each value read once, with the markers the browser takes over by  |

<<< apps/demo/scripts/terminal.ts#program

<<< apps/ssr/scripts/render-page.tsx#rendered

(The first draws the demo's counter in a terminal, unchanged; the second renders a page as text with
`Renderer.html`.) The first three draw into a document
and keep it up to date, so `App.mount` takes them; `Renderer.html` writes a page once, so the
`Server` functions take it. Given the other kind, each says which renderer it needs.

## spar/testing

`import * as Testing from "spar/testing"`: `render(view, props)`, `mount(component)`,
`find(role, name?)`, `findText(text)`, `gone(role, name?)`, `eventually(assertion)`,
`click(role, name?)`, `fill(role, name, value)`, `press(key)`.

## @spar/ui

`Button`, `SubmitButton`, `TextField`, `Select`, `Checkbox`, `Switch`, `Tabs`, `Menu`,
`Dialog(frame, View.child(Content, props))` (mounted with `{ onClose }`) and `Toast` (`Toast.Toasts` service, `Toast.Viewport`). Import
`@spar/ui/styles.css` once. One page per component in `apps/stories`. A field's problem, the
text under `TextField`, `Select` and `Checkbox`, has the role `alert`.

- `Popover` (`label`, `text`, `content`): a button that opens a panel beside it. The panel takes
  focus, closes on Escape or a press elsewhere, and gives focus back.
- `Tooltip.make(text)`: gives `trigger`, props to spread on the button it describes, and `bubble`,
  an element to put next to it. Shown on hover and on focus, put away on leave, blur or Escape.
- `Listbox` (`label`, `name`, `choices`, `value`, `onChange`): a select drawn by the kit, for when
  the native control will not do. Arrow keys, Home, End, typing a first letter, Enter or Space to
  choose, and a hidden input so it posts with a form. `Select` stays the native control.

`Events.cancel(event)` is an action that stops what the browser would do with an event, for a
handler that only sometimes takes a key over.
