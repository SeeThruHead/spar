import { Effect, Layer, Scheduler } from "effect"
import { ActionScope } from "./internal/actionScope.ts"
import { browserScheduler } from "./internal/soon.ts"
import * as Dom from "./internal/dom.ts"
import { Frame } from "./internal/frame.ts"
import { renderInto } from "./internal/render.ts"
import type { Component } from "./View.ts"

export { CrashReporter } from "./internal/crash.ts"
export type { Frame } from "./internal/frame.ts"

export type NoProps = Readonly<Record<string, never>>

const overlayRoot = Effect.acquireRelease(Effect.sync(Dom.addOverlayRoot), (root) =>
  Effect.sync(() => root.remove()),
)

export const mount = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: {
    readonly target: HTMLElement
    readonly layer: Layer.Layer<NoInfer<Exclude<R, Frame>>, LayerError>
  },
): Effect.Effect<never, LayerError> =>
  Effect.all({ scope: Effect.scope, overlays: overlayRoot }).pipe(
    Effect.flatMap(({ scope, overlays }) =>
      component.mount({}).pipe(
        Effect.flatMap((element) =>
          renderInto(element, { parent: options.target, before: null, namespace: "html" }),
        ),
        Effect.provideService(ActionScope, scope),
        Effect.provideService(Frame, { target: options.target, overlays }),
      ),
    ),
    Effect.andThen(Effect.addFinalizer(() => Effect.sync(() => Dom.clear(options.target)))),
    Effect.andThen(Effect.never),
    Effect.provide(options.layer),
    Effect.scoped,
    Effect.provideService(Scheduler.Scheduler, browserScheduler),
  )
