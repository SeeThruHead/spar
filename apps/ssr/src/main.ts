import { Effect } from "effect"
import { App } from "spar"
import { Shop, layer } from "./Shop.ts"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.hydrate(Shop, {
    target,
    layer,
    shown: Effect.sync(() => target.setAttribute("data-ready", "")),
  })
})

Effect.runFork(program)
