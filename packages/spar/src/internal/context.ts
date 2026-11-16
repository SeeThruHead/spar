import { Context, Effect } from "effect"

export const provideTo = <A, E, R, Rest = never>(
  effect: Effect.Effect<A, E, R | Rest>,
  context: Context.Context<R>,
): Effect.Effect<A, E, Rest> =>
  Effect.updateContext(effect, (rest: Context.Context<Rest>) => Context.merge(context, rest))
