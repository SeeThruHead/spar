import { Effect, Layer } from "effect"
import { SecureRandom } from "effect/crypto"
import { App, Router } from "spar"
import { Shell, queries } from "./Nav.ts"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Shell, {
    target,
    layer: Layer.merge(queries, Router.Router.layerBrowser).pipe(
      Layer.provide(SecureRandom.layerWebCrypto),
    ),
  })
})

Effect.runFork(program)
