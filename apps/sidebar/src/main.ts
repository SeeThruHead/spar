import "@spar/ui/styles.css"
import "./app.css"
import { Effect, Layer } from "effect"
import { SecureRandom } from "effect/crypto"
import { FetchHttpClient } from "effect/http"
import { Otlp } from "effect/observability"
import { KeyValueStore } from "effect/persistence"
import { App, Outbox, Router } from "spar"
import { Toast } from "@spar/ui"
import { BoardStoreLive } from "./BoardStore.ts"
import { Server } from "./Server.ts"
import { Shell } from "./Shell.ts"

const telemetry = Otlp.layerJson({
  baseUrl: `${location.origin}/otlp`,
  resource: { serviceName: "spar-sidebar" },
  tracerExportInterval: "1 second",
}).pipe(Layer.provide(FetchHttpClient.layer))

const layer = BoardStoreLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Server.layer,
      Outbox.Outbox.layer,
      Router.Router.layerBrowser,
      Toast.Toasts.layer,
    ),
  ),
  Layer.provide(Outbox.layerBrowser),
  Layer.provide(SecureRandom.layerWebCrypto),
  Layer.provide(KeyValueStore.layerStorage(() => localStorage)),
)

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Shell, { target, layer })
})

Effect.runFork(Effect.provide(program, telemetry))
