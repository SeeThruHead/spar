import { Effect, Option, Stream, SubscriptionRef } from "effect"
import * as Dom from "./internal/dom.ts"
import { HandleTypeId } from "./internal/handle.ts"
import type { Handle } from "./internal/handle.ts"
import { ViewScope } from "./internal/viewScope.ts"

export type { Handle } from "./internal/handle.ts"

const attachWait = "1 second"

export const make: Effect.Effect<Handle, never, ViewScope> = ViewScope.use(() =>
  Effect.map(SubscriptionRef.make(Option.none<Dom.Host>()), (node) => ({ [HandleTypeId]: node })),
)

const attached = (self: Handle): Effect.Effect<Option.Option<Dom.Host>> =>
  SubscriptionRef.changes(self[HandleTypeId]).pipe(
    Stream.filter(Option.isSome),
    Stream.runHead,
    Effect.timeoutOption(attachWait),
    Effect.map(Option.flatten),
    Effect.map(Option.flatten),
  )

const withNode = (self: Handle, use: (node: Dom.Host) => void): Effect.Effect<void> =>
  Effect.map(attached(self), (node) => {
    Option.map(node, use)
  })

export const focus = (self: Handle): Effect.Effect<void> => withNode(self, Dom.focus)

export const scrollIntoView = (self: Handle): Effect.Effect<void> =>
  withNode(self, Dom.scrollIntoView)

export const measure = (self: Handle): Effect.Effect<Option.Option<Dom.Box>> =>
  Effect.map(SubscriptionRef.get(self[HandleTypeId]), Option.map(Dom.measure))
