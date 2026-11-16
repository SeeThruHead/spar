import { engine } from "./launch.ts"

const image = "mcr.microsoft.com/playwright:v1.65.1-noble"

const port = 39_217

const endpoint = `ws://127.0.0.1:${port}/`

const container = `spar-${engine()}-${process.pid}`

const command = Bun.argv.slice(2)

const runtime = Bun.which("podman") ?? Bun.which("docker")

const wantsContainer = engine() === "webkit" && process.platform === "linux"

const listening = async (left: number): Promise<void> => {
  const answered = await fetch(`http://127.0.0.1:${port}/`).then(
    () => true,
    () => false,
  )
  if (answered) return
  if (left === 0) throw new Error(`The ${engine()} server in ${image} did not start`)

  await Bun.sleep(500)

  return listening(left - 1)
}

const inContainer = async (program: string): Promise<number> => {
  const server = Bun.spawn(
    [
      program,
      "run",
      "--rm",
      "--name",
      container,
      "--network=host",
      "--ipc=host",
      image,
      "npx",
      "-y",
      "playwright@1.65.1",
      "run-server",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
    ],
    { stdout: "ignore", stderr: "ignore" },
  )

  return listening(480)
    .catch(async (failed: unknown) => {
      await Bun.spawn([program, "logs", "--tail", "40", container], {
        stdout: "inherit",
        stderr: "inherit",
      }).exited

      throw failed
    })
    .then(
      () =>
        Bun.spawn(command, {
          stdio: ["inherit", "inherit", "inherit"],
          env: { ...Bun.env, SPAR_BROWSER_SERVER: endpoint },
        }).exited,
    )
    .finally(async () => {
      await Bun.spawn([program, "stop", "--time", "2", container], {
        stdout: "ignore",
        stderr: "ignore",
      }).exited
      await server.exited
    })
}

const onHost = (): Promise<number> =>
  Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"] }).exited

const run = (): Promise<number> => {
  if (!wantsContainer) return onHost()
  if (runtime === null) return onHost()
  if (Bun.env["SPAR_BROWSER_SERVER"] !== undefined) return onHost()

  return inContainer(runtime)
}

process.exit(await run())
