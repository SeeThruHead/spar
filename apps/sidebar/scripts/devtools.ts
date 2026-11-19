import { launch } from "@spar/browsers"
import { createServer } from "vite"

const root = new URL("..", import.meta.url).pathname

const server = await createServer({ root, logLevel: "error", server: { port: 4189 } })

await server.listen()

const address = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:4189/"

const browser = await launch()

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const steps = async (): Promise<ReadonlyArray<string>> => {
  await page.goto(address)
  await page.getByRole("button", { name: "Devtools" }).click()
  await page.getByRole("searchbox").first().fill("notes")

  const log = page.getByLabel("Everything that happened")

  await log.getByText("filter").first().waitFor({ timeout: 5000 })

  const first = (await log.locator("li code").first().textContent()) ?? ""

  await page.getByRole("searchbox").first().fill("")
  await log.getByRole("button", { name: "Jump to 1" }).click()

  const rewound = await page.getByRole("searchbox").first().inputValue()
  const position = (await page.getByLabel("Timeline position").textContent()) ?? ""

  await page.screenshot({ path: `${root}artifacts/devtools-timeline.png` })
  await log.getByRole("button", { name: "Back to now" }).click()

  const live = await page.getByRole("searchbox").first().inputValue()

  return [
    ...(first.startsWith("ui ") && first.includes("filter")
      ? []
      : [`the log began with: ${first}`]),
    ...(rewound === "notes" ? [] : [`after jumping back the filter was "${rewound}"`]),
    ...(position === "At 1" ? [] : [`the timeline said "${position}"`]),
    ...(live === "" ? [] : [`back at now the filter was "${live}"`]),
  ]
}

const problems = await steps().catch((cause: unknown) => [String(cause)])

await browser.close()
await server.close()

if (problems.length > 0) {
  console.error(`Devtools in the dev server:\n${problems.join("\n")}`)
  process.exit(1)
}

console.log("Devtools in the dev server: the tools load, log an action, rewind it and return")
process.exit(0)
