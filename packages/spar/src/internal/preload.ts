import { Context, Effect, type Layer } from "effect"
import type { Router } from "../Router.ts"

export const Preload = Context.Reference<(router: Layer.Layer<Router>) => Effect.Effect<void>>(
  "spar/internal/Preload",
  { defaultValue: () => () => Effect.void },
)
