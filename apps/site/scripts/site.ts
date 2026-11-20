import { Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { HttpRouter } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { Server } from "spar"
import { Library } from "../src/api.ts"
import { Site, titleOf } from "../src/Site.ts"
import { Content } from "../server/content.ts"
import { LibraryLive, layer } from "../server/layers.ts"

const root = new URL("../dist/", import.meta.url).pathname

const guide = new URL("../../../LLMS.md", import.meta.url).pathname

const shelf = new URL("../public/", import.meta.url).pathname

const escaped = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

const titleFor = (content: Content, url: string): string => {
  const slug = /^\/docs\/([a-z0-9-]+)/.exec(url)?.[1]

  return titleOf(content.pages.find((page) => page.slug === slug)?.title)
}

const opening = (title: string) =>
  [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escaped(title)}</title>`,
    '<meta name="description" content="Spar: a front-end framework built on Effect, for agents that write front-end code.">',
    '<link rel="stylesheet" href="/site.css"></head>',
    '<body><div id="root">',
  ].join("")

const endWith = (script: string): string =>
  `<script type="module" src="/${script}"></script></body></html>`

const withTools = (request: Request): boolean =>
  (request.headers.get("cookie") ?? "").includes("spar-devtools=on")

const page = (content: Content, url: string, tools: boolean) =>
  Effect.map(
    Effect.context(),
    (context) =>
      new Response(
        Stream.toReadableStreamWith(
          Stream.encodeText(
            Server.renderToStream(Site, {
              layer: layer(content, url),
              open: opening(titleFor(content, url)),
              close: "</div>",
              end: endWith(tools ? "entry-devtools.js" : "entry.js"),
            }),
          ),
          context,
        ),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
  )

const toggled = (request: Request): Response =>
  new Response(null, {
    status: 303,
    headers: {
      location: new URL(request.headers.get("referer") ?? "/", request.url).pathname,
      "set-cookie": `spar-devtools=${withTools(request) ? "off" : "on"}; Path=/; SameSite=Lax`,
    },
  })

const scripts: ReadonlySet<string> = new Set(["/entry.js", "/entry-devtools.js"])

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
      if (scripts.has(path))
        return file(`${root}${path.slice(1)}`, "text/javascript; charset=utf-8")
      if (path === "/site.css") return file(`${root}site.css`, "text/css; charset=utf-8")
      if (path === "/spar-promo.mp4") return file(`${shelf}spar-promo.mp4`, "video/mp4")
      if (path === "/spar-promo.jpg") return file(`${shelf}spar-promo.jpg`, "image/jpeg")
      if (path === "/llms.txt") return file(guide, "text/plain; charset=utf-8")
      if (path === "/devtools/toggle") return toggled(request)
      if (path === "/rpc" || path === "/rpc/") return rpc.handler(request)

      return runtime.runPromise(page(content, path, withTools(request)))
    },
  })
}
