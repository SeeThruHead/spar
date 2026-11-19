import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http"
import type { HttpServerRequest } from "effect/http"
import { Otlp } from "effect/observability"
import { RpcSerialization, RpcServer } from "effect/rpc"
import * as Spans from "spar/devtools/spans"
import { Agents } from "../src/api.ts"
import { AgentsLive } from "../server/handlers.ts"

const port = Number(Bun.env["PORT"] ?? 4182)

const collector = Bun.env["OTLP_ENDPOINT"]

const dist = new URL("../dist/", import.meta.url).pathname

const pathOf = (request: HttpServerRequest.HttpServerRequest): string =>
  new URL(request.url, "http://sidebar.invalid").pathname

const Rpcs = RpcServer.layerHttp({ group: Agents, path: "/rpc", protocol: "http" }).pipe(
  Layer.provide(AgentsLive),
  Layer.provide(RpcSerialization.layerNdjson),
)

const page = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
  const path = pathOf(request)
  const asset = Bun.file(`${dist}${path.slice(1)}`)
  const found = yield* Effect.promise(() => asset.exists())
  if (found && path !== "/") return HttpServerResponse.fromWeb(new Response(asset))

  const html = yield* Effect.promise(() => Bun.file(`${dist}index.html`).text())

  return HttpServerResponse.text(
    html.replace("</head>", '<meta name="sidebar-backend" content="/rpc" /></head>'),
    { contentType: "text/html" },
  )
})

const relayed = (
  upstream: string,
  path: string,
  kind: string,
  body: ArrayBuffer,
): Promise<Response> =>
  fetch(`${upstream}${path}`, {
    method: "POST",
    headers: { "content-type": kind },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => new Response("The collector did not answer", { status: 502 }))

const forwarded = Effect.fnUntraced(function* (
  request: HttpServerRequest.HttpServerRequest,
  upstream: string,
) {
  const body = yield* Effect.orDie(request.arrayBuffer)
  const kind = request.headers["content-type"] ?? "application/json"
  const answer = yield* Effect.promise(() =>
    relayed(upstream, pathOf(request).slice(5), kind, body),
  )

  return HttpServerResponse.fromWeb(answer)
})

const telemetry = (request: HttpServerRequest.HttpServerRequest) =>
  collector === undefined
    ? Effect.succeed(HttpServerResponse.empty({ status: 204 }))
    : forwarded(request, collector)

const exported =
  collector === undefined
    ? Layer.empty
    : Otlp.layerJson({
        baseUrl: collector,
        resource: { serviceName: "spar-sidebar-backend" },
        tracerExportInterval: "1 second",
      }).pipe(Layer.provide(FetchHttpClient.layer))

const app = Layer.mergeAll(
  Rpcs,
  Spans.route,
  Spans.recentRoute,
  HttpRouter.add("POST", "/otlp/*", telemetry),
  HttpRouter.add("GET", "/*", page),
)

Layer.launch(
  HttpRouter.serve(app, { disableLogger: true }).pipe(
    Layer.provide(BunHttpServer.layer({ port, hostname: "127.0.0.1" })),
    Layer.provide(Layer.provide(Spans.layer(), exported)),
  ),
).pipe(BunRuntime.runMain)
