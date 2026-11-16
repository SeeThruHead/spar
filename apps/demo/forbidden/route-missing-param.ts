import { Effect } from "effect"
import { Router } from "spar"

const thread = Router.route("/threads/:id")

export const openThread = Effect.gen(function* () {
  const router = yield* Router.Router

  yield* router.go(thread, {})
})
