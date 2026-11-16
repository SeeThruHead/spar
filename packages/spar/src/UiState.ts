import { Effect, Function } from "effect"
import { write } from "./internal/action.ts"
import type { UiWrite } from "./internal/action.ts"
import * as Cell from "./internal/cell.ts"
import { Backing, fromCell } from "./internal/reactive.ts"
import type { Backed, Reactive } from "./internal/reactive.ts"
import { ViewScope } from "./internal/viewScope.ts"

export type UiState<A> = Backed<A>

export type Write = UiWrite

type Plain<A> = A extends Reactive<unknown> ? never : A

export const make = <A>(initial: Plain<A>): Effect.Effect<UiState<A>, never, ViewScope> =>
  ViewScope.use(() => Effect.sync(() => fromCell(Cell.make<A>(initial))))

export const set: {
  <A>(value: A): (self: UiState<A>) => Write
  <A>(self: UiState<A>, value: A): Write
} = Function.dual(2, <A>(self: UiState<A>, value: A): Write =>
  write(Effect.sync(() => self[Backing].write(value))),
)

export const update: {
  <A>(f: (value: A) => A): (self: UiState<A>) => Write
  <A>(self: UiState<A>, f: (value: A) => A): Write
} = Function.dual(2, <A>(self: UiState<A>, f: (value: A) => A): Write =>
  write(Effect.sync(() => self[Backing].write(f(self[Backing].read())))),
)
