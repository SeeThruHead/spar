import { Effect, Layer } from "effect"
import { ActionScope } from "./internal/actionScope.ts"
import * as Dom from "./internal/dom.ts"
import { render } from "./internal/render.ts"
import type { Component } from "./View.ts"

export type NoProps = Readonly<Record<string, never>>

export const mount = <R, LayerError = never>(
  component: Component<NoProps, never, R>,
  options: {
    readonly target: HTMLElement
    readonly layer: Layer.Layer<NoInfer<R>, LayerError>
  },
): Effect.Effect<never, LayerError> =>
  Effect.scope.pipe(
    Effect.flatMap((scope) =>
      component.mount({}).pipe(
        Effect.flatMap((element) =>
          render(element, { parent: options.target, before: null, namespace: "html" }),
        ),
        Effect.provideService(ActionScope, scope),
      ),
    ),
    Effect.andThen(Effect.addFinalizer(() => Effect.sync(() => Dom.clear(options.target)))),
    Effect.andThen(Effect.never),
    Effect.provide(options.layer),
    Effect.scoped,
  )
