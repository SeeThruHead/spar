import { chromium } from "playwright"
import type { Browser } from "playwright"

const root = new URL("..", import.meta.url).pathname

const frameworks = ["spar", "solid", "foldkit"] as const

const rows = 10_000

const allowedAgainstSolid = 1.5

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}dist${path.endsWith("/") ? `${path}index.html` : path}`)

    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

const heapOf = async (browser: Browser, framework: string): Promise<number> => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const session = await page.context().newCDPSession(page)

  await page.goto(`http://127.0.0.1:${server.port}/${framework}/`)
  await page.click("#runlots")
  await page.waitForFunction(
    (count) => document.querySelector("#tbody")?.childElementCount === count,
    rows,
  )
  await session.send("HeapProfiler.collectGarbage")

  const usage = await session.send("Runtime.getHeapUsage")

  await page.close()

  return usage.usedSize
}

const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`

const browser = await chromium.launch()
const heaps = await frameworks
  .reduce<Promise<Readonly<Record<string, number>>>>(
    (collected, framework) =>
      collected.then(async (all) => ({ ...all, [framework]: await heapOf(browser, framework) })),
    Promise.resolve({}),
  )
  .finally(async () => {
    await browser.close()
    await server.stop(true)
  })

const spar = heaps["spar"] ?? 0
const solid = heaps["solid"] ?? 0
const ratio = spar / solid

console.log(
  `Heap after ${rows.toLocaleString("en")} rows: ${frameworks.map((framework) => `${framework} ${megabytes(heaps[framework] ?? 0)}`).join(", ")}. Spar is ${ratio.toFixed(2)} times Solid (allowed ${allowedAgainstSolid}).`,
)

if (ratio > allowedAgainstSolid) process.exit(1)
