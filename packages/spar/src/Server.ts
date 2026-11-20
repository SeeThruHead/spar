import { Effect, Exit, Formatter, Queue, Schema, Scope, Stream } from "effect"
import type { Cause } from "effect"
import * as Pieces from "./internal/pieces.ts"
import type { Cell as Held } from "./internal/cell.ts"
import type { Layer } from "effect"
import type { Element } from "./internal/element.ts"
import * as Cell from "./internal/cell.ts"
import { Dehydrated, Text, stateId } from "./internal/dehydrated.ts"
import { Frame, noPage } from "./internal/frame.ts"
import { Marked, toHtml } from "./internal/html.ts"
import { partsOf, replacements, unmarked } from "./internal/parts.ts"
import type { Part, Replacement } from "./internal/parts.ts"
import { OnServer } from "./internal/server.ts"
import { Tree, UiTree } from "./internal/uiTree.ts"
import type { Entry as UiEntry } from "./internal/uiTree.ts"
import type { NoProps } from "./App.ts"
import { Inspector } from "./Store.ts"
import type { Inspected } from "./Store.ts"
import type { Component } from "./View.ts"

export { Dehydrated }

export type Rendered = { readonly html: string; readonly state: Dehydrated }

type Options<R, LayerError> = {
  readonly layer: Layer.Layer<NoInfer<Exclude<R, Frame>>, LayerError>
}

const isStore = (keys: ReadonlySet<string>, entry: UiEntry): boolean => {
  if (entry.path.length > 0) return false

  return keys.has(entry.name)
}

const uiOf = (tree: Tree, stores: Held<ReadonlyArray<Inspected>>) => {
  const keys = new Set(stores.read().map((store) => store.key))

  return tree.snapshot().filter((entry) => !isStore(keys, entry))
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

const settled = (
  stores: Held<ReadonlyArray<Inspected>>,
  quiet: number,
  waited: boolean,
): Effect.Effect<boolean> =>
  quiet === 2
    ? Effect.succeed(waited)
    : Effect.flatMap(Effect.andThen(Effect.sleep("1 milli"), stillLoading(stores)), (busy) =>
        settled(stores, busy ? 0 : quiet + 1, waited || busy),
      )

const placeOf = (key: string): string => key.replace(/#\d+$/, "")

const statesOf = (
  stores: Held<ReadonlyArray<Inspected>>,
): Effect.Effect<ReadonlyMap<string, unknown>> =>
  Effect.map(
    Effect.forEach(stores.read(), (store) =>
      Effect.map(store.state.get, (state) => [placeOf(store.key), state] as const),
    ),
    (states) => new Map(states),
  )

const same = (before: ReadonlyMap<string, unknown>, after: ReadonlyMap<string, unknown>): boolean =>
  [...after].every(([key, state]) => Object.is(before.get(key), state))

const mostDraws = 8

const drawnWithin: (
  element: Element,
  stores: Held<ReadonlyArray<Inspected>>,
  left: number,
) => Effect.Effect<string, never, Scope.Scope> = Effect.fnUntraced(
  function* (element, stores, left) {
    const registered = stores.read()
    const before = yield* statesOf(stores)
    const draw = yield* Scope.make()
    const html = yield* Scope.provide(toHtml(element), draw)
    const waited = yield* settled(stores, 0, false)
    const after = yield* statesOf(stores)
    const again = left > 0 && (waited || !same(before, after))
    if (!again)
      return yield* Effect.as(
        Effect.addFinalizer(() => Scope.close(draw, Exit.void)),
        html,
      )

    yield* Scope.close(draw, Exit.void)
    yield* Effect.sync(() => stores.write(registered))

    return yield* drawnWithin(element, stores, left - 1)
  },
)

const drawn = (element: Element, stores: Held<ReadonlyArray<Inspected>>) =>
  drawnWithin(element, stores, mostDraws)

export const render = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError>,
): Effect.Effect<Rendered, LayerError> => {
  const tree = new Tree()
  const stores = Cell.make<ReadonlyArray<Inspected>>([])

  return Effect.gen(function* () {
    const element = yield* component.mount({})

    yield* settled(stores, 0, false)

    const html = yield* drawn(element, stores)
    const span = yield* Effect.orDie(Effect.currentSpan)
    const states = yield* Effect.forEach(stores.read(), encodedOf)

    return {
      html,
      state: {
        stores: Object.fromEntries(states),
        ui: uiOf(tree, stores),
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

const haveEntries = Schema.is(Loading)

const changedSince = (
  sent: Readonly<Record<string, string>>,
  now: ReadonlyArray<readonly [string, Schema.Json]>,
): ReadonlyArray<readonly [string, Schema.Json]> =>
  now.filter(([key, held]) => haveEntries(held) && sent[key] !== Formatter.formatJson(held))

const redrawn = Effect.fnUntraced(function* (
  element: Element,
  stores: Held<ReadonlyArray<Inspected>>,
) {
  const registered = stores.read()
  const draw = yield* Scope.make()
  const html = yield* Scope.provide(markedHtml(element), draw)

  yield* Scope.close(draw, Exit.void)
  yield* Effect.sync(() => stores.write(registered))

  return partsOf(html)
})

const markedHtml = (element: Element) => Effect.provideService(toHtml(element), Marked, true)

type Drawing = { readonly element: Element; readonly root: string }

const pieceOf = (root: string, replacement: Replacement): string =>
  replacement.open === -1
    ? Pieces.html(root, replacement.html)
    : Pieces.part(root, replacement.open, replacement.close, replacement.html)

const sentAgain = (drawing: Drawing, sent: Part, now: Part) => {
  const replaced = replacements(sent, now).toReversed()

  return Effect.as(
    Effect.annotateCurrentSpan({
      "spar.parts": replaced.length,
      "spar.whole": replaced.some((replacement) => replacement.open === -1),
    }),
    [
      ...replaced.map((replacement) => pieceOf(drawing.root, replacement)),
      ...replaced.slice(0, 1).map(() => Pieces.round(unmarked(now.html))),
    ],
  ).pipe((annotated) => Effect.withSpan(annotated, "Server.piece", { captureStackTrace: false }))
}

const piecesFor = (
  drawing: Drawing,
  stores: Held<ReadonlyArray<Inspected>>,
  changed: ReadonlyArray<readonly [string, Schema.Json]>,
  sent: Part,
): Effect.Effect<{ readonly chunks: ReadonlyArray<string>; readonly parts: Part }> =>
  changed.length === 0
    ? Effect.succeed({ chunks: [], parts: sent })
    : Effect.flatMap(redrawn(drawing.element, stores), (now) =>
        Effect.map(sentAgain(drawing, sent, now), (replaced) => ({
          chunks: [Pieces.script({ stores: Object.fromEntries(changed) }), ...replaced],
          parts: now,
        })),
      )

type Following = {
  readonly sent: Readonly<Record<string, string>>
  readonly parts: Part
  readonly quiet: number
}

const followed = <E>(
  drawing: Drawing,
  stores: Held<ReadonlyArray<Inspected>>,
  queue: Queue.Queue<string, E | Cause.Done>,
  following: Following,
): Effect.Effect<void> =>
  following.quiet === 2
    ? Effect.void
    : Effect.gen(function* () {
        yield* Effect.sleep("1 milli")

        const now = yield* Effect.forEach(stores.read(), encodedOf)
        const changed = changedSince(following.sent, now)
        const busy = yield* stillLoading(stores)
        const sending = yield* piecesFor(drawing, stores, changed, following.parts)

        yield* Queue.offerAll(queue, sending.chunks)

        return yield* followed(drawing, stores, queue, {
          sent: {
            ...following.sent,
            ...Object.fromEntries(changed.map(([key, held]) => [key, Formatter.formatJson(held)])),
          },
          parts: sending.parts,
          quiet: busy || changed.length > 0 ? 0 : following.quiet + 1,
        })
      })

export const renderInPieces = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError> & {
    readonly open: string
    readonly close: string
    readonly script: string
    readonly end: string
    readonly root?: string
  },
): Stream.Stream<string, LayerError> =>
  Stream.callback<string, LayerError>((queue) => {
    const tree = new Tree()
    const stores = Cell.make<ReadonlyArray<Inspected>>([])

    return Effect.gen(function* () {
      yield* Queue.offer(queue, options.open)

      const element = yield* component.mount({})
      const marked = yield* markedHtml(element)
      const span = yield* Effect.orDie(Effect.currentSpan)
      const states = yield* Effect.forEach(stores.read(), encodedOf)

      yield* Queue.offerAll(queue, [
        marked,
        options.close,
        stateScript({
          stores: Object.fromEntries(states),
          ui: uiOf(tree, stores),
          trace: { traceId: span.traceId, spanId: span.spanId },
          pieces: true,
        }),
        Pieces.withoutScripts(options.root ?? "#root"),
        options.script,
      ])
      yield* followed({ element, root: options.root ?? "#root" }, stores, queue, {
        sent: Object.fromEntries(states.map(([key, held]) => [key, Formatter.formatJson(held)])),
        parts: partsOf(marked),
        quiet: 0,
      })
      yield* Queue.offerAll(queue, [Pieces.script({ stores: {}, done: true }), options.end])
      yield* Queue.end(queue)
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
      Effect.catch((error) => Queue.fail(queue, error)),
    )
  })

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
