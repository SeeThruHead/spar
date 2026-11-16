import { engine } from "./launch.ts"

const image = "mcr.microsoft.com/playwright:v1.65.1-noble"

const port = 39_217

const endpoint = `ws://127.0.0.1:${port}/`

const container = `spar-${engine()}-${process.pid}`

const command = Bun.argv.slice(2)

const needsContainer = engine() === "webkit" && process.platform === "linux"

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

const inContainer = async (): Promise<number> => {
  const server = Bun.spawn(
    [
      "podman",
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

  return listening(120)
    .then(
      () =>
        Bun.spawn(command, {
          stdio: ["inherit", "inherit", "inherit"],
          env: { ...Bun.env, SPAR_BROWSER_SERVER: endpoint },
        }).exited,
    )
    .finally(async () => {
      await Bun.spawn(["podman", "stop", "--time", "2", container], {
        stdout: "ignore",
        stderr: "ignore",
      }).exited
      await server.exited
    })
}

const onHost = (): Promise<number> =>
  Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"] }).exited

process.exit(await (needsContainer ? inContainer() : onHost()))
