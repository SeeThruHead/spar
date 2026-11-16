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
}

const root = new URL("..", import.meta.url).pathname
const repo = new URL("../../..", import.meta.url).pathname

const frameworks = ["spar", "solid", "foldkit"] as const

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
]

const runs = 12
const warmups = 2

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
    ({ click, until }) =>
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

          observer.disconnect()
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
    { click: operation.click, until: operation.until },
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
  }
}

const ms = (value: number): string => `${value.toFixed(1)} ms`

const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`

const kilobytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`

const row = (label: string, cells: ReadonlyArray<string>): string =>
  `| ${label} | ${cells.join(" | ")} |`

const report = (results: ReadonlyArray<Result>, browserVersion: string): string =>
  [
    "# Benchmarks",
    "",
    `The same table app in Spar, Solid ${solidVersion} and Foldkit ${foldkitVersion}, built with Vite and`,
    `driven in headless Chromium ${browserVersion} on this machine. Each number is the median of ${runs - warmups} runs`,
    `after ${warmups} warm-up runs, from the click until the next frame after the DOM reached its final state.`,
    "Lower is better. Rerun with `bun run moon run bench:bench`.",
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
        results.map((result) => ms(result.timings[operation.id]?.median ?? 0)),
      ),
    ),
    row(
      "Heap after 1,000 rows",
      results.map((result) => megabytes(result.heapAfter1k)),
    ),
    row(
      "Heap after 10,000 rows",
      results.map((result) => megabytes(result.heapAfter10k)),
    ),
    row(
      "Typical frame while scrolling 10,000 rows",
      results.map((result) => ms(result.typicalFrameAt10k)),
    ),
    row(
      "Slowest frame while scrolling 10,000 rows",
      results.map((result) => ms(result.slowestFrameAt10k)),
    ),
    row(
      "JavaScript shipped (gzip)",
      results.map((result) => kilobytes(result.bundleBytes)),
    ),
    "",
  ].join("\n")

const versionOf = async (name: string): Promise<string> => {
  const manifest: { readonly version: string } = await Bun.file(
    `${root}node_modules/${name}/package.json`,
  ).json()

  return manifest.version
}

const solidVersion = await versionOf("solid-js")
const foldkitVersion = await versionOf("foldkit")

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

await Bun.write(`${root}artifacts/bench.json`, JSON.stringify(results, null, 2))
await Bun.write(`${repo}docs/benchmarks.md`, report(results, browser.version()))
console.log(report(results, browser.version()))
