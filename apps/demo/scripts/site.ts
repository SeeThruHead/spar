const root = new URL("../dist/", import.meta.url).pathname

export const collector = Bun.env["OTLP_ENDPOINT"]

const forward = (request: Request, path: string, upstream: string): Promise<Response> =>
  fetch(`${upstream}${path}`, {
    method: request.method,
    headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
    body: request.body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => new Response("The collector did not answer", { status: 502 }))

const telemetry = (request: Request, path: string): Promise<Response> =>
  collector === undefined
    ? Promise.resolve(new Response(null, { status: 204 }))
    : forward(request, path, collector)

const page = async (path: string): Promise<Response> => {
  const file = Bun.file(`${root}${path === "/" ? "index.html" : path.slice(1)}`)

  return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
}

export const start = (port: number) =>
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const path = new URL(request.url).pathname

      return path.startsWith("/otlp/") ? telemetry(request, path.slice(5)) : page(path)
    },
  })
