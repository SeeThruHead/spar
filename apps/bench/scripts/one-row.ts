import { chromium } from "playwright"

type ProfileNode = {
  readonly id: number
  readonly callFrame: { readonly functionName: string; readonly lineNumber: number }
}

const root = new URL("..", import.meta.url).pathname

const framework = Bun.argv[3] ?? "spar"

const built = framework === "spar" ? "dist-readable" : "dist"

const times = 30

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
await page.click("#runlots")
await page.waitForFunction(() => document.querySelector("#tbody")?.childElementCount === 10_000)

const changeOnce = (): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const label = document.querySelector("#tbody tr:nth-child(5001) a.lbl")
        const before = label?.textContent ?? ""
        const start = performance.now()
        const observer = new MutationObserver(() => {
          if (label?.textContent === before) return

          observer.disconnect()
          resolve(performance.now() - start)
        })

        observer.observe(document.body, { childList: true, subtree: true, characterData: true })
        document.querySelector<HTMLElement>("#updateone")?.click()
      }),
  )

const repeated = (left: number, taken: ReadonlyArray<number>): Promise<ReadonlyArray<number>> =>
  left === 0
    ? Promise.resolve(taken)
    : changeOnce().then((time) => repeated(left - 1, [...taken, time]))

await repeated(5, [])
await session.send("Profiler.enable")
await session.send("Profiler.setSamplingInterval", { interval: 50 })
await session.send("Profiler.start")

const taken = await repeated(times, [])
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
const working = [...spent].filter(([label]) => !/^\((idle|program|root)\)/.test(label))
const sorted = taken.toSorted((left, right) => left - right)

console.log(
  `${framework}: one row among 10,000, until the DOM changed: median ${(sorted.at(Math.floor(sorted.length / 2)) ?? 0).toFixed(2)} ms over ${times} changes`,
)
console.log("self time for each change, by function:")
console.log(
  working
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, Number(Bun.argv[2] ?? 25))
    .map(([label, time]) => `${(time / 1000 / times).toFixed(3).padStart(8)} ms  ${label}`)
    .join("\n"),
)
