import { chromium } from "playwright"
import type { CDPSession, Page } from "playwright"

const root = new URL("..", import.meta.url).pathname

const cycles = 60
const warmups = 5
const nodesAllowance = 20

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}dist/nav-spar${path === "/" ? "/index.html" : path}`)

    return (await file.exists())
      ? new Response(file)
      : new Response(Bun.file(`${root}dist/nav-spar/index.html`))
  },
})

const cycle = async (page: Page): Promise<void> => {
  await page.click("#go")
  await page.waitForFunction(() => (document.querySelector("#author")?.textContent ?? "") !== "")
  await page.goBack()
  await page.locator("#go").waitFor()
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

const browser = await chromium.launch()
const page = await browser.newPage()
const session = await page.context().newCDPSession(page)

await session.send("Performance.enable")
await page.goto(`http://127.0.0.1:${server.port}/`)
await page.locator("#go").waitFor()
await repeat(warmups, page)

const before = await nodes(session)

await repeat(cycles, page)

const after = await nodes(session)

await browser.close()
await server.stop(true)

console.log(
  `Going to a page five segments deep and back ${cycles} times: ${before} DOM nodes before, ${after} after`,
)

if (after - before > nodesAllowance) {
  console.error(`Pages that were left are still held: ${after - before} more DOM nodes`)
  process.exit(1)
}
