import { Effect, Schema } from "effect"
import { Query } from "spar"

export class Prices extends Query.Tag<Prices>()("forbidden/Prices", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Schema.Never,
  refetchEvery: 1000,
  load: () => Effect.succeed(3),
}) {}
