import { createServer } from "vite"

const root = new URL("..", import.meta.url).pathname

const backendOrigin = "http://127.0.0.1:4183"

const backend = Bun.spawn(["bun", "scripts/backend.ts"], {
  cwd: root,
  env: { ...Bun.env, PORT: "4183" },
  stdout: "ignore",
  stderr: "inherit",
})

Reflect.set(process.env, "SIDEBAR_BACKEND", backendOrigin)

const server = await createServer({ root, logLevel: "error", server: { port: 4181 } })

await server.listen()

console.log(
  [
    `The showcase is at ${server.resolvedUrls?.local[0] ?? "http://127.0.0.1:4181/"}`,
    `Its backend (Effect RPC, traced) is at ${backendOrigin}`,
    "Press the Devtools button in the page for the log, fork, step, the inspector and the traces.",
    "Stop with Ctrl-C.",
  ].join("\n"),
)

process.on("SIGINT", () => {
  backend.kill()
  process.exit(0)
})
