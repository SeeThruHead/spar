import { Effect, Schema } from "effect"
import { Router } from "spar"

const thread = Router.route("/threads/:id", Schema.Struct({ id: Schema.String }))

export const openThread = Effect.gen(function* () {
  const router = yield* Router.Router

  yield* router.go(thread, {})
})
