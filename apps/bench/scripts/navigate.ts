import { chromium } from "playwright"
import type { Page } from "playwright"

type Call = { readonly kind: string; readonly startedAt: number; readonly endedAt: number }

type Run = { readonly took: number; readonly calls: ReadonlyArray<Call> }

type Result = {
  readonly app: string
  readonly median: number
  readonly spread: number
  readonly authorAfterReport: boolean
  readonly requests: number
}

const root = new URL("..", import.meta.url).pathname
const repo = new URL("../../..", import.meta.url).pathname

const apps = ["nav-spar", "nav-react", "nav-foldkit"] as const

const names: Readonly<Record<string, string>> = {
  "nav-spar": "Spar",
  "nav-react": "React, TanStack Router and React Query",
  "nav-foldkit": "Foldkit",
}

const runs = 12
const warmups = 2
const latency = 50

const serve = (app: string) =>
  Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      const requested = new URL(request.url).pathname
      const file = Bun.file(`${root}dist/${app}${requested}`)

      return (await file.exists()) && !requested.endsWith("/")
        ? new Response(file)
        : new Response(Bun.file(`${root}dist/${app}/index.html`))
    },
  })

const servers = new Map(apps.map((app) => [app, serve(app)] as const))

const originOf = (app: string): string =>
  `http://127.0.0.1:${[...servers].find(([name]) => name === app)?.[1].port ?? 0}/`

const once = async (page: Page, app: string): Promise<Run> => {
  await page.goto(originOf(app))
  await page.waitForSelector("#go")
  await page.evaluate(() => Reflect.set(globalThis, "navCalls", []))

  const took = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const start = performance.now()
        const observer = new MutationObserver(() => {
          const author = document.querySelector("#author")?.textContent ?? ""
          if (author === "") return

          observer.disconnect()
          resolve(performance.now() - start)
        })

        observer.observe(document.body, { childList: true, subtree: true, characterData: true })
        document.querySelector<HTMLElement>("#go")?.click()
      }),
  )
  const calls: ReadonlyArray<Call> = await page.evaluate(() => Reflect.get(globalThis, "navCalls"))

  return { took, calls }
}

const repeated = (page: Page, app: string, left: number, done: ReadonlyArray<Run>) =>
  left === 0
    ? Promise.resolve(done)
    : once(page, app).then((run): Promise<ReadonlyArray<Run>> =>
        repeated(page, app, left - 1, [...done, run]),
      )

const middle = (sorted: ReadonlyArray<number>): number =>
  sorted.at(Math.floor(sorted.length / 2)) ?? 0

const spreadOf = (calls: ReadonlyArray<Call>): number => {
  const starts = calls.filter((call) => call.kind !== "author").map((call) => call.startedAt)

  return Math.max(...starts) - Math.min(...starts)
}

const orderly = (calls: ReadonlyArray<Call>): boolean => {
  const report = calls.find((call) => call.kind === "report")
  const author = calls.find((call) => call.kind === "author")

  return report !== undefined && author !== undefined && author.startedAt >= report.endedAt - 1
}

const measure = async (page: Page, app: string): Promise<Result> => {
  const all = await repeated(page, app, runs, [])
  const kept = all.slice(warmups)

  return {
    app,
    median: middle(kept.map((run) => run.took).toSorted((left, right) => left - right)),
    spread: middle(kept.map((run) => spreadOf(run.calls)).toSorted((left, right) => left - right)),
    authorAfterReport: kept.every((run) => orderly(run.calls)),
    requests: middle(kept.map((run) => run.calls.length).toSorted((left, right) => left - right)),
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const results = await apps
  .reduce<Promise<ReadonlyArray<Result>>>(
    (collected, app) => collected.then(async (all) => [...all, await measure(page, app)]),
    Promise.resolve([]),
  )
  .finally(async () => {
    await browser.close()
    await Promise.all([...servers.values()].map((server) => server.stop(true)))
  })

const row = (cells: ReadonlyArray<string>): string => `| ${cells.join(" | ")} |`

const report = [
  "# Navigation to a page five segments deep",
  "",
  `The same page in each: five nested segments that each need one piece of data, and a sixth piece (the report's author) that can only be asked for once the report has answered. Every request takes ${latency} ms in a stand-in server inside the page, so the best possible time is two round trips, about ${latency * 2} ms, and six requests in a row would take about ${latency * 6} ms. Timed from the click on the link until the author's name is in the page, in headless Chromium ${browser.version()}, median of ${runs - warmups} runs after ${warmups} warm-ups. Rerun with \`bun run navigate\` at the repo root.`,
  "",
  row([
    "",
    "Click to last data shown",
    "Requests",
    "First five start within",
    "Sixth waits for the report",
  ]),
  row(["---", "---:", "---:", "---:", "---"]),
  ...results.map((result) =>
    row([
      names[result.app] ?? result.app,
      `${result.median.toFixed(1)} ms`,
      String(result.requests),
      `${result.spread.toFixed(1)} ms`,
      result.authorAfterReport ? "yes" : "no",
    ]),
  ),
  "",
  "How each is written. Spar: each segment's component asks for its own data with `Query.ask`, and the author's query takes its input from the report's value; nothing else is declared (`apps/bench/src/nav-spar/Nav.ts`). React: each route has a loader that calls `queryClient.ensureQueryData`, the leaf's loader awaits the report and then the author, and each component reads with `useSuspenseQuery` (`apps/bench/src/nav-react/main.tsx`). Foldkit: this app does not use Foldkit's router (`foldkit/route`); the click's branch of `update` returns the five Commands, and the branch that handles the report's answer returns the sixth (`apps/bench/src/nav-foldkit/main.ts`).",
  "",
].join("\n")

await Bun.write(`${root}artifacts/navigate.json`, JSON.stringify(results, null, 2))
await Bun.write(`${repo}docs/navigation.md`, report)
console.log(report)

const waterfalls = results.filter(
  (result) => result.app === "nav-spar" && (result.spread > 20 || !result.authorAfterReport),
)

if (waterfalls.length > 0) {
  console.error("Spar did not start the five independent requests together")
  process.exit(1)
}
