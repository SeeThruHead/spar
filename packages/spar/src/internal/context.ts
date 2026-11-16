import { Context, Effect } from "effect"
import type { Scope } from "effect"
import type { Element } from "./element.ts"

export const provideTo = <A, E, R, Rest = never>(
  effect: Effect.Effect<A, E, R | Rest>,
  context: Context.Context<R>,
): Effect.Effect<A, E, Rest> =>
  Effect.updateContext(effect, (rest: Context.Context<Rest>) => Context.merge(context, rest))

export const inContext = <R>(
  mount: Effect.Effect<Element, never, R | Scope.Scope>,
  context: Context.Context<R>,
): Effect.Effect<Element, never, Scope.Scope> =>
  provideTo<Element, never, R, Scope.Scope>(mount, context)
