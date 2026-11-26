import { Schema } from "effect"
import { freePort, launch } from "@spar/browsers"
import { Recorded } from "spar/devtools/spans"
import { createServer } from "vite"

const root = new URL("..", import.meta.url).pathname

const backendPort = await freePort()

const backendOrigin = `http://127.0.0.1:${backendPort}`

const backend = Bun.spawn(["bun", "scripts/backend.ts"], {
  cwd: root,
  env: { ...Bun.env, PORT: String(backendPort) },
  stdout: "ignore",
  stderr: "inherit",
})

Reflect.set(process.env, "SIDEBAR_BACKEND", backendOrigin)

const lookups = async (): Promise<ReadonlyArray<Recorded>> =>
  Schema.decodeUnknownSync(Schema.Array(Recorded))(
    await fetch(`${backendOrigin}/spans`).then((answer) => answer.json()),
  ).filter((span) => span.name.startsWith("Agents.lookup "))

const port = await freePort()

const server = await createServer({
  root,
  logLevel: "error",
  server: { port, strictPort: true },
})

await server.listen()

const address = `http://127.0.0.1:${port}/`

const browser = await launch()

const page = await browser.newPage({ viewport: { width: 1440, height: 1500 } })

const independent = ["org", "team", "member", "reports", "report"].map(
  (kind) => `Agents.lookup ${kind}`,
)

const steps = async (): Promise<ReadonlyArray<string>> => {
  await page.goto(address)
  await page.getByRole("button", { name: "Devtools" }).click()
  await page.getByRole("link", { name: "Open a page five segments deep" }).dispatchEvent("click")
  await page.getByLabel("Author status").filter({ hasText: "loaded" }).waitFor({ timeout: 8000 })

  const author = (await page.getByLabel("Author name").textContent()) ?? ""
  const spans = await lookups()
  const first = spans.filter((span) => independent.includes(span.name))
  const dependent = spans.filter((span) => span.name === "Agents.lookup author")
  const report = spans.filter((span) => span.name === "Agents.lookup report")
  const starts = first.map((span) => span.startedAt)
  const spread = Math.max(...starts) - Math.min(...starts)
  const whole =
    Math.max(...spans.map((span) => span.endedAt ?? 0)) -
    Math.min(...spans.map((span) => span.startedAt))
  const log = page.getByLabel("Everything that happened")

  await log
    .locator("ol li")
    .filter({
      has: page.locator("small[aria-label^='Trace of']", {
        hasText: new RegExp(`^${spans[0]?.traceId ?? "no lookups"}$`),
      }),
    })
    .first()
    .getByRole("button", { name: /^Trace / })
    .click()
  await page.getByLabel("Spans").locator("li", { hasText: "Agents.lookup author" }).waitFor({
    timeout: 8000,
  })
  await page.getByRole("button", { name: "Refresh trace" }).click()
  await page.getByLabel("Trace", { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${root}artifacts/devtools-deep.png` })
  await page.getByRole("button", { name: "Data", exact: true }).click()
  await page.getByLabel("Spans").locator("li", { hasText: "input from" }).first().waitFor()

  const data = await page.getByLabel("Spans").locator("li").allInnerTexts()
  await page
    .getByLabel("Spans")
    .locator("li", { hasText: "sidebar/Author/requested" })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${root}artifacts/devtools-deep-wait.png` })

  const waited = await page
    .getByLabel("Spans")
    .locator("li", { hasText: "sidebar/Author/requested" })
    .locator("[data-waited]")
    .first()
    .getAttribute("data-waited")

  await page.getByLabel("Trace", { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${root}artifacts/devtools-deep-data.png` })

  const traces = new Set(spans.map((span) => span.traceId))

  await page.goBack()
  await page.getByRole("link", { name: "Open a page five segments deep" }).click()
  await page.getByLabel("Author status").filter({ hasText: "loaded" }).waitFor({ timeout: 8000 })
  await log
    .locator("ol li", { hasText: "route /org/" })
    .last()
    .getByRole("button", { name: /^Trace / })
    .click()
  await page.getByLabel("Spans").locator("li", { hasText: "served from" }).first().waitFor()

  const again = await page.getByLabel("Spans").locator("li").allInnerTexts()
  const asAgain = await lookups()

  await page.getByLabel("Trace", { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${root}artifacts/devtools-served.png` })

  return [
    ...(author === "author author-of-q3" ? [] : [`the author read "${author}"`]),
    ...(first.length === 5 ? [] : [`the backend saw ${first.length} of the five lookups`]),
    ...(spread < 100 ? [] : [`the five lookups started ${spread.toFixed(0)} ms apart`]),
    ...(dependent.length === 1 ? [] : [`the backend saw ${dependent.length} author lookups`]),
    ...((dependent[0]?.startedAt ?? 0) >= (report[0]?.endedAt ?? Infinity)
      ? []
      : ["the author lookup started before the report had answered"]),
    ...(whole < 600 ? [] : [`all six lookups took ${whole.toFixed(0)} ms, as if in a row`]),
    ...(traces.size === 1 ? [] : [`the lookups were in ${traces.size} traces`]),
    ...(again.filter((line) => line.includes("served from what trace")).length >= 6
      ? []
      : [
          `going there again did not say what was served from the earlier load: ${again.join(" | ")}`,
        ]),
    ...(asAgain.length === spans.length ? [] : ["going there again asked the backend again"]),
    ...(data.some(
      (line) => line.includes("sidebar/Author/requested") && line.includes("input from"),
    )
      ? []
      : [`the data lens did not say what the author's query waited for: ${data.join(" | ")}`]),
    ...(Number.parseFloat(waited ?? "0") > 20
      ? []
      : [`the waterfall did not draw how long the author waited on the report: ${waited}`]),
    ...(data.some((line) => line.includes("SegmentView"))
      ? ["the data lens still showed components"]
      : []),
  ]
}

const everyLookup = [...independent, "Agents.lookup author"]

const waitForLookups = async (
  before: ReadonlySet<string>,
  left: number,
): Promise<ReadonlyArray<Recorded>> => {
  const fresh = (await lookups()).filter((span) => !before.has(span.traceId))
  if (fresh.length > 0 || left === 0) return fresh
  await Bun.sleep(25)

  return waitForLookups(before, left - 1)
}

const hoveredFirst = async (): Promise<ReadonlyArray<string>> => {
  const before = new Set((await lookups()).map((span) => span.traceId))
  const fresh = await browser.newPage({ viewport: { width: 1440, height: 1500 } })

  await fresh.goto(address)
  await fresh.getByRole("button", { name: "Devtools" }).click()

  const link = fresh.getByRole("link", { name: "Open a page five segments deep" })

  await link.hover()

  const preloaded = await waitForLookups(before, 200)
  const preloadTrace = preloaded[0]?.traceId ?? "none"

  await link.click()
  await fresh.getByLabel("Author status").filter({ hasText: "loaded" }).waitFor({ timeout: 8000 })
  await fresh
    .getByLabel("Everything that happened")
    .locator("ol li", { hasText: "route /org/" })
    .last()
    .getByRole("button", { name: /^Trace / })
    .click()
  await fresh.getByLabel("Spans").locator("li", { hasText: "served from" }).first().waitFor()

  const clickSpans = await fresh.getByLabel("Spans").locator("li").allInnerTexts()
  const seen = (await lookups()).filter((span) => !before.has(span.traceId))
  const byPreload = seen.filter((span) => span.traceId === preloadTrace)
  const servedFromPreload = clickSpans.filter((line) =>
    line.includes(`served from what trace ${preloadTrace.slice(0, 8)} loaded`),
  )
  const askedTwice = everyLookup.filter(
    (name) => seen.filter((span) => span.name === name).length > 1,
  )
  const missing = everyLookup.filter((name) => !seen.some((span) => span.name === name))

  await fresh.screenshot({ path: `${root}artifacts/devtools-hovered.png` })
  await fresh.close()

  return [
    ...(preloaded.length > 0 ? [] : ["hovering the link started no lookup"]),
    ...(askedTwice.length === 0
      ? []
      : [`clicking after hovering asked again for: ${askedTwice.join(", ")}`]),
    ...(missing.length === 0
      ? []
      : [`after hovering and clicking, never asked: ${missing.join(", ")}`]),
    ...(servedFromPreload.length >= byPreload.length
      ? []
      : [
          `the click's trace showed ${servedFromPreload.length} queries served from the hover's load, but the hover started ${byPreload.length}: ${clickSpans.join(" | ")}`,
        ]),
  ]
}

const problems = await steps()
  .then(async (found) => [...found, ...(await hoveredFirst())])
  .catch((cause: unknown) => [String(cause)])

await browser.close()
await server.close()
backend.kill()

if (problems.length > 0) {
  console.error(`The page five segments deep:\n${problems.join("\n")}`)
  process.exit(1)
}

console.log(
  "The page five segments deep: five lookups start together, the author's waits only for the report, all six are one trace, and going there again is served from that load and says so; hovering first starts the lookups, the click asks for none again, and its trace says each was served from the hover's load",
)
process.exit(0)
