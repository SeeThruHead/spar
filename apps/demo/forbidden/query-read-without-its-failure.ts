import { Effect, Schema } from "effect"
import { Query } from "spar"

export class Orders extends Query.Tag<Orders>()("forbidden/Orders", {
  input: Schema.Void,
  success: Schema.Array(Schema.String),
  failure: Schema.Struct({ unreachable: Schema.String }),
  load: () => Effect.succeed(["paper"]),
}) {}

export const shownOrders = Effect.gen(function* () {
  const orders = yield* Orders.ask()

  return Query.valueOf(orders)
})
