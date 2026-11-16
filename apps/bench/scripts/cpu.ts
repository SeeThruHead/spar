import { chromium } from "playwright"

type ProfileNode = {
  readonly id: number
  readonly callFrame: { readonly functionName: string; readonly lineNumber: number }
}

const root = new URL("..", import.meta.url).pathname

const framework = Bun.argv[3] ?? "spar"

const built = framework === "spar" ? "dist-readable" : "dist"

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}${built}${path.endsWith("/") ? `${path}index.html` : path}`)

    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

const browser = await chromium.launch()
const page = await browser.newPage()
const session = await page.context().newCDPSession(page)

await page.goto(`http://127.0.0.1:${server.port}/${framework}/`)
await page.click("#run")
await page.waitForFunction(() => document.querySelector("#tbody")?.childElementCount === 1000)
await page.click("#clear")
await page.waitForFunction(() => document.querySelector("#tbody")?.childElementCount === 0)
await session.send("Profiler.enable")
await session.send("Profiler.setSamplingInterval", { interval: 100 })
await session.send("Profiler.start")
await page.click("#runlots")
await page.waitForFunction(() => document.querySelector("#tbody")?.childElementCount === 10_000)

const { profile } = await session.send("Profiler.stop")

await browser.close()
await server.stop(true)

const labels = new Map(
  profile.nodes.map((node: ProfileNode) => [
    node.id,
    `${node.callFrame.functionName || "(anonymous)"}:${node.callFrame.lineNumber + 1}`,
  ]),
)
const deltas = profile.timeDeltas ?? []
const spent = (profile.samples ?? []).reduce((all, id, index) => {
  const label = labels.get(id) ?? "?"

  return all.set(label, (all.get(label) ?? 0) + (deltas[index] ?? 0))
}, new Map<string, number>())
const total = [...spent.values()].reduce((sum, time) => sum + time, 0)

console.log(`creating 10,000 rows: ${(total / 1000).toFixed(0)} ms sampled`)
console.log(
  [...spent]
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, Number(Bun.argv[2] ?? 40))
    .map(([label, time]) => `${(time / 1000).toFixed(1).padStart(7)} ms  ${label}`)
    .join("\n"),
)
