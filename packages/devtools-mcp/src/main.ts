import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { layer } from "./server.ts"

const port = Number(Bun.env["SPAR_DEVTOOLS_PORT"] ?? 4188)

Layer.launch(
  HttpRouter.serve(layer).pipe(Layer.provide(BunHttpServer.layer({ port, hostname: "127.0.0.1" }))),
).pipe(BunRuntime.runMain)
