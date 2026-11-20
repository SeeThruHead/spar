import { Effect, Layer, Option, Scheduler, Schema, Semaphore, Tracer } from "effect"
import type { Context } from "effect"
import * as Cell from "./internal/cell.ts"
import { Text, stateId } from "./internal/dehydrated.ts"
import type { Dehydrated } from "./internal/dehydrated.ts"
import { Hydrating, OnServer, Seed } from "./internal/server.ts"
import { Tree, UiTree } from "./internal/uiTree.ts"
import { ActionScope } from "./internal/actionScope.ts"
import { browserScheduler } from "./internal/soon.ts"
import * as Dom from "./internal/dom.ts"
import { Frame, noPage } from "./internal/frame.ts"
import { toHtml } from "./internal/html.ts"
import { Preload } from "./internal/preload.ts"
import { installed } from "./internal/hook.ts"
import { starter } from "./internal/listen.ts"
import * as Pieces from "./internal/pieces.ts"
import { fromCell } from "./internal/reactive.ts"
import { renderInto } from "./internal/render.ts"
import { Inspector } from "./Store.ts"
import type { Router } from "./Router.ts"
import type { Component } from "./View.ts"

export { CrashReporter } from "./internal/crash.ts"
export type { Where as CrashWhere } from "./internal/crash.ts"
export type { Frame } from "./internal/frame.ts"

export type NoProps = Readonly<Record<string, never>>

const overlayRoot = Effect.acquireRelease(Effect.sync(Dom.addOverlayRoot), (root) =>
  Effect.sync(() => root.remove()),
)

type Options<R, LayerError> = {
  readonly target: HTMLElement
  readonly layer: Layer.Layer<NoInfer<Exclude<R, Frame>>, LayerError>
  readonly shown?: Effect.Effect<void>
}

const sent = (): Option.Option<Dehydrated> =>
  Option.flatMap(Option.fromNullOr(Dom.textOf(stateId)), Schema.decodeUnknownOption(Text))

const nothingSent: Dehydrated = { stores: {}, ui: [], trace: null }

const continued = (state: Dehydrated) =>
  Option.match(Option.fromNullOr(state.trace), {
    onNone: () => ({}),
    onSome: (trace) => ({ parent: Tracer.externalSpan({ ...trace, sampled: true }) }),
  })

const rehearsal =
  <R>(component: Component<NoProps, never, R>, context: Context.Context<Exclude<R, Frame>>) =>
  (memory: Layer.Layer<Router>): Effect.Effect<void> =>
    Effect.flatMap(Layer.build(memory), (router) =>
      Effect.flatMap(component.mount({}), toHtml).pipe(
        Effect.provide(router),
        Effect.provideService(Frame, noPage),
        Effect.provideService(OnServer, true),
        Effect.provideService(UiTree, new Tree()),
        Effect.provideService(Inspector, Inspector.defaultValue()),
      ),
    ).pipe(Effect.provide(context), Effect.scoped, Effect.asVoid)

type Taking = {
  readonly adopters: Cell.Cell<ReadonlyMap<string, Pieces.Adopt>>
  readonly expecting: Cell.Cell<boolean>
}

const adopted = (taking: Taking, piece: unknown) =>
  Effect.forEach(
    Option.toArray(Schema.decodeUnknownOption(Pieces.Piece)(piece)),
    (taken) =>
      Effect.andThen(
        Effect.forEach(
          Object.entries(taken.stores),
          ([key, held]) => taking.adopters.read().get(key)?.(held) ?? Effect.void,
          { discard: true },
        ),
        Effect.sync(() => taking.expecting.write(taking.expecting.read() && taken.done !== true)),
      ),
    { discard: true },
  )

const taken = Effect.fnUntraced(function* (taking: Taking) {
  const start = yield* starter()
  const turn = yield* Semaphore.make(1)

  Dom.takePieces(Pieces.holder, (piece) =>
    start(Semaphore.withPermit(turn, adopted(taking, piece))),
  )
  Dom.whenParsed(() =>
    start(
      Semaphore.withPermit(
        turn,
        Effect.sync(() => taking.expecting.write(false)),
      ),
    ),
  )
})

const started = <R, LayerError>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError>,
  existing: (target: HTMLElement) => Dom.Cursor | undefined,
  state: Dehydrated,
  name: string,
): Effect.Effect<never, LayerError> => {
  const adopters = Cell.make<ReadonlyMap<string, Pieces.Adopt>>(new Map())
  const expecting = Cell.make(state.pieces === true)

  return Effect.all({
    scope: Effect.scope,
    overlays: overlayRoot,
    context: Effect.context<Exclude<R, Frame>>(),
  }).pipe(
    Effect.tap(() => Effect.sync(() => Dom.markTaken(options.target, Pieces.taken))),
    Effect.flatMap(({ scope, overlays, context }) => {
      const claim = existing(options.target)
      const hydrating = Cell.make(claim !== undefined)

      return Effect.andThen(
        Effect.map(Effect.service(UiTree), (tree) => tree.restore(state.ui)),
        component.mount({}),
      ).pipe(
        Effect.flatMap((element) =>
          renderInto(element, { parent: options.target, before: null, namespace: "html" }, claim),
        ),
        Effect.andThen(
          Effect.sync(() => {
            hydrating.write(false)
            Option.map(Option.fromNullishOr(claim), (cursor) => Dom.dropRest(cursor, null))
          }),
        ),
        (mounted) =>
          Effect.withSpan(mounted, name, { captureStackTrace: false, ...continued(state) }),
        Effect.andThen(options.shown ?? Effect.void),
        Effect.andThen(taken({ adopters, expecting })),
        Effect.andThen(
          Option.match(installed.read(), {
            onNone: () => Effect.void,
            onSome: (hook) => hook.attach,
          }),
        ),
        Effect.provideService(Hydrating, hydrating),
        Effect.provideService(ActionScope, scope),
        Effect.provideService(Frame, { target: options.target, overlays }),
        Effect.provideService(Preload, rehearsal(component, context)),
      )
    }),
    Effect.andThen(Effect.addFinalizer(() => Effect.sync(() => Dom.clear(options.target)))),
    Effect.andThen(Effect.never),
    Effect.provide(options.layer),
    Effect.provideService(Pieces.Adopters, {
      register: (key, adopt) =>
        Effect.sync(() => adopters.write(new Map([...adopters.read(), [key, adopt]]))),
    }),
    Effect.provideService(Pieces.Expected, fromCell(expecting)),
    Effect.provideService(
      Seed,
      Pieces.seededWith(state.stores, Pieces.arrivedEarly(Dom.waitingPieces(Pieces.holder))),
    ),
    (app) =>
      Option.match(installed.read(), { onNone: () => app, onSome: (hook) => hook.wrap(app) }),
    Effect.scoped,
    Effect.provideService(Scheduler.Scheduler, browserScheduler),
  )
}

export const mount = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError>,
): Effect.Effect<never, LayerError> =>
  started(component, options, () => undefined, nothingSent, "App.mount")

export const hydrate = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError>,
): Effect.Effect<never, LayerError> =>
  Effect.suspend(() =>
    started(
      component,
      options,
      Dom.cursorIn,
      Option.getOrElse(sent(), () => nothingSent),
      "App.hydrate",
    ),
  )
