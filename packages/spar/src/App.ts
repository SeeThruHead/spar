import { Effect, Layer } from "effect"
import { render } from "./internal/render.ts"
import type { Component } from "./View.ts"

export const mount = <R, LayerError = never>(
  component: Component<Record<never, never>, never, R>,
  options: {
    readonly target: HTMLElement
    readonly layer: Layer.Layer<NoInfer<R>, LayerError>
  },
): Effect.Effect<never, LayerError> =>
  component.mount({}).pipe(
    Effect.flatMap((element) => render(element, options.target, null)),
    Effect.andThen(Effect.addFinalizer(() => Effect.sync(() => options.target.replaceChildren()))),
    Effect.andThen(Effect.never),
    Effect.provide(options.layer),
    Effect.scoped,
  )
