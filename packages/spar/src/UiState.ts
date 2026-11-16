import { Effect, Function } from "effect"
import { write } from "./internal/action.ts"
import type { UiWrite } from "./internal/action.ts"
import * as Cell from "./internal/cell.ts"
import { fromCell } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { ViewScope } from "./internal/viewScope.ts"

const TypeId: unique symbol = Symbol.for("~spar/UiState")

export type UiState<A> = Reactive<A> & {
  readonly [TypeId]: Cell.Cell<A>
}

export type Write = UiWrite

type Plain<A> = A extends Reactive<unknown> ? never : A

export const make = <A>(initial: Plain<A>): Effect.Effect<UiState<A>, never, ViewScope> =>
  ViewScope.use(() =>
    Effect.sync(() => {
      const cell = Cell.make<A>(initial)

      return { ...fromCell(cell), [TypeId]: cell }
    }),
  )

export const set: {
  <A>(value: A): (self: UiState<A>) => Write
  <A>(self: UiState<A>, value: A): Write
} = Function.dual(2, <A>(self: UiState<A>, value: A): Write =>
  write(Effect.sync(() => self[TypeId].write(value))),
)

export const update: {
  <A>(f: (value: A) => A): (self: UiState<A>) => Write
  <A>(self: UiState<A>, f: (value: A) => A): Write
} = Function.dual(2, <A>(self: UiState<A>, f: (value: A) => A): Write =>
  write(Effect.sync(() => self[TypeId].write(f(self[TypeId].read())))),
)
