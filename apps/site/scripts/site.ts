import { Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Server } from "spar"
import { Site, titleOf } from "../src/Site.ts"
import { Content } from "../src/content.ts"
import { layer } from "../server/layers.ts"

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

const loader =
  '<script type="module">import(localStorage.getItem("spar-devtools") === "on" ? "/entry-devtools.js" : "/entry.js")</script></body></html>'

export const toggle = [
  "<!doctype html>",
  '<html lang="en"><head><meta charset="utf-8"><title>Devtools</title>',
  "<script>",
  'localStorage.setItem("spar-devtools", localStorage.getItem("spar-devtools") === "on" ? "off" : "on");',
  'const back = document.referrer.startsWith(location.origin) ? new URL(document.referrer).pathname : "/";',
  "location.replace(back);",
  "</script></head><body></body></html>",
].join("")

export const pageHtml = (content: Content, url: string): Effect.Effect<string> =>
  Stream.mkString(
    Server.renderToStream(Site, {
      layer: layer(content, url),
      open: opening(titleFor(content, url)),
      close: "</div>",
      end: loader,
    }),
  )

export const contentIn = async (): Promise<Content> =>
  Schema.decodeUnknownSync(Content)(await Bun.file(`${root}content.json`).json())

const file = (path: string, type: string): Response =>
  new Response(Bun.file(path), { headers: { "content-type": type } })

const html = (text: string): Response =>
  new Response(text, { headers: { "content-type": "text/html; charset=utf-8" } })

const scripts: ReadonlySet<string> = new Set(["/entry.js", "/entry-devtools.js"])

const served = (path: string): Response | undefined => {
  if (scripts.has(path)) return file(`${root}${path.slice(1)}`, "text/javascript; charset=utf-8")
  if (path === "/site.css") return file(`${root}site.css`, "text/css; charset=utf-8")
  if (path === "/search.json") return file(`${root}search.json`, "application/json")
  if (/^\/pages\/[a-z0-9-]+\.json$/.test(path))
    return file(`${root}${path.slice(1)}`, "application/json")
  if (path === "/spar-promo.mp4") return file(`${shelf}spar-promo.mp4`, "video/mp4")
  if (path === "/spar-promo.jpg") return file(`${shelf}spar-promo.jpg`, "image/jpeg")
  if (path === "/llms.txt") return file(guide, "text/plain; charset=utf-8")
  if (path === "/devtools/toggle") return html(toggle)

  return undefined
}

export const start = async (port: number, hostname: string) => {
  const content = await contentIn()
  const runtime = ManagedRuntime.make(Layer.empty)

  return Bun.serve({
    port,
    hostname,
    fetch: (request) => {
      const path = new URL(request.url).pathname

      return served(path) ?? runtime.runPromise(Effect.map(pageHtml(content, path), html))
    },
  })
}
