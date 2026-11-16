# API

Everything is imported from `spar` unless a line says otherwise. Each section names a file in this
repo where the API is used and type-checked.

## View

| Function                        | What it does                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `View.connect(props)(View)`     | Makes a component: `props` is `(outer) => Effect<Props, E, R>`, run once on mount.     |
| `View.child(component, props)`  | Mounts a child from a parent's Effect and gives back its element.                      |
| `View.recover(tag, ErrorView)`  | Handles one tagged error with a view and removes it from the type.                     |
| `View.pending(PlaceholderView)` | Shows a placeholder until the component's Effect finishes. Needs errors handled first. |
| `View.crash(FallbackView)`      | Shows a fallback if the component's Effect dies, and reports it.                       |
| `View.mapProps(f)`              | Changes the props a component takes.                                                   |
| `View.branch(test, Other)`      | Mounts `Other` instead when `test(props)` holds.                                       |
| `View.portal`                   | Mounts the component in a layer above the app.                                         |

```ts
export const AgentPage = pipe(
  View.connect(agentProps)(AgentPageView),
  View.recover("AgentNotFound", AgentMissingView),
  View.pending(AgentLoadingView),
)
```

(`apps/sidebar/src/AgentPage.ts`)

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

```ts
const rows =
  yield *
  pipe(
    Reactive.map(props.section, (section) => section.rows),
    Reactive.mapBy(
      (agent: Agent) => agent.id,
      AgentRow,
      (agent, id) => ({ agent, id, editing: props.editing }),
    ),
  )
```

(`apps/sidebar/src/Sidebar.ts`)

## UiState

`UiState.make(initial)` in a component's Effect; `UiState.set(state, value)` and
`UiState.update(state, f)` as event handlers. A `UiState` is also a `Reactive`.

```tsx
<button onClick={UiState.update(open, (shown) => !shown)}>Options</button>
```

## Store

| Function                                                       | What it does                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Store.Tag<Self>()(key, { initialState, actions, selectors })` | Defines a store as a service class.                                                                                    |
| `Store.action(Schema, reduce)`                                 | One action: a payload Schema and a pure reducer.                                                                       |
| `Self.layer(reactions?)`                                       | The store in memory.                                                                                                   |
| `Self.layerDurable({ state, compactAfter? }, reactions?)`      | The store kept on the device (needs a `KeyValueStore`). Fails with `Store.Unreadable` if saved data no longer decodes. |
| `Store.after(action, effect)`                                  | Runs an Effect after an action.                                                                                        |
| `Store.outbox(action, send)`                                   | Sends the action's payload through the outbox.                                                                         |
| `Store.replay(definition, entries)`                            | Rebuilds state from a log.                                                                                             |

A store service has `state`, `log`, `select.<name>`, `commands.<name>(payload)`, `viewing` and
`travelTo(seq | null)`.

(`apps/sidebar/src/BoardStore.ts`)

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

Event props are `on` plus the DOM event name capitalised: `onClick`, `onKeydown`, `onPointerdown`.

## Handle

`Handle.make` in a component's Effect, `ref={handle}` on an element, then `Handle.focus(handle)`,
`Handle.scrollIntoView(handle)` or `Handle.measure(handle)`.

## Form

```ts
const form = yield * Form.make(Named, { name: "" })

return {
  field: form.field("name"),
  busy: form.submitting,
  onSubmit: form.submit(({ name }) => store.commands.spaceAdded({ name })),
}
```

`Form.text(field)` and `Form.checkbox(field)` are the props to spread on an input. A field's problem
shows once the field has been left or a submit was tried. Fail the submit Effect with
`new Form.Rejected({ message, fields })` to put a server's messages on their fields.

(`apps/sidebar/src/Sidebar.ts`, `packages/spar/test/form.test.ts`)

## Router

```ts
export const home = Router.route("/")
export const agentRoute = Router.route("/agents/:id")

page: yield *
  Router.outlet({
    routes: [Router.on(home, EmptyPageView), Router.on(agentRoute, AgentPage)],
    otherwise: MissingPageView,
  })
```

`Router.route(path, Schema)` decodes path and query params with a Schema. A path ending in `/*` is a
layout that stays mounted while inner pages change. The service has `location`, `go(route, params)`,
`replace`, `back` and `link(route, params)`. `Router.focusOnChange(handle)` moves focus after a
navigation. Layers: `Router.Router.layerBrowser` and `Router.Router.layerMemory(url)`.

(`apps/sidebar/src/Shell.ts`, `packages/spar/test/router.test.ts`)

## Overlay

Inside a component wrapped in `View.portal`: `Overlay.modal({ onDismiss, initialFocus? })` makes
everything beneath inert, locks scrolling, keeps Tab inside, dismisses on Escape and returns focus;
`Overlay.dismissable({ onDismiss, anchor? })` is for menus; `Overlay.position(anchor)` gives styles
that place the layer by its anchor.

## Devtools

Provide `Devtools.layer` to the store layers and mount `Devtools.Panel`: each store's actions and
state, with Back, Forward, Live and Go to.

## App

`App.mount(component, { target, layer })` never returns; interrupting it unmounts everything.
`App.CrashReporter` is the reference to replace to receive crashes.

## spar/testing

`import * as Testing from "spar/testing"`: `render(view, props)`, `mount(component)`,
`find(role, name?)`, `findText(text)`, `gone(role, name?)`, `eventually(assertion)`,
`click(role, name?)`, `fill(role, name, value)`, `press(key)`.

## @spar/ui

`Button`, `SubmitButton`, `TextField`, `Select`, `Checkbox`, `Switch`, `Tabs`, `Menu`,
`Dialog(frame, Content)` and `Toast` (`Toast.Toasts` service, `Toast.Viewport`). Import
`@spar/ui/styles.css` once. One page per component in `apps/stories`.
