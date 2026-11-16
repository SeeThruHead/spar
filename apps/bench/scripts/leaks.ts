import { chromium } from "playwright"
import type { CDPSession, Page } from "playwright"

type Counts = {
  readonly nodes: number
  readonly listeners: number
  readonly heap: number
}

const root = new URL("..", import.meta.url).pathname

const cycles = 40
const warmups = 5
const heapAllowance = 2_000_000

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}dist${path.endsWith("/") ? `${path}index.html` : path}`)

    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

const rowsAre = (page: Page, count: number) =>
  page.waitForFunction(
    (expected) => document.querySelector("#tbody")?.childElementCount === expected,
    count,
  )

const cycle = async (page: Page): Promise<void> => {
  await page.click("#run")
  await rowsAre(page, 1000)
  await page.click("#tbody tr:nth-child(3) a.lbl")
  await page.click("#swaprows")
  await page.click("#tbody tr:nth-child(7) a.remove")
  await rowsAre(page, 999)
  await page.click("#clear")
  await rowsAre(page, 0)
}

const repeat = (times: number, page: Page): Promise<void> =>
  Array.from({ length: times }).reduce<Promise<void>>(
    (done) => done.then(() => cycle(page)),
    Promise.resolve(),
  )

const metric = (metrics: ReadonlyArray<{ name: string; value: number }>, name: string): number =>
  metrics.find((entry) => entry.name === name)?.value ?? 0

const count = async (session: CDPSession): Promise<Counts> => {
  await session.send("HeapProfiler.collectGarbage")
  await session.send("HeapProfiler.collectGarbage")

  const { metrics } = await session.send("Performance.getMetrics")

  return {
    nodes: metric(metrics, "Nodes"),
    listeners: metric(metrics, "JSEventListeners"),
    heap: metric(metrics, "JSHeapUsedSize"),
  }
}

const browser = await chromium.launch()
const page = await browser.newPage()
const session = await page.context().newCDPSession(page)

await session.send("Performance.enable")
await page.goto(`http://127.0.0.1:${server.port}/spar/`)
await page.waitForSelector("#run")
await repeat(warmups, page)

const before = await count(session)

await repeat(cycles, page)

const after = await count(session)

await browser.close()
await server.stop(true)

const grown = {
  nodes: after.nodes - before.nodes,
  listeners: after.listeners - before.listeners,
  heap: after.heap - before.heap,
}

console.log(
  `After ${cycles} rounds of creating, changing and clearing 1,000 rows: ${grown.nodes} more DOM nodes, ${grown.listeners} more listeners, ${(grown.heap / 1_048_576).toFixed(2)} MB more heap.`,
)

const leaks = [
  ...(grown.nodes > 0 ? [`${grown.nodes} DOM nodes were left behind`] : []),
  ...(grown.listeners > 0 ? [`${grown.listeners} event listeners were left behind`] : []),
  ...(grown.heap > heapAllowance ? [`the heap grew by ${grown.heap} bytes`] : []),
]

if (leaks.length > 0) {
  console.error(`Leak: ${leaks.join("; ")}`)
  process.exit(1)
}
