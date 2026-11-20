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

const server = await createServer({ root, logLevel: "error", server: { port: 4191 } })

await server.listen()

const address = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:4191/"

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

const problems = await steps().catch((cause: unknown) => [String(cause)])

await browser.close()
await server.close()
backend.kill()

if (problems.length > 0) {
  console.error(`The page five segments deep:\n${problems.join("\n")}`)
  process.exit(1)
}

console.log(
  "The page five segments deep: five lookups start together, the author's waits only for the report, all six are one trace, and going there again is served from that load and says so",
)
process.exit(0)
