import { chromium } from "playwright"
import type { CDPSession, Page } from "playwright"
import { start } from "./site.ts"

const cycles = Number(Bun.argv[2] ?? 40)
const warmups = 5
const nodesAllowance = 20

const server = start(0)

const origin = `http://127.0.0.1:${server.port}`

const said = (page: Page, label: string, text: string): Promise<void> =>
  page.getByLabel(label, { exact: true }).filter({ hasText: text }).waitFor()

const cycle = async (page: Page): Promise<void> => {
  await page.getByRole("link", { name: "About the cheese" }).click()
  await said(page, "Supplier", "Valley dairy")
  await page.getByRole("link", { name: "About the bread" }).click()
  await said(page, "Supplier", "The mill on the hill")
  await page.getByRole("link", { name: "Back to the shop" }).click()
  await page.getByRole("heading", { name: "Corner shop" }).waitFor()
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
await page.goto(origin)
await page.locator("#root[data-ready]").waitFor()
await repeat(warmups, page)

const before = await nodes(session)

await repeat(cycles, page)

const after = await nodes(session)

await browser.close()
await server.stop(true)

console.log(
  `Opening two product pages and going back to the shop ${cycles} times: ${before} DOM nodes before, ${after} after`,
)

if (after - before > nodesAllowance) {
  console.error(`Pages that were left are still held: ${after - before} more DOM nodes`)
  process.exit(1)
}
