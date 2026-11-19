import { Context, Effect, Layer, ManagedRuntime, Option, Ref, Stream } from "effect"
import { HttpRouter } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { Server } from "spar"
import * as Spans from "spar/devtools/spans"
import { crates } from "../server/database.ts"
import { ShelfLive, layer } from "../server/layers.ts"
import { Shelf } from "../src/api.ts"
import { Site } from "../src/Site.ts"

const root = new URL("../dist/", import.meta.url).pathname

const open = [
  "<!doctype html>",
  '<html lang="en">',
  '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Corner shop</title></head>',
  '<body><div id="root">',
].join("")

const end = '<script type="module" src="/client.js"></script></body></html>'

class FromThePage extends Context.Service<FromThePage, Ref.Ref<ReadonlyArray<Spans.Recorded>>>()(
  "ssr/FromThePage",
) {
  static readonly layer = Layer.effect(FromThePage, Ref.make<ReadonlyArray<Spans.Recorded>>([]))
}

const json = (value: string): Response =>
  new Response(value, { headers: { "content-type": "application/json" } })

const kept = Effect.fnUntraced(function* (traceId: string) {
  const buffer = yield* Spans.SpanBuffer
  const holder = yield* FromThePage
  const told = yield* Ref.get(holder)

  return json(
    Spans.textOf([...buffer.ofTrace(traceId), ...told.filter((span) => span.traceId === traceId)]),
  )
})

const heard = Effect.fnUntraced(function* (text: string) {
  const holder = yield* FromThePage

  yield* Ref.set(
    holder,
    Option.getOrElse(Spans.fromText(text), () => []),
  )

  return new Response(null, { status: 204 })
})

const page = (url: string) =>
  Effect.map(
    Effect.context(),
    (context) =>
      new Response(
        Stream.toReadableStreamWith(
          Stream.encodeText(
            Server.renderToStream(Site, { layer: layer(url), open, close: "</div>", end }),
          ),
          context,
        ),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
  )

const client = '<script type="module" async src="/client.js"></script>'

const inPieces = (url: string) =>
  Effect.map(
    Effect.context(),
    (context) =>
      new Response(
        Stream.toReadableStreamWith(
          Stream.encodeText(
            Server.renderInPieces(Site, {
              layer: layer(url, "300 millis"),
              open,
              close: "</div>",
              script: client,
              end: "</body></html>",
            }),
          ),
          context,
        ),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
  )

const stock = Effect.map(crates(), (count) => json(`{"count":${count}}`))

export const start = (port: number) => {
  const memoMap = Layer.makeMemoMapUnsafe()
  const shared = Layer.merge(Spans.layer(), FromThePage.layer)
  const runtime = ManagedRuntime.make(shared, { memoMap })
  const rpc = HttpRouter.toWebHandler(
    RpcServer.layerHttp({ group: Shelf, path: "/rpc", protocol: "http" }).pipe(
      Layer.provide(ShelfLive),
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provideMerge(shared),
    ),
    { memoMap, disableLogger: true, routerConfig: { ignoreTrailingSlash: true } },
  )

  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      const path = new URL(request.url).pathname
      if (path === "/client.js") return new Response(Bun.file(`${root}client.js`))
      if (path === "/stock") return runtime.runPromise(stock)
      if (path === "/client-spans") return runtime.runPromise(heard(await request.text()))
      if (path.startsWith("/spans/")) return runtime.runPromise(kept(path.slice(7)))
      if (path === "/rpc" || path === "/rpc/") return rpc.handler(request)
      if (path.startsWith("/slow/")) return runtime.runPromise(inPieces(path))
      if (path === "/" || path.startsWith("/shelf/")) return runtime.runPromise(page(path))

      return new Response("Not found", { status: 404 })
    },
  })
}
