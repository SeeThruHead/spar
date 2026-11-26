import { Effect, Function, Option, Scope } from "effect"
import type { Schema } from "effect"
import { write } from "./internal/action.ts"
import type { UiWrite } from "./internal/action.ts"
import { Backing, backedBy } from "./internal/reactive.ts"
import type { Backed } from "./internal/reactive.ts"
import { writeTo } from "./internal/written.ts"
import * as Timeline from "./Timeline.ts"
import * as Internal from "./internal/uiTree.ts"
import { ViewScope, pathOf } from "./internal/viewScope.ts"

export { Snapshot } from "./internal/uiTree.ts"
export type { Path } from "./internal/uiTree.ts"

export type UiState<A> = Backed<A, Internal.Kept<A>>

export type Write = UiWrite

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

      return Effect.andThen(
        writeTo(kept, "set", value),
        Timeline.note("ui", `${kept.path.join(" / ")} . ${kept.name}`, () =>
          Option.getOrNull(kept.encoded()),
        ),
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
