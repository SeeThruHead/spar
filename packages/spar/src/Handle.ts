import { Effect, Option, Schedule, Stream, SubscriptionRef } from "effect"
import * as Dom from "./internal/dom.ts"
import { HandleTypeId } from "./internal/handle.ts"
import type { Handle } from "./internal/handle.ts"
import { ViewScope } from "./internal/viewScope.ts"

export type { Handle } from "./internal/handle.ts"

const attachWait = "1 second"

export const make: Effect.Effect<Handle, never, ViewScope> = ViewScope.use(() =>
  Effect.map(SubscriptionRef.make(Option.none<Dom.Host>()), (node) => ({ [HandleTypeId]: node })),
)

const onThePage = (node: Dom.Host): Effect.Effect<Dom.Host> =>
  Effect.as(
    Effect.repeat(
      Effect.sync(() => node.isConnected),
      { until: (connected) => connected, schedule: Schedule.spaced("5 millis") },
    ),
    node,
  )

const flattened = <A>(found: Option.Option<ReadonlyArray<A>>): ReadonlyArray<A> =>
  Option.toArray(found).flat()

const attached = (self: Handle): Effect.Effect<ReadonlyArray<Dom.Host>> =>
  SubscriptionRef.changes(self[HandleTypeId]).pipe(
    Stream.map(Option.toArray),
    Stream.filter((nodes) => nodes.length > 0),
    Stream.runHead,
    Effect.flatMap((found) => Effect.forEach(flattened(found), onThePage)),
    Effect.timeoutOption(attachWait),
    Effect.map(flattened),
  )

const withNode = (self: Handle, use: (node: Dom.Host) => void): Effect.Effect<void> =>
  Effect.map(attached(self), (nodes) => nodes.forEach(use))

export const focus = (self: Handle): Effect.Effect<void> => withNode(self, Dom.focus)

export const scrollIntoView = (self: Handle): Effect.Effect<void> =>
  withNode(self, Dom.scrollIntoView)

export const measure = (self: Handle): Effect.Effect<Option.Option<Dom.Box>> =>
  Effect.map(SubscriptionRef.get(self[HandleTypeId]), Option.map(Dom.measure))
