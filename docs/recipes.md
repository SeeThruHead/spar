# Recipes

## A timer

Timers are Effect schedules. Turn the stream into a reactive value in the component's Effect; it
stops when the component unmounts.

```ts
const ticks =
  yield *
  Reactive.fromStream(
    0,
    Stream.fromSchedule(Schedule.spaced("1 second")).pipe(Stream.map((count) => count + 1)),
  )
```

(`packages/spar/test/events.test.ts`)

## A websocket

Use `effect/socket`. Decode each message with a Schema, then either show it
(`Reactive.fromStream`) or turn it into store commands
(`Effect.forkScoped(Stream.runForEach(messages, store.commands.received))`). Reconnect with
`Stream.retry` and a schedule. Spar adds nothing here.

## Close something on Escape or an outside press

```ts
yield * Events.onDocument("pointerdown", UiState.set(open, false))
yield *
  Events.onDocument("keydown", (event) => (event.key === "Escape" ? UiState.set(open, false) : []))
```

and stop presses inside from reaching the document: `<span onPointerdown={Events.stop([])}>`.
For a layer above the page use `View.portal` with `Overlay.dismissable`.

(`apps/demo/src/mail/Thread.ts`)

## A dialog with a form

Wrap the form component with the kit's `Dialog` and mount it while some UI state says so. The form
is mounted fresh each time the dialog opens.

```ts
yield *
  pipe(
    Reactive.map(editing, (now) => now._tag === "AddingProject"),
    Reactive.when(Dialog({ id: "project", title: "New project" }, ProjectForm), shared),
  )
```

(`apps/sidebar/src/Sidebar.ts`)

## Work that must reach the server

Declare it beside the store. The item is saved before the state changes, sent with one idempotency
key, and retried until it lands.

```ts
export const BoardStoreLive = BoardStore.layerDurable({}, [
  Store.outbox(
    BoardStore.actions.started,
    Effect.fnUntraced(function* ({ name }, idempotencyKey) {
      const server = yield* Server

      yield* server.start(name, idempotencyKey)
    }),
  ),
])
```

Show `outbox.pending` and `outbox.dead` so the person can see what has not been sent.

(`apps/sidebar/src/BoardStore.ts`)

## Tracing

Every component mount is a span named after its view and every store command is a span named
`<store key>/<action>`. Provide Effect's OTLP layer at the entry point:

```ts
const telemetry = Otlp.layerJson({
  baseUrl: `${location.origin}/otlp`,
  resource: { serviceName: "spar-sidebar" },
}).pipe(Layer.provide(FetchHttpClient.layer))

Effect.runFork(Effect.provide(program, telemetry))
```

Post to your own origin and forward from the server, so the browser needs no cross-origin access to
the collector. `apps/demo/scripts/site.ts` forwards `/otlp` to `OTLP_ENDPOINT` when it is set and
drops traces otherwise.

## Testing a component with fixture layers

Mount the real component and provide test layers for its services.

```ts
it.live("a failed load is shown by the view that recovers its error", () =>
  Effect.gen(function* () {
    const probe = yield* Probe

    yield* mount(LoaderPage)
    yield* Deferred.fail(probe.loaded, new LoadFailed({ message: "The report is missing." }))

    expect((yield* find("alert")).textContent).toBe("The report is missing.")
  }).pipe(Effect.provide(layer)),
)
```

(`packages/spar/test/render.test.ts`)

## A long action

A handler's actions start in event order and may overlap if they wait on something. Keep handlers
short: a store command, a UI state change, a navigation. Put slow work in a store reaction, the
outbox, or a form's submit (which ignores a second submit while the first is running).
