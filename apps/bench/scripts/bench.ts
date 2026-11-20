import { loadavg } from "node:os"
import { chromium } from "playwright"
import type { Browser, Page } from "playwright"

type Until =
  | { readonly kind: "rows"; readonly count: number }
  | { readonly kind: "idAt"; readonly row: number; readonly id: string }
  | { readonly kind: "labelEnds"; readonly row: number; readonly suffix: string }
  | { readonly kind: "selected"; readonly row: number }

type Operation = {
  readonly id: string
  readonly label: string
  readonly before: ReadonlyArray<{ readonly click: string; readonly rows: number }>
  readonly click: string
  readonly until: Until
  readonly stop?: "changed"
}

type Timing = {
  readonly median: number
  readonly fastest: number
  readonly slowest: number
}

type Result = {
  readonly framework: string
  readonly timings: Readonly<Record<string, Timing>>
  readonly heapAfter1k: number
  readonly heapAfter10k: number
  readonly slowestFrameAt10k: number
  readonly typicalFrameAt10k: number
  readonly bundleBytes: number
  readonly startup: number
}

const root = new URL("..", import.meta.url).pathname
const repo = new URL("../../..", import.meta.url).pathname

const frameworks = ["spar", "spar-composed", "solid", "solid2", "react", "foldkit"] as const

const thousand = [{ click: "#run", rows: 1000 }]

const operations: ReadonlyArray<Operation> = [
  {
    id: "create1k",
    label: "Create 1,000 rows",
    before: [],
    click: "#run",
    until: { kind: "rows", count: 1000 },
  },
  {
    id: "replace1k",
    label: "Replace all 1,000 rows",
    before: thousand,
    click: "#run",
    until: { kind: "idAt", row: 1, id: "1001" },
  },
  {
    id: "update",
    label: "Update every 10th row of 1,000",
    before: thousand,
    click: "#update",
    until: { kind: "labelEnds", row: 991, suffix: " !!!" },
  },
  {
    id: "select",
    label: "Select a row among 1,000",
    before: thousand,
    click: "#tbody tr:nth-child(2) a.lbl",
    until: { kind: "selected", row: 2 },
  },
  {
    id: "swap",
    label: "Swap two rows of 1,000",
    before: thousand,
    click: "#swaprows",
    until: { kind: "idAt", row: 2, id: "999" },
  },
  {
    id: "remove",
    label: "Remove one row of 1,000",
    before: thousand,
    click: "#tbody tr:nth-child(5) a.remove",
    until: { kind: "rows", count: 999 },
  },
  {
    id: "create10k",
    label: "Create 10,000 rows",
    before: [],
    click: "#runlots",
    until: { kind: "rows", count: 10_000 },
  },
  {
    id: "append",
    label: "Append 1,000 rows to 1,000",
    before: thousand,
    click: "#add",
    until: { kind: "rows", count: 2000 },
  },
  {
    id: "clear",
    label: "Clear 1,000 rows",
    before: thousand,
    click: "#clear",
    until: { kind: "rows", count: 0 },
  },
  {
    id: "one10k",
    label: "Change one row among 10,000, to the next frame",
    before: [{ click: "#runlots", rows: 10_000 }],
    click: "#updateone",
    until: { kind: "labelEnds", row: 5001, suffix: " !!!" },
  },
  {
    id: "one10kScript",
    label: "Change one row among 10,000, until the DOM changed",
    before: [{ click: "#runlots", rows: 10_000 }],
    click: "#updateone",
    until: { kind: "labelEnds", row: 5001, suffix: " !!!" },
    stop: "changed",
  },
]

const runs = 12
const warmups = 2
const startupRuns = 42

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}dist${path.endsWith("/") ? `${path}index.html` : path}`)

    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

const urlOf = (framework: string): string => `http://127.0.0.1:${server.port}/${framework}/`

const timeIn = (page: Page, operation: Operation): Promise<number> =>
  page.evaluate(
    ({ click, until, stop }) =>
      new Promise<number>((resolve) => {
        const tbody = document.querySelector("#tbody")
        const rowAt = (row: number) => tbody?.querySelector(`tr:nth-child(${row})`)
        const reached = (): boolean => {
          if (until.kind === "rows") return tbody?.childElementCount === until.count
          if (until.kind === "idAt") {
            return rowAt(until.row)?.firstElementChild?.textContent === until.id
          }
          if (until.kind === "selected") return rowAt(until.row)?.className === "danger"

          return (
            rowAt(until.row)?.querySelector("a.lbl")?.textContent?.endsWith(until.suffix) === true
          )
        }
        const start = performance.now()
        const observer = new MutationObserver(() => {
          if (!reached()) return

          const changedAfter = performance.now() - start

          observer.disconnect()
          if (stop === "changed") return resolve(changedAfter)

          requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start), 0))
        })

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        })
        document.querySelector<HTMLElement>(click)?.click()
      }),
    { click: operation.click, until: operation.until, stop: operation.stop ?? null },
  )

const prepare = async (page: Page, framework: string, operation: Operation): Promise<void> => {
  await page.goto(urlOf(framework))
  await page.waitForSelector("#run")
  await operation.before.reduce(
    (done, step) =>
      done.then(async () => {
        await page.click(step.click)
        await page.waitForFunction(
          (rows) => document.querySelector("#tbody")?.childElementCount === rows,
          step.rows,
        )
      }),
    Promise.resolve(),
  )
}

const once = async (page: Page, framework: string, operation: Operation): Promise<number> => {
  await prepare(page, framework, operation)

  return timeIn(page, operation)
}

const middle = (sorted: ReadonlyArray<number>): number =>
  sorted.at(Math.floor(sorted.length / 2)) ?? 0

const summarise = (samples: ReadonlyArray<number>): Timing => {
  const sorted = samples.slice(warmups).toSorted((left, right) => left - right)

  return { median: middle(sorted), fastest: sorted.at(0) ?? 0, slowest: sorted.at(-1) ?? 0 }
}

const timeOperation = (page: Page, framework: string, operation: Operation): Promise<Timing> =>
  Array.from({ length: runs })
    .reduce<Promise<ReadonlyArray<number>>>(
      (collected) =>
        collected.then(async (samples) => [...samples, await once(page, framework, operation)]),
      Promise.resolve([]),
    )
    .then(summarise)

const heapAfter = async (page: Page, framework: string, click: string, rows: number) => {
  const session = await page.context().newCDPSession(page)

  await page.goto(urlOf(framework))
  await page.click(click)
  await page.waitForFunction(
    (count) => document.querySelector("#tbody")?.childElementCount === count,
    rows,
  )
  await session.send("HeapProfiler.collectGarbage")

  const usage = await session.send("Runtime.getHeapUsage")

  await session.detach()

  return usage.usedSize
}

const framesWhileScrolling = (page: Page): Promise<ReadonlyArray<number>> =>
  page.evaluate(
    () =>
      new Promise<ReadonlyArray<number>>((resolve) => {
        const step = (left: number, last: number, gaps: ReadonlyArray<number>): void => {
          if (left === 0) return resolve(gaps)

          window.scrollBy(0, 400)
          requestAnimationFrame((now) => step(left - 1, now, [...gaps, now - last]))
        }

        requestAnimationFrame((now) => step(90, now, []))
      }),
  )

const watchForTheApp = (): void => {
  const observer = new MutationObserver(() => {
    if (document.querySelector("#run") === null) return

    observer.disconnect()
    Reflect.set(globalThis, "appShownAt", performance.now())
  })

  observer.observe(document, { childList: true, subtree: true })
}

const paintedAt = async (opened: Page, framework: string): Promise<number> => {
  const page = await opened.context().newPage()

  await page.addInitScript(watchForTheApp)
  await page.goto(urlOf(framework))
  await page.waitForFunction(() => typeof Reflect.get(globalThis, "appShownAt") === "number")

  const shown = await page.evaluate(() => Number(Reflect.get(globalThis, "appShownAt")))

  await page.close()

  return shown
}

const startupOf = (page: Page, framework: string): Promise<number> =>
  Array.from({ length: startupRuns })
    .reduce<Promise<ReadonlyArray<number>>>(
      (collected) =>
        collected.then(async (samples) => [...samples, await paintedAt(page, framework)]),
      Promise.resolve([]),
    )
    .then((samples) => summarise(samples).median)

const bundleBytes = async (framework: string): Promise<number> => {
  const files = [...new Bun.Glob("assets/*.js").scanSync(`${root}dist/${framework}`)]
  const sizes = await Promise.all(
    files.map(
      async (file) =>
        Bun.gzipSync(await Bun.file(`${root}dist/${framework}/${file}`).bytes()).length,
    ),
  )

  return sizes.reduce((total, size) => total + size, 0)
}

const measure = async (browser: Browser, framework: string): Promise<Result> => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const timings = await operations.reduce<Promise<Readonly<Record<string, Timing>>>>(
    (collected, operation) =>
      collected.then(async (all) => ({
        ...all,
        [operation.id]: await timeOperation(page, framework, operation),
      })),
    Promise.resolve({}),
  )
  const heapAfter1k = await heapAfter(page, framework, "#run", 1000)
  const heapAfter10k = await heapAfter(page, framework, "#runlots", 10_000)
  const frames = (await framesWhileScrolling(page)).toSorted((left, right) => left - right)
  await page.addInitScript(watchForTheApp)

  const startup = await startupOf(page, framework)

  await page.close()
  console.log(`measured ${framework}`)

  return {
    framework,
    timings,
    heapAfter1k,
    heapAfter10k,
    slowestFrameAt10k: frames.at(-1) ?? 0,
    typicalFrameAt10k: middle(frames),
    bundleBytes: await bundleBytes(framework),
    startup,
  }
}

const ms = (value: number): string => `${value.toFixed(1)} ms`

const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`

const kilobytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`

const timesSolid = (value: number, solid: number): string =>
  solid > 0 ? `${(value / solid).toFixed(2)}× Solid` : "Solid not measured"

const relative = (
  results: ReadonlyArray<Result>,
  measured: (result: Result) => number,
  shown: (value: number) => string,
): ReadonlyArray<string> => {
  const solid = results.find((result) => result.framework === "solid")
  const base = solid === undefined ? 0 : measured(solid)

  return results.map(
    (result) => `${timesSolid(measured(result), base)}<br>${shown(measured(result))}`,
  )
}

const row = (label: string, cells: ReadonlyArray<string>): string =>
  `| ${label} | ${cells.join(" | ")} |`

const machine = Bun.env["SPAR_BENCH_MACHINE"] ?? "this machine"

const report = (results: ReadonlyArray<Result>, browserVersion: string): string =>
  [
    "# Benchmarks",
    "",
    `The same table app in Spar, Solid ${solidVersion} (solid), Solid ${solid2Version} (solid2), React ${reactVersion} and Foldkit ${foldkitVersion}, built with Vite and`,
    `driven in headless Chromium ${browserVersion} on ${machine}. Each number is the median of ${runs - warmups} runs`,
    `after ${warmups} warm-up runs, from the click until the next frame after the DOM reached its final state.`,
    "Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.",
    "",
    "Each cell leads with the result against Solid's in the same run (Solid is 1.00×), with the measurement under it. The CI pool hands out different machines from week to week, so compare the ratios across weeks, not the milliseconds.",
    "",
    "Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid sets one signal. In Spar the store action replaces the row with `Store.withRow`, so the keyed list rewrites that row without walking the other 9,999; what is left is the command itself (its span, its journal entry, the fiber that runs it). Startup is the time from the start of navigation until the app's first button is in the page, from a local server, the median of 40 loads, each in a fresh page, after 2 warm-up loads.",
    "",
    row(
      "Operation",
      results.map((result) => result.framework),
    ),
    row(
      "---",
      results.map(() => "---:"),
    ),
    ...operations.map((operation) =>
      row(
        operation.label,
        relative(results, (result) => result.timings[operation.id]?.median ?? 0, ms),
      ),
    ),
    row(
      "Heap after 1,000 rows",
      relative(results, (result) => result.heapAfter1k, megabytes),
    ),
    row(
      "Heap after 10,000 rows",
      relative(results, (result) => result.heapAfter10k, megabytes),
    ),
    row(
      "Typical frame while scrolling 10,000 rows",
      relative(results, (result) => result.typicalFrameAt10k, ms),
    ),
    row(
      "Slowest frame while scrolling 10,000 rows",
      relative(results, (result) => result.slowestFrameAt10k, ms),
    ),
    row(
      "Startup, until the app is in the page",
      relative(results, (result) => result.startup, ms),
    ),
    row(
      "JavaScript shipped (gzip)",
      relative(results, (result) => result.bundleBytes, kilobytes),
    ),
    "",
  ].join("\n")

type Metric = {
  readonly label: string
  readonly unit: string
  readonly values: ReadonlyArray<number>
}

const colours: Readonly<Record<string, string>> = {
  spar: "#1d5fd6",
  "spar-composed": "#5c8fe6",
  solid: "#3f6b3a",
  solid2: "#0f766e",
  react: "#8a4a00",
  foldkit: "#6b3fa0",
}

const metricsOf = (results: ReadonlyArray<Result>): ReadonlyArray<Metric> => [
  ...operations.map((operation) => ({
    label: operation.label,
    unit: "ms",
    values: results.map((result) => result.timings[operation.id]?.median ?? 0),
  })),
  {
    label: "Heap after 1,000 rows",
    unit: "MB",
    values: results.map((result) => result.heapAfter1k / 1_048_576),
  },
  {
    label: "Heap after 10,000 rows",
    unit: "MB",
    values: results.map((result) => result.heapAfter10k / 1_048_576),
  },
  {
    label: "Startup, until the app is in the page",
    unit: "ms",
    values: results.map((result) => result.startup),
  },
  {
    label: "JavaScript shipped (gzip)",
    unit: "kB",
    values: results.map((result) => result.bundleBytes / 1024),
  },
]

const chart = (metric: Metric, names: ReadonlyArray<string>): string => {
  const most = Math.max(...metric.values, 0.001)
  const bars = metric.values
    .map((value, index) => {
      const name = names[index] ?? ""
      const y = 30 + index * 26
      const width = Math.max(2, (value / most) * 380)

      return `<text x="0" y="${y + 14}" font-size="14" fill="#1b2330">${name}</text><rect x="70" y="${y}" width="${width.toFixed(1)}" height="18" fill="${colours[name] ?? "#444"}"/><text x="${(76 + width).toFixed(1)}" y="${y + 14}" font-size="14" fill="#1b2330">${value.toFixed(1)} ${metric.unit}</text>`
    })
    .join("")

  return `<figure><svg role="img" aria-label="${metric.label}: ${names.map((name, index) => `${name} ${(metric.values[index] ?? 0).toFixed(1)} ${metric.unit}`).join(", ")}" viewBox="0 0 560 ${40 + names.length * 26}" style="max-width: 560px; width: 100%"><text x="0" y="16" font-size="15" font-weight="600" fill="#1b2330">${metric.label}</text>${bars}</svg></figure>`
}

const page = (results: ReadonlyArray<Result>, browserVersion: string): string =>
  [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Spar benchmarks</title>',
    "<style>body{font:16px/1.5 system-ui,sans-serif;color:#1b2330;max-width:72rem;margin:2rem auto;padding:0 1rem}figure{margin:0 0 1.25rem}.charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(30rem,1fr));gap:0.5rem 2rem}</style></head><body>",
    "<h1>Spar benchmarks</h1>",
    `<p>The same table app in Spar, Solid ${solidVersion} (solid), Solid ${solid2Version} (solid2), React ${reactVersion} and Foldkit ${foldkitVersion}, built with Vite and driven in headless Chromium ${browserVersion} on ${machine}. Each time is the median of ${runs - warmups} runs after ${warmups} warm-up runs, from the click until the next frame after the page reached its final state. Lower is better in every chart.</p>`,
    "<p>How it is measured: each run loads the app fresh, sets up the rows the operation needs, then clicks once. A MutationObserver waits for the expected end state (a row count, an id in a given row, a label ending, a selected row) and the clock stops on the next animation frame. Heap is read after a forced garbage collection. Startup is the time from the start of navigation until the app's first button is in the page, from a local server, the median of 40 loads, each in a fresh page, after 2 warm-up loads. Shipped JavaScript is every built .js file, gzipped. Rerun everything with <code>bun run bench</code> at the repo root.</p>",
    "<p>Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid wins it by a wide margin, because it sets one signal. In Spar the store action builds a new array of 10,000 rows and the keyed list is given all of them, so it still walks every key, but it now only compares them and rewrites the one row that changed.</p>",
    "<!-- charts -->",
    `<div class="charts">${metricsOf(results)
      .map((metric) =>
        chart(
          metric,
          results.map((result) => result.framework),
        ),
      )
      .join("")}</div>`,
    "<!-- /charts -->",
    "</body></html>",
    "",
  ].join("\n")

const versionOf = async (name: string): Promise<string> => {
  const manifest: { readonly version: string } = await Bun.file(
    `${root}node_modules/${name}/package.json`,
  ).json()

  return manifest.version
}

const solidVersion = await versionOf("solid-js")
const solid2Version = await versionOf("../../bench-solid2/node_modules/solid-js")
const foldkitVersion = await versionOf("foldkit")
const reactVersion = await versionOf("react")

const mostLoad = Number(Bun.env["BENCH_MOST_LOAD"] ?? 3)
const loadBefore = loadavg()[0] ?? 0

const browser = await chromium.launch()
const results = await frameworks
  .reduce<Promise<ReadonlyArray<Result>>>(
    (collected, framework) =>
      collected.then(async (all) => [...all, await measure(browser, framework)]),
    Promise.resolve([]),
  )
  .finally(async () => {
    await browser.close()
    await server.stop(true)
  })

const loadAfter = loadavg()[0] ?? 0
const busiest = Math.max(loadBefore, loadAfter)
const quiet = busiest <= mostLoad

await Bun.write(`${root}artifacts/bench.json`, JSON.stringify(results, null, 2))
await Promise.all(
  quiet
    ? [
        Bun.write(`${repo}docs/benchmarks.md`, report(results, browser.version())),
        Bun.write(`${repo}docs/benchmarks.html`, page(results, browser.version())),
      ]
    : [],
)
console.log(report(results, browser.version()))
console.log(
  quiet
    ? `Load average ${busiest.toFixed(1)}: the benchmark page was written.`
    : `Load average ${busiest.toFixed(1)} is above ${mostLoad}: these numbers are not to be quoted and the benchmark page was left as it was. Run again on a quiet machine, or set BENCH_MOST_LOAD.`,
)

const budgetRatio = 2
const noiseFloor = 25

const medianOf = (framework: string, operation: Operation): number =>
  results.find((result) => result.framework === framework)?.timings[operation.id]?.median ?? 0

const overBudget = operations.filter((operation) => {
  const spar = medianOf("spar", operation)

  return spar > noiseFloor && spar > budgetRatio * medianOf("solid", operation)
})

if (overBudget.length > 0) {
  console.error(
    `Over budget (more than ${budgetRatio} times Solid): ${overBudget.map((operation) => operation.label).join(", ")}`,
  )
  process.exit(1)
}
