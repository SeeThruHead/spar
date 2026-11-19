import { Schema } from "effect"
import { launch } from "@spar/browsers"
import { Recorded } from "spar/devtools/spans"
import { createServer } from "vite"

const root = new URL("..", import.meta.url).pathname

const backendOrigin = "http://127.0.0.1:4183"

const backend = Bun.spawn(["bun", "scripts/backend.ts"], {
  cwd: root,
  env: { ...Bun.env, PORT: "4183" },
  stdout: "ignore",
  stderr: "inherit",
})

Reflect.set(process.env, "SIDEBAR_BACKEND", backendOrigin)

const accepted = async (left: number): Promise<void> => {
  const done = await fetch(`${backendOrigin}/spans`)
    .then((answer) => answer.json())
    .then(
      (spans: unknown) =>
        Schema.decodeUnknownSync(Schema.Array(Recorded))(spans).some(
          (span) => span.name === "Agents.start" && span.endedAt !== null && !span.failed,
        ),
      () => false,
    )
  if (done || left === 0) return

  await Bun.sleep(100)

  return accepted(left - 1)
}

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

  const search = page.getByRole("searchbox").first()
  const spot = (await search.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }

  await page.getByRole("button", { name: "Pick a component" }).click()
  await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2)

  const highlighted = (await page.getByLabel("Highlighted component").textContent()) ?? ""

  await page.screenshot({ path: `${root}artifacts/devtools-picking.png` })
  await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2)

  const picked = (await page.getByLabel("Picked component").textContent()) ?? ""
  const where = (await page.getByLabel("Where it is").textContent()) ?? ""
  const propsShown = await page.getByLabel("Props", { exact: true }).innerText()
  const services = (await page.getByLabel("Services").textContent()) ?? ""

  await page.screenshot({ path: `${root}artifacts/devtools-inspecting.png` })
  await page.getByRole("searchbox").first().fill("triage")
  await page.getByLabel("What changed").getByText("prop filter").waitFor({ timeout: 5000 })

  const changed = await page.getByLabel("What changed").innerText()

  await page.screenshot({ path: `${root}artifacts/devtools-changes.png` })

  await page.getByRole("searchbox").first().fill("")
  await page.getByRole("button", { name: "Start an agent" }).click()
  await page.getByRole("textbox", { name: "What should it work on?" }).fill("Seen in a trace")
  await page.getByRole("button", { name: "Start agent" }).click()
  await accepted(50)

  const started = log.locator("li", { hasText: "command sidebar/BoardStore/started" })

  await started.getByRole("button", { name: /^Trace / }).click()

  const waterfall = page.getByLabel("Spans")

  await waterfall.locator('li[data-where="backend"]').first().waitFor({ timeout: 8000 })
  await page.getByRole("button", { name: "Refresh trace" }).click()
  await waterfall
    .locator('li[data-where="backend"]', { hasText: "Agents.start" })
    .nth(1)
    .waitFor({ timeout: 8000 })
  await page.getByLabel("Trace", { exact: true }).scrollIntoViewIfNeeded()

  const sides = await waterfall
    .locator("li")
    .evaluateAll((items) =>
      items.map(
        (item) =>
          `${item.getAttribute("data-where")} ${item.querySelector("strong")?.textContent} ${item.getAttribute("data-failed")}`,
      ),
    )

  await page.screenshot({ path: `${root}artifacts/devtools-trace.png` })

  const scratch = page.getByRole("region", { name: "Scratchpad" })
  const noted = async (text: string) => {
    await scratch.getByRole("textbox", { name: "Note" }).fill(text)
    await scratch.getByRole("button", { name: "Add note" }).click()
    await scratch.getByRole("listitem").filter({ hasText: text }).waitFor({ timeout: 5000 })
  }

  await noted("first")
  await noted("second")
  await log
    .locator("ol li", { hasText: 'added "first"' })
    .getByRole("button", { name: /^Jump to / })
    .click()

  const rewoundNotes = (await scratch.getByLabel("Scratchpad count").textContent()) ?? ""

  await log.getByRole("button", { name: "Fork from here" }).click()
  await noted("other")

  const forkedNotes = await scratch.getByRole("list").innerText()
  const branches = await page.getByLabel("Branches").innerText()

  await page.getByLabel("Branches").scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${root}artifacts/devtools-fork.png` })
  await page.getByLabel("Branches").getByRole("button", { name: "Main" }).click()
  await scratch.getByRole("listitem").filter({ hasText: "second" }).waitFor({ timeout: 5000 })

  const mainNotes = await scratch.getByRole("list").innerText()

  return [
    ...(rewoundNotes === "1 note"
      ? []
      : [`rewound to the first note, the count was "${rewoundNotes}"`]),
    ...(forkedNotes.includes("other") && !forkedNotes.includes("second")
      ? []
      : [`the fork's notes were: ${forkedNotes}`]),
    ...(branches.includes("Main") && branches.includes("Fork 1")
      ? []
      : [`the branches were: ${branches}`]),
    ...(mainNotes.includes("second") && !mainNotes.includes("other")
      ? []
      : [`back on the original the notes were: ${mainNotes}`]),
    ...(sides.some((side) => side.startsWith("page on "))
      ? []
      : [`the waterfall had no page event: ${sides.join(" | ")}`]),
    ...(sides.includes("backend Agents.start yes") && sides.includes("backend Agents.start no")
      ? []
      : [`the waterfall did not show both backend attempts: ${sides.join(" | ")}`]),
    ...(first.startsWith("ui ") && first.includes("filter")
      ? []
      : [`the log began with: ${first}`]),
    ...(rewound === "notes" ? [] : [`after jumping back the filter was "${rewound}"`]),
    ...(position === "At 1" ? [] : [`the timeline said "${position}"`]),
    ...(live === "" ? [] : [`back at now the filter was "${live}"`]),
    ...(highlighted === "SidebarView" ? [] : [`hovering highlighted "${highlighted}"`]),
    ...(picked === "SidebarView" ? [] : [`picking gave "${picked}"`]),
    ...(where.endsWith("SidebarView") ? [] : [`the picked component was at "${where}"`]),
    ...(propsShown.includes("filter") ? [] : [`its props were shown as: ${propsShown}`]),
    ...(services.includes("BoardStore") ? [] : [`its services were shown as: ${services}`]),
    ...(changed.includes('"triage"') ? [] : [`the change list said: ${changed}`]),
  ]
}

const problems = await steps().catch((cause: unknown) => [String(cause)])

await browser.close()
await server.close()
backend.kill()

if (problems.length > 0) {
  console.error(`Devtools in the dev server:\n${problems.join("\n")}`)
  process.exit(1)
}

console.log(
  "Devtools in the dev server: the tools load, log an action, rewind it, pick a component, show what changed in it, draw one trace across the page and the backend, and fork the program and go back",
)
process.exit(0)
