import { Context, Effect, Layer } from "effect"
import * as Dom from "./internal/dom.ts"

export class Renderer extends Context.Service<
  Renderer,
  {
    readonly target: Dom.Host
    readonly overlays: Dom.Host
    readonly inPage: boolean
  }
>()("spar/Renderer") {}

export const dom = (target: HTMLElement): Layer.Layer<Renderer> =>
  Layer.effect(
    Renderer,
    Effect.map(
      Effect.acquireRelease(Effect.sync(Dom.addOverlayRoot), (root) =>
        Effect.sync(() => root.remove()),
      ),
      (overlays) => Renderer.of({ target, overlays, inPage: true }),
    ),
  )

export const into = (target: Dom.Host, overlays: Dom.Host): Layer.Layer<Renderer> =>
  Layer.succeed(Renderer, Renderer.of({ target, overlays, inPage: false }))
