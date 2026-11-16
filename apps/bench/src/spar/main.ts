import { Effect, Layer } from "effect"
import { SecureRandom } from "effect/crypto"
import { App } from "spar"
import { Table } from "./Table.ts"
import { TableStore } from "./TableStore.ts"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Table, {
    target,
    layer: Layer.provide(TableStore.layer(), SecureRandom.layerWebCrypto),
  })
})

Effect.runFork(program)
