import "@spar/ui/styles.css"
import "./app.css"
import { Effect, Layer } from "effect"
import { App, Router } from "spar"
import { Toast } from "@spar/ui"
import { Shell } from "./Shell.ts"

const program = Effect.gen(function* () {
  const target = yield* Effect.fromNullishOr(document.getElementById("root"))

  return yield* App.mount(Shell, {
    target,
    layer: Layer.mergeAll(Router.Router.layerBrowser, Toast.Toasts.layer),
  })
})

Effect.runFork(program)
