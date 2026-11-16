import { Effect, Layer } from "effect"
import { KeyValueStore } from "effect/persistence"
import { App } from "spar"
import { Root, layer } from "./Root.ts"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Root, {
    target,
    layer: Layer.provide(
      layer,
      KeyValueStore.layerStorage(() => localStorage),
    ),
  })
})

Effect.runFork(program)
