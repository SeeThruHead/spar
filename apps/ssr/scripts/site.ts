import { Effect } from "effect"
import { Server } from "spar"
import { Shop, layer } from "../src/Shop.ts"

const root = new URL("../dist/", import.meta.url).pathname

const document = (html: string): string =>
  [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Corner shop</title></head>',
    `<body><div id="root">${html}</div><script type="module" src="/client.js"></script></body>`,
    "</html>",
  ].join("")

const page = async (): Promise<Response> =>
  new Response(document(await Effect.runPromise(Server.renderToString(Shop, { layer }))), {
    headers: { "content-type": "text/html; charset=utf-8" },
  })

export const start = (port: number) =>
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const path = new URL(request.url).pathname
      if (path === "/client.js") return new Response(Bun.file(`${root}client.js`))
      if (path === "/") return page()

      return new Response("Not found", { status: 404 })
    },
  })
