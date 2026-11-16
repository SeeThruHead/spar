import { start } from "./site.ts"

const server = start(Number(Bun.env["PORT"] ?? 4182))

console.log(`The server-rendered shop is on http://127.0.0.1:${server.port}`)
