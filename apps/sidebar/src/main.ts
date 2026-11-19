import "@spar/ui/styles.css"
import "./app.css"
import { Effect, Layer, Option } from "effect"
import { SecureRandom } from "effect/crypto"
import { Otlp } from "effect/observability"
import { KeyValueStore } from "effect/persistence"
import { App, Backend, Outbox, Router, Tabs } from "spar"
import { Toast } from "@spar/ui"
import { BoardStoreLive } from "./BoardStore.ts"
import { Server } from "./server/Server.ts"
import { Shell } from "./Shell.ts"

const telemetry = Otlp.layerJson({
  baseUrl: `${location.origin}/otlp`,
  resource: { serviceName: "spar-sidebar" },
  tracerExportInterval: "1 second",
}).pipe(Layer.provide(Backend.layerTelemetry))

const server = Option.match(
  Option.fromNullishOr(
    document.querySelector('meta[name="sidebar-backend"]')?.getAttribute("content"),
  ),
  {
    onNone: () => Server.layer,
    onSome: (path) =>
      Layer.provide(Server.layerRemote(new URL(path, location.origin).href), Backend.layer),
  },
)

const layer = BoardStoreLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(server, Outbox.Outbox.layer, Router.Router.layerBrowser, Toast.Toasts.layer),
  ),
  Layer.provide(Outbox.layerBrowser),
  Layer.provide(Tabs.layerBrowser),
  Layer.provide(SecureRandom.layerWebCrypto),
  Layer.provide(KeyValueStore.layerStorage(() => localStorage)),
)

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Shell, { target, layer })
})

Effect.runFork(Effect.provide(program, telemetry))
