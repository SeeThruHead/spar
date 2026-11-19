import { Effect, Layer, Option, Scheduler, Schema, Tracer } from "effect"
import * as Cell from "./internal/cell.ts"
import { Text, stateId } from "./internal/dehydrated.ts"
import type { Dehydrated } from "./internal/dehydrated.ts"
import { Hydrating, Seed } from "./internal/server.ts"
import { UiTree } from "./internal/uiTree.ts"
import { ActionScope } from "./internal/actionScope.ts"
import { browserScheduler } from "./internal/soon.ts"
import * as Dom from "./internal/dom.ts"
import { Frame } from "./internal/frame.ts"
import { installed } from "./internal/hook.ts"
import { renderInto } from "./internal/render.ts"
import type { Component } from "./View.ts"

export { CrashReporter } from "./internal/crash.ts"
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

const started = <R, LayerError>(
  component: Component<NoProps, never, R>,
  options: Options<R, LayerError>,
  existing: (target: HTMLElement) => Dom.Cursor | undefined,
  state: Dehydrated,
  name: string,
): Effect.Effect<never, LayerError> =>
  Effect.all({ scope: Effect.scope, overlays: overlayRoot }).pipe(
    Effect.flatMap(({ scope, overlays }) => {
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
        Effect.andThen(
          Option.match(installed.read(), {
            onNone: () => Effect.void,
            onSome: (hook) => hook.attach,
          }),
        ),
        Effect.provideService(Hydrating, hydrating),
        Effect.provideService(ActionScope, scope),
        Effect.provideService(Frame, { target: options.target, overlays }),
      )
    }),
    Effect.andThen(Effect.addFinalizer(() => Effect.sync(() => Dom.clear(options.target)))),
    Effect.andThen(Effect.never),
    Effect.provide(options.layer),
    Effect.provideService(Seed, state.stores),
    (app) =>
      Option.match(installed.read(), { onNone: () => app, onSome: (hook) => hook.wrap(app) }),
    Effect.scoped,
    Effect.provideService(Scheduler.Scheduler, browserScheduler),
  )

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
