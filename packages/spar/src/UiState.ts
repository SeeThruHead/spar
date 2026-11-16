import { Effect, Function, SubscriptionRef } from "effect"
import { write } from "./internal/action.ts"
import type { UiWrite } from "./internal/action.ts"
import { fromSubscriptionRef } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { ViewScope } from "./internal/viewScope.ts"

const TypeId: unique symbol = Symbol.for("~spar/UiState")

export type UiState<A> = Reactive<A> & {
  readonly [TypeId]: SubscriptionRef.SubscriptionRef<A>
}

export type Write = UiWrite

type Plain<A> = A extends Reactive<unknown> ? never : A

export const make = Effect.fnUntraced(function* <A>(initial: Plain<A>) {
  yield* ViewScope
  const ref = yield* SubscriptionRef.make<A>(initial)

  return { ...fromSubscriptionRef(ref), [TypeId]: ref } satisfies UiState<A>
})

export const set: {
  <A>(value: A): (self: UiState<A>) => Write
  <A>(self: UiState<A>, value: A): Write
} = Function.dual(2, <A>(self: UiState<A>, value: A): Write =>
  write(SubscriptionRef.set(self[TypeId], value)),
)

export const update: {
  <A>(f: (value: A) => A): (self: UiState<A>) => Write
  <A>(self: UiState<A>, f: (value: A) => A): Write
} = Function.dual(2, <A>(self: UiState<A>, f: (value: A) => A): Write =>
  write(SubscriptionRef.update(self[TypeId], f)),
)
