import { Effect, Function, Option, Queue, Scope, Stream } from "effect"
import type { Schema } from "effect"
import { write } from "./internal/action.ts"
import type { UiWrite } from "./internal/action.ts"
import { Backing, backedBy } from "./internal/reactive.ts"
import type { Backed } from "./internal/reactive.ts"
import * as Timeline from "./Timeline.ts"
import * as Internal from "./internal/uiTree.ts"
import { ViewScope, pathOf } from "./internal/viewScope.ts"

export { Entry, Snapshot } from "./internal/uiTree.ts"
export type { Change, Path } from "./internal/uiTree.ts"

export type UiState<A> = Backed<A, Internal.Kept<A>>

export type Write = UiWrite

export const Tree = Internal.UiTree

export const makeTree = (): Internal.Tree => new Internal.Tree()

export const make = <A, Encoded>(
  name: string,
  schema: Schema.Codec<A, Encoded>,
  initial: NoInfer<A>,
): Effect.Effect<UiState<A>, never, ViewScope> =>
  ViewScope.use((mounted) => {
    const { place, fresh } = mounted.tree.enter(mounted, () => pathOf(mounted))
    const held = Effect.sync(() =>
      backedBy<A, Internal.Kept<A>>(mounted.tree.hold(place, name, schema, initial)),
    )
    if (!fresh) return held

    return Effect.andThen(
      Scope.addFinalizer(
        mounted.scope,
        Effect.sync(() => mounted.tree.leave(place)),
      ),
      held,
    )
  })

const written = <A>(self: UiState<A>, next: () => A): Write => {
  const kept = self[Backing]

  return write(
    Effect.suspend(() => {
      const value = next()
      if (Object.is(kept.read(), value)) return Effect.void

      kept.write(value)

      return Timeline.note("ui", `${kept.path.join(" / ")} . ${kept.name}`, () =>
        Option.getOrNull(kept.encoded()),
      )
    }),
  )
}

export const set: {
  <A>(value: A): (self: UiState<A>) => Write
  <A>(self: UiState<A>, value: A): Write
} = Function.dual(2, <A>(self: UiState<A>, value: A): Write => written(self, () => value))

export const update: {
  <A>(f: (value: A) => A): (self: UiState<A>) => Write
  <A>(self: UiState<A>, f: (value: A) => A): Write
} = Function.dual(2, <A>(self: UiState<A>, f: (value: A) => A): Write =>
  written(self, () => f(self[Backing].read())),
)

export const snapshot: Effect.Effect<Internal.Snapshot> = Effect.map(Effect.service(Tree), (tree) =>
  tree.snapshot(),
)

export const restore = (taken: Internal.Snapshot): Effect.Effect<void> =>
  Effect.map(Effect.service(Tree), (tree) => tree.restore(taken))

export const put = (
  path: Internal.Path,
  name: string,
  value: Schema.Json,
): Effect.Effect<boolean> => Effect.map(Effect.service(Tree), (tree) => tree.put(path, name, value))

export const changes: Stream.Stream<Internal.Change> = Stream.unwrap(
  Effect.map(Effect.service(Tree), (tree) =>
    Stream.callback<Internal.Change>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => tree.subscribe((change) => Queue.offerUnsafe(queue, change))),
        (stop) => Effect.sync(stop),
      ),
    ),
  ),
)
