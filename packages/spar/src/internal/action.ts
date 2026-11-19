import { Effect, Predicate } from "effect"

export const WriteTypeId: unique symbol = Symbol.for("~spar/UiWrite")

const ModifiedTypeId = "~spar/ModifiedHandler"

export type UiWrite = {
  readonly [WriteTypeId]: Effect.Effect<void>
  readonly [Symbol.iterator]: () => ReturnType<Effect.Effect<void>[typeof Symbol.iterator]>
}

export type Action = Effect.Effect<void> | UiWrite | ReadonlyArray<Action>

type Before = "preventDefault" | "stopPropagation" | "followLink"

export type Modified<Event> = {
  readonly [ModifiedTypeId]: Before
  readonly handler: Handler<Event>
}

export type Handler<Event> = Action | ((event: Event) => Action) | Modified<Event>

export const write = (effect: Effect.Effect<void>): UiWrite => ({
  [WriteTypeId]: effect,
  [Symbol.iterator]: () => effect[Symbol.iterator](),
})

export const modify = <Event>(before: Before, handler: Handler<Event>): Modified<Event> => ({
  [ModifiedTypeId]: before,
  handler,
})

const isWrite = (action: Action): action is UiWrite => Predicate.hasProperty(action, WriteTypeId)

const isModified = (handler: unknown): handler is Modified<Event> =>
  Predicate.hasProperty(handler, ModifiedTypeId)

const isTrustedAction = (handler: unknown): handler is Action => Predicate.isNotNullish(handler)

const isTrustedListener = (handler: unknown): handler is (event: Event) => Action =>
  Predicate.isFunction(handler)

export const run = (action: Action): Effect.Effect<void> => {
  if (isWrite(action)) return action[WriteTypeId]
  if (Effect.isEffect(action)) return action

  return Effect.forEach(action, run, { discard: true })
}

const isPlainClick = (event: Event): boolean => {
  if (!(event instanceof MouseEvent)) return false
  if (event.button !== 0) return false

  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
}

const takesOver: Readonly<Record<Before, (event: Event) => boolean>> = {
  preventDefault: (event) => {
    event.preventDefault()

    return true
  },
  stopPropagation: (event) => {
    event.stopPropagation()

    return true
  },
  followLink: (event) => {
    if (!isPlainClick(event)) return false

    event.preventDefault()

    return true
  },
}

const modified = (handler: Modified<Event>, event: Event): Action => {
  if (!takesOver[handler[ModifiedTypeId]](event)) return []

  return toAction(handler.handler, event)
}

export const toAction = (handler: unknown, event: Event): Action => {
  if (isModified(handler)) return modified(handler, event)
  if (isTrustedListener(handler)) return handler(event)
  if (isTrustedAction(handler)) return handler

  return []
}
