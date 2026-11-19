import { chromium } from "playwright"
import { createServer } from "vite"

const root = new URL("..", import.meta.url).pathname

const times = 10

const server = await createServer({
  configFile: `${root}vite.spar-dev.config.ts`,
  root: `${root}src/spar`,
  logLevel: "error",
  server: { port: 4193, host: "127.0.0.1" },
})

await server.listen()

const url = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:4193/"

const browser = await chromium.launch()
const page = await browser.newPage()

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

const fresh = async (): Promise<{ readonly cold: number; readonly warm: number }> => {
  await page.goto(url)
  await page.click("#runlots")
  await page.waitForFunction(() => document.querySelector("#tbody")?.childElementCount === 10_000)
  await page.waitForTimeout(300)

  const cold = await changeOnce()

  await changeOnce()
  await changeOnce()

  return { cold, warm: await changeOnce() }
}

const repeated = (
  left: number,
  done: ReadonlyArray<{ readonly cold: number; readonly warm: number }>,
): Promise<ReadonlyArray<{ readonly cold: number; readonly warm: number }>> =>
  left === 0 ? Promise.resolve(done) : fresh().then((one) => repeated(left - 1, [...done, one]))

const runs = await repeated(times, [])
const hasTools = await page.getByRole("button", { name: "Devtools" }).count()

await browser.close()
await server.close()

const middle = (values: ReadonlyArray<number>): number =>
  values.toSorted((left, right) => left - right).at(Math.floor(values.length / 2)) ?? 0

console.log(
  `spar on the dev server, devtools ${hasTools > 0 ? "on" : "MISSING"}: one row among 10,000, until the DOM changed: first change ${middle(runs.map((run) => run.cold)).toFixed(2)} ms, fourth change ${middle(runs.map((run) => run.warm)).toFixed(2)} ms (median of ${times} fresh pages)`,
)
process.exit(0)
