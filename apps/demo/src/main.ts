import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { Otlp } from "effect/observability"
import { KeyValueStore } from "effect/persistence"
import { App } from "spar"
import * as DevtoolsLink from "@spar/devtools-mcp/client"
import { Root, layer } from "./Root.ts"

const telemetry = Otlp.layerJson({
  baseUrl: `${location.origin}/otlp`,
  resource: { serviceName: "spar-demo" },
  tracerExportInterval: "1 second",
}).pipe(Layer.provide(FetchHttpClient.layer))

const devtoolsServer = new URLSearchParams(location.search).get("devtools")

const linked =
  devtoolsServer === null
    ? layer
    : Layer.merge(layer, Layer.provide(DevtoolsLink.layer({ url: devtoolsServer }), layer))

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Root, {
    target,
    layer: Layer.provide(
      linked,
      KeyValueStore.layerStorage(() => localStorage),
    ),
  })
})

Effect.runFork(Effect.provide(program, telemetry))
