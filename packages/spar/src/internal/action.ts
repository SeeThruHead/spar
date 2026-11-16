import { Effect, Predicate } from "effect"

export const WriteTypeId: unique symbol = Symbol.for("~spar/UiWrite")

export type UiWrite = { readonly [WriteTypeId]: Effect.Effect<void> }

export type Action = Effect.Effect<void> | UiWrite | ReadonlyArray<Action>

export type Handler<Event> = Action | ((event: Event) => Action)

export const write = (effect: Effect.Effect<void>): UiWrite => ({ [WriteTypeId]: effect })

const isWrite = (action: Action): action is UiWrite => Predicate.hasProperty(action, WriteTypeId)

const isTrustedAction = (handler: unknown): handler is Action => Predicate.isNotNullish(handler)

const isTrustedListener = (handler: unknown): handler is (event: Event) => Action =>
  Predicate.isFunction(handler)

export const run = (action: Action): Effect.Effect<void> => {
  if (isWrite(action)) return action[WriteTypeId]
  if (Effect.isEffect(action)) return action

  return Effect.forEach(action, run, { discard: true })
}

export const toAction = (handler: unknown, event: Event): Action => {
  if (isTrustedListener(handler)) return handler(event)
  if (isTrustedAction(handler)) return handler

  return []
}
