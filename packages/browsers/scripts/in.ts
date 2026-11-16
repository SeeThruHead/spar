import { engine } from "./launch.ts"

const image = "mcr.microsoft.com/playwright:v1.65.1-noble"

const port = 39_217

const endpoint = `ws://127.0.0.1:${port}/`

const command = Bun.argv.slice(2)

const runtimes = ["podman", "docker"].flatMap((name) => {
  const found = Bun.which(name)

  return found === null ? [] : [found]
})

const wantsContainer = engine() === "webkit" && process.platform === "linux"

const listening = async (left: number): Promise<boolean> => {
  const answered = await fetch(`http://127.0.0.1:${port}/`).then(
    () => true,
    () => false,
  )
  if (answered) return true
  if (left === 0) return false

  await Bun.sleep(500)

  return listening(left - 1)
}

const onHost = (extra: Readonly<Record<string, string>>): Promise<number> =>
  Bun.spawn(command, {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...Bun.env, ...extra },
  }).exited

const withServerFrom = async (program: string, others: ReadonlyArray<string>): Promise<number> => {
  const container = `spar-${engine()}-${process.pid}-${others.length}`
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
    { stdout: "ignore", stderr: "inherit" },
  )
  const stop = async (): Promise<void> => {
    await Bun.spawn([program, "stop", "--time", "2", container], {
      stdout: "ignore",
      stderr: "ignore",
    }).exited
    await server.exited
  }
  const up = await Promise.race([listening(480), server.exited.then(() => false)])
  if (up) return onHost({ SPAR_BROWSER_SERVER: endpoint }).finally(stop)

  await stop()
  console.error(`${program} could not start the ${engine()} server from ${image}`)

  return inContainer(others)
}

const inContainer = (programs: ReadonlyArray<string>): Promise<number> => {
  const [first, ...others] = programs
  if (first === undefined) return onHost({})

  return withServerFrom(first, others)
}

const run = (): Promise<number> => {
  if (!wantsContainer) return onHost({})
  if (Bun.env["SPAR_BROWSER_SERVER"] !== undefined) return onHost({})

  return inContainer(runtimes)
}

process.exit(await run())
