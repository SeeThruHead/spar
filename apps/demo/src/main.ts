import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { Otlp } from "effect/observability"
import { KeyValueStore } from "effect/persistence"
import { App } from "spar"
import { Root, layer } from "./Root.ts"

const telemetry = Otlp.layerJson({
  baseUrl: `${location.origin}/otlp`,
  resource: { serviceName: "spar-demo" },
  tracerExportInterval: "1 second",
}).pipe(Layer.provide(FetchHttpClient.layer))

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

Effect.runFork(Effect.provide(program, telemetry))
