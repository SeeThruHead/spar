import { Context, Effect } from "effect"

export const Preload = Context.Reference<(url: string) => Effect.Effect<void>>(
  "spar/internal/Preload",
  { defaultValue: () => () => Effect.void },
)
