import { collector, start } from "./site.ts"

const server = start(Number(Bun.env["PORT"] ?? 4173))

console.log(`Serving dist/ on http://127.0.0.1:${server.port}/`)
console.log(
  collector === undefined
    ? "Traces are dropped (set OTLP_ENDPOINT to forward them)"
    : `Traces are forwarded to ${collector}`,
)
