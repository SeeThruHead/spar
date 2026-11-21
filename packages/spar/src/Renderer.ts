import { Context, Effect, Layer } from "effect"
import type { Scope } from "effect"
import * as Dom from "./internal/dom.ts"
import { toHtml } from "./internal/html.ts"

export type Live = {
  readonly _tag: "Live"
  readonly target: Dom.Host
  readonly overlays: Dom.Host
  readonly inPage: boolean
}

export type Html = {
  readonly _tag: "Html"
  readonly draw: (child: unknown) => Effect.Effect<string, never, Scope.Scope>
}

export class Renderer extends Context.Service<Renderer, Live | Html>()("spar/Renderer") {}

export const dom = (target: HTMLElement): Layer.Layer<Renderer> =>
  Layer.effect(
    Renderer,
    Effect.map(
      Effect.acquireRelease(Effect.sync(Dom.addOverlayRoot), (root) =>
        Effect.sync(() => root.remove()),
      ),
      (overlays): Live => ({ _tag: "Live", target, overlays, inPage: true }),
    ),
  )

export const into = (target: Dom.Host, overlays: Dom.Host): Layer.Layer<Renderer> =>
  Layer.succeed(Renderer, { _tag: "Live", target, overlays, inPage: false })

export const html: Layer.Layer<Renderer> = Layer.succeed(Renderer, { _tag: "Html", draw: toHtml })
