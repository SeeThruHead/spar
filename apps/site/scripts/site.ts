import { Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { HttpRouter } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { Server } from "spar"
import { Library } from "../src/api.ts"
import { Site } from "../src/Site.ts"
import { Content } from "../server/content.ts"
import { LibraryLive, layer } from "../server/layers.ts"

const root = new URL("../dist/", import.meta.url).pathname

const guide = new URL("../../../LLMS.md", import.meta.url).pathname

const open = [
  "<!doctype html>",
  '<html lang="en">',
  '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
  "<title>Spar</title>",
  '<meta name="description" content="Spar: a front-end framework built on Effect, for agents that write front-end code.">',
  '<link rel="stylesheet" href="/site.css"></head>',
  '<body><div id="root">',
].join("")

const end = '<script type="module" src="/client.js"></script></body></html>'

const page = (content: Content, url: string) =>
  Effect.map(
    Effect.context(),
    (context) =>
      new Response(
        Stream.toReadableStreamWith(
          Stream.encodeText(
            Server.renderToStream(Site, { layer: layer(content, url), open, close: "</div>", end }),
          ),
          context,
        ),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
  )

const file = (path: string, type: string): Response =>
  new Response(Bun.file(path), { headers: { "content-type": type } })

export const start = async (port: number, hostname: string) => {
  const content = Schema.decodeUnknownSync(Content)(await Bun.file(`${root}content.json`).json())
  const memoMap = Layer.makeMemoMapUnsafe()
  const runtime = ManagedRuntime.make(Layer.empty, { memoMap })
  const rpc = HttpRouter.toWebHandler(
    RpcServer.layerHttp({ group: Library, path: "/rpc", protocol: "http" }).pipe(
      Layer.provide(LibraryLive(content)),
      Layer.provide(RpcSerialization.layerNdjson),
    ),
    { memoMap, disableLogger: true, routerConfig: { ignoreTrailingSlash: true } },
  )

  return Bun.serve({
    port,
    hostname,
    fetch: (request) => {
      const path = new URL(request.url).pathname
      if (path === "/client.js") return file(`${root}client.js`, "text/javascript; charset=utf-8")
      if (path === "/site.css") return file(`${root}site.css`, "text/css; charset=utf-8")
      if (path === "/llms.txt") return file(guide, "text/plain; charset=utf-8")
      if (path === "/rpc" || path === "/rpc/") return rpc.handler(request)

      return runtime.runPromise(page(content, path))
    },
  })
}
