import { Effect, Option, Schema } from "effect"
import { Query, Reactive } from "spar"

class Users extends Query.Tag<Users>()("forbidden/Users", {
  input: Schema.Void,
  success: Schema.Array(Schema.String),
  failure: Schema.String,
  load: () => Effect.succeed(["ada"]),
}) {}

class Stock extends Query.Tag<Stock>()("forbidden/Stock", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Schema.String,
  load: () => Effect.succeed(3),
}) {}

export const chained = Effect.gen(function* () {
  const users = yield* Users.ask()

  return yield* Stock.ask(
    Reactive.map(users.value, (loaded) =>
      loaded === null ? Option.none<void>() : Option.some<void>(undefined),
    ),
  )
})
