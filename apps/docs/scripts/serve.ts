const root = new URL("../dist/", import.meta.url).pathname

const server = Bun.serve({
  port: Number(Bun.env["PORT"] ?? 4183),
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}${path === "/" ? "index.html" : path.slice(1)}`)

    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

console.log(`The docs are on http://127.0.0.1:${server.port}`)
