import { start } from "./site.ts"

const server = await start(Number(Bun.env["PORT"] ?? 4190), Bun.env["HOST"] ?? "127.0.0.1")

console.log(`The Spar site is on http://${server.hostname}:${server.port}`)
