import { Schema } from "effect"
import { launch } from "@spar/browsers"
import { Recorded } from "spar/devtools/spans"

const port = 4198

const origin = `http://127.0.0.1:${port}`

const backend = Bun.spawn(["bun", "scripts/backend.ts"], {
  env: { ...Bun.env, PORT: String(port) },
  stdout: "ignore",
  stderr: "inherit",
})

const spans = async (path: string) =>
  Schema.decodeUnknownSync(Schema.Array(Recorded))(
    await fetch(`${origin}${path}`).then((answer) => answer.json()),
  )

const ready = async (left: number): Promise<boolean> => {
  const up = await fetch(`${origin}/spans`).then(
    () => true,
    () => false,
  )
  if (up || left === 0) return up

  await Bun.sleep(100)

  return ready(left - 1)
}

const accepted = async (left: number): Promise<void> => {
  const recent = await spans("/spans")
  const done = recent.some(
    (span) => span.name === "Agents.start" && span.endedAt !== null && !span.failed,
  )
  if (done || left === 0) return

  await Bun.sleep(100)

  return accepted(left - 1)
}

const steps = async (): Promise<ReadonlyArray<string>> => {
  const browser = await launch()
  const page = await browser.newPage()
  const posted = new Set<number>()

  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/otlp/")) posted.add(response.status())
  })
  await page.goto(origin)
  await page.getByRole("button", { name: "Start an agent" }).click()
  await page.getByRole("textbox", { name: "What should it work on?" }).fill("Traced agent")
  await page.getByRole("button", { name: "Start agent" }).click()
  await accepted(40)
  await page.getByRole("link", { name: /Traced agent/ }).click()
  await page.getByText(/^The server started this agent as /).waitFor({ timeout: 8000 })
  await page.waitForTimeout(1500)
  await browser.close()

  const recent = await spans("/spans")
  const started = recent.filter((span) => span.name === "Agents.start")
  const trace = await spans(`/spans/${started[0]?.traceId ?? "none"}`)
  const own = new Set(trace.map((span) => span.spanId))
  const fromThePage = trace.filter((span) => !own.has(span.parentSpanId ?? ""))
  const refused = [...posted].filter((status) => status >= 300)

  console.log(`The trace of the started agent: ${started[0]?.traceId ?? "none"}`)

  return [
    ...(started.length >= 2 ? [] : [`the backend saw ${started.length} start attempts`]),
    ...(started.every((span) => span.traceId === started[0]?.traceId)
      ? []
      : ["the retry was not in the trace of the first attempt"]),
    ...(fromThePage.length >= 2 && fromThePage.every((span) => span.parentSpanId !== null)
      ? []
      : ["the backend spans were not continued from the page"]),
    ...(recent.some((span) => span.name === "Agents.describe")
      ? []
      : ["the page never asked for the record"]),
    ...(posted.size > 0 ? [] : ["the page sent no telemetry"]),
    ...(refused.length === 0 ? [] : [`telemetry was refused with ${refused.join(", ")}`]),
  ]
}

const problems = (await ready(50))
  ? await steps().catch((cause: unknown) => [String(cause)])
  : ["the backend did not start"]

backend.kill()

if (problems.length > 0) {
  console.error(`The app with its backend:\n${problems.join("\n")}`)
  process.exit(1)
}

console.log(
  "The app with its backend: an agent started in the page is one trace through the backend, retry included, and the page shows the backend\x27s record",
)
process.exit(0)
