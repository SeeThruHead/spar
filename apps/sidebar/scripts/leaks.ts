import { freePort } from "@spar/browsers"
import { chromium } from "playwright"
import type { CDPSession, Page } from "playwright"

const cycles = Number(Bun.argv[2] ?? 40)
const warmups = 5
const nodesAllowance = 30

const port = await freePort()

const origin = `http://127.0.0.1:${port}`

const backend = Bun.spawn(["bun", "scripts/backend.ts"], {
  env: { ...Bun.env, PORT: String(port) },
  stdout: "ignore",
  stderr: "inherit",
})

const ready = async (left: number): Promise<boolean> => {
  const up = await fetch(`${origin}/spans`).then(
    () => true,
    () => false,
  )
  if (up || left === 0) return up

  await Bun.sleep(100)

  return ready(left - 1)
}

const cycle = async (page: Page): Promise<void> => {
  await page.getByRole("link", { name: "Open a page five segments deep" }).click()
  await page.getByLabel("Author status").filter({ hasText: "loaded" }).waitFor()
  await page.getByRole("link", { name: /Trip planning/ }).click()
  await page.getByRole("heading", { level: 1, name: "Trip planning" }).waitFor()
}

const repeat = (times: number, page: Page): Promise<void> =>
  Array.from({ length: times }).reduce<Promise<void>>(
    (done) => done.then(() => cycle(page)),
    Promise.resolve(),
  )

const nodes = async (session: CDPSession): Promise<number> => {
  await session.send("HeapProfiler.collectGarbage")
  await session.send("HeapProfiler.collectGarbage")

  const { metrics } = await session.send("Performance.getMetrics")

  return metrics.find((entry) => entry.name === "Nodes")?.value ?? 0
}

await ready(50)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const session = await page.context().newCDPSession(page)

await session.send("Performance.enable")
await page.goto(origin)
await repeat(warmups, page)

const before = await nodes(session)

await repeat(cycles, page)

const after = await nodes(session)

await browser.close()
backend.kill()

console.log(
  `Opening the deep page and leaving it ${cycles} times: ${before} DOM nodes before, ${after} after`,
)

if (after - before > nodesAllowance) {
  console.error(`Pages that were left are still held: ${after - before} more DOM nodes`)
  process.exit(1)
}

process.exit(0)
