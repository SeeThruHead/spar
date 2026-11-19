import { Option } from "effect"
import type { Effect, Scope } from "effect"
import * as Cell from "./cell.ts"
import type { Frame } from "./frame.ts"

export type Hook = {
  readonly wrap: <A, E, R>(app: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly attach: Effect.Effect<void, never, Scope.Scope | Frame>
}

export const installed = Cell.make<Option.Option<Hook>>(Option.none())
