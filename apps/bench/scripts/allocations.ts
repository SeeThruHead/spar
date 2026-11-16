import { chromium } from "playwright"

type Frame = {
  readonly callFrame: {
    readonly functionName: string
    readonly lineNumber: number
    readonly columnNumber: number
  }
  readonly selfSize: number
  readonly children: ReadonlyArray<Frame>
}

type Tally = readonly [string, number]

const root = new URL("..", import.meta.url).pathname

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}dist-readable${path.endsWith("/") ? `${path}index.html` : path}`)

    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

const flat = (frame: Frame, above: string): ReadonlyArray<Tally> => {
  const here = `${frame.callFrame.functionName || "(anonymous)"}:${frame.callFrame.lineNumber + 1}`

  return [
    [`${here}  <  ${above}`, frame.selfSize],
    ...frame.children.flatMap((child) => flat(child, here)),
  ]
}

const browser = await chromium.launch()
const page = await browser.newPage()
const session = await page.context().newCDPSession(page)

await page.goto(`http://127.0.0.1:${server.port}/spar/`)
await session.send("HeapProfiler.enable")
await session.send("HeapProfiler.startSampling", { samplingInterval: 256 })
await page.click("#runlots")
await page.waitForFunction(() => document.querySelector("#tbody")?.childElementCount === 10_000)
await session.send("HeapProfiler.collectGarbage")

const { profile } = await session.send("HeapProfiler.stopSampling")

await browser.close()
await server.stop(true)

const totals = flat(profile.head, "").reduce(
  (all, [label, bytes]) => all.set(label, (all.get(label) ?? 0) + bytes),
  new Map<string, number>(),
)
const total = [...totals.values()].reduce((sum, bytes) => sum + bytes, 0)

console.log(`live after creating 10,000 rows: ${(total / 1_048_576).toFixed(1)} MB`)
console.log(
  [...totals]
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, Number(Bun.argv[2] ?? 45))
    .map(([label, bytes]) => `${(bytes / 1024).toFixed(0).padStart(7)} kB  ${label}`)
    .join("\n"),
)
