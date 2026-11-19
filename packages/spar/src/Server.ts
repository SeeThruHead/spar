import { Effect, Schema, Stream } from "effect"
import type { Cell as Held } from "./internal/cell.ts"
import type { Layer } from "effect"
import * as Cell from "./internal/cell.ts"
import { Dehydrated, Text, stateId } from "./internal/dehydrated.ts"
import { Frame, noPage } from "./internal/frame.ts"
import { toHtml } from "./internal/html.ts"
import { OnServer } from "./internal/server.ts"
import { Tree, UiTree } from "./internal/uiTree.ts"
import type { NoProps } from "./App.ts"
import { Inspector } from "./Store.ts"
import type { Inspected } from "./Store.ts"
import type { Component } from "./View.ts"

export { Dehydrated }

export type Rendered = { readonly html: string; readonly state: Dehydrated }

type Options<R, LayerError> = {
  readonly layer: Layer.Layer<NoInfer<Exclude<R, Frame>>, LayerError>
}

const encodedOf = (store: Inspected) =>
  Effect.map(store.encoded, (state) => [store.key, state] as const)

const Loading = Schema.Struct({
  entries: Schema.Record(Schema.String, Schema.Struct({ status: Schema.String })),
})

const isLoading = (state: unknown): boolean => {
  if (!Schema.is(Loading)(state)) return false

  return Object.values(state.entries).some((entry) => entry.status === "loading")
}

const stillLoading = (stores: Held<ReadonlyArray<Inspected>>): Effect.Effect<boolean> =>
  Effect.map(
    Effect.forEach(stores.read(), (store) => store.state.get),
    (states) => states.some(isLoading),
  )

const settled = (stores: Held<ReadonlyArray<Inspected>>, quiet: number): Effect.Effect<void> =>
  quiet === 2
    ? Effect.void
    : Effect.flatMap(Effect.andThen(Effect.sleep("1 milli"), stillLoading(stores)), (busy) =>
        settled(stores, busy ? 0 : quiet + 1),
      )

export const render = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError>,
): Effect.Effect<Rendered, LayerError> => {
  const tree = new Tree()
  const stores = Cell.make<ReadonlyArray<Inspected>>([])

  return Effect.gen(function* () {
    const element = yield* component.mount({})

    yield* settled(stores, 0)

    const html = yield* toHtml(element)
    const span = yield* Effect.orDie(Effect.currentSpan)
    const states = yield* Effect.forEach(stores.read(), encodedOf)

    return {
      html,
      state: {
        stores: Object.fromEntries(states),
        ui: tree.snapshot(),
        trace: { traceId: span.traceId, spanId: span.spanId },
      },
    }
  }).pipe(
    Effect.provideService(Frame, noPage),
    Effect.provide(options.layer),
    Effect.provideService(OnServer, true),
    Effect.provideService(UiTree, tree),
    Effect.provideService(Inspector, {
      keepStates: 0,
      register: (store) => Effect.sync(() => stores.write([...stores.read(), store])),
    }),
    (rendered) => Effect.withSpan(rendered, "Server.render", { captureStackTrace: false }),
    Effect.scoped,
  )
}

export const renderToString = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError>,
): Effect.Effect<string, LayerError> => Effect.map(render(component, options), (made) => made.html)

export const stateScript = (state: Dehydrated): string =>
  `<script type="application/json" id="${stateId}">${Schema.encodeSync(Text)(state).replaceAll("<", "\\u003c")}</script>`

export const renderToStream = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError> & {
    readonly open: string
    readonly close: string
    readonly end: string
  },
): Stream.Stream<string, LayerError> =>
  Stream.concat(
    Stream.succeed(options.open),
    Stream.flatMap(Stream.fromEffect(render(component, options)), (made) =>
      Stream.make(made.html, options.close, stateScript(made.state), options.end),
    ),
  )
