# Recipes

## A timer

Timers are Effect schedules. Turn the stream into a reactive value in the component's Effect; it
stops when the component unmounts.

<<< packages/spar/test/events.test.ts#everySecond

## A websocket

Use `effect/socket`. Decode each message with a Schema, then either show it
(`Reactive.fromStream`) or turn it into store commands
(`Effect.forkScoped(Stream.runForEach(messages, store.commands.received))`). Reconnect with
`Stream.retry` and a schedule. Spar adds nothing here.

## Close something on Escape or an outside press

<<< apps/demo/src/mail/Thread.ts#closedOnEscapeOrOutside

and stop presses inside from reaching the document: `<span onPointerdown={Events.stop([])}>`.
For a layer above the page use `View.portal` with `Overlay.dismissable`.

## A dialog with a form

Wrap the form component with the kit's `Dialog` and mount it while some UI state says so. The form
is mounted fresh each time the dialog opens.

<<< apps/sidebar/src/Sidebar.ts#dialogs

## Work that must reach the server

Queue it on an outbox channel from the service that changes the store. The item is saved on the
device, sent with one idempotency key, and retried until it lands; the store is saved too, so a
reload loses nothing.

<<< apps/sidebar/src/BoardStore.ts#AgentStarts

Show `outbox.pending` and `outbox.dead` so the person can see what has not been sent.

## Tracing

Every component mount is a span named after its view and every store command is a span named
`<store key>/<action>`. Provide Effect's OTLP layer at the entry point:

<<< apps/sidebar/src/main.ts#telemetry

Post to your own origin and forward from the server, so the browser needs no cross-origin access to
the collector. `apps/demo/scripts/site.ts` forwards `/otlp` to `OTLP_ENDPOINT` when it is set and
drops traces otherwise.

## Testing a component with fixture layers

Mount the real component and provide test layers for its services.

<<< packages/spar/test/render.test.ts#failedLoadIsShown

## A long action

A handler's actions start in event order and may overlap if they wait on something. Keep handlers
short: a store command, a UI state change, a navigation. Put slow work in a task of the store
(`Store.task`), whose `mode` and `refuses` say what a repeat or another command does while it
runs, or on an outbox channel for what must reach the server. A form's submit already ignores a second submit while the first is running.
