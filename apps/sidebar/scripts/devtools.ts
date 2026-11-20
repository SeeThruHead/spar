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

  const typed = log.locator("ol li", { hasText: 'filter "notes"' })
  const first = (await typed.locator("code").first().textContent()) ?? ""

  await page.getByRole("searchbox").first().fill("")
  await typed.getByRole("button", { name: /^Jump to / }).click()

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

  const peopleShown = page.getByRole("region", { name: "People" })

  await peopleShown.getByLabel("People status").filter({ hasText: "Loaded" }).waitFor()
  await peopleShown.getByRole("button", { name: "Export CSV" }).click()
  await peopleShown.getByLabel("Export problem").filter({ hasText: "Select at least" }).waitFor()
  await peopleShown.getByRole("checkbox", { name: "Alan Turing" }).check()
  await peopleShown.getByRole("checkbox", { name: "Ada Lovelace" }).check()
  await peopleShown.getByRole("button", { name: "Export CSV" }).click()
  await peopleShown.getByLabel("Exported CSV").filter({ hasText: "alan@example.com" }).waitFor()

  const exportedCsv = await peopleShown.getByLabel("Exported CSV").innerText()
  const loadedBy = await log.locator("ol li", { hasText: "sidebar/Users" }).allInnerTexts()

  await log
    .locator("ol li", { hasText: "exportRequested" })
    .last()
    .getByRole("button", { name: /^Trace / })
    .click()
  await page.getByLabel("Spans").locator("li", { hasText: "exported" }).first().waitFor()
  await page.getByLabel("Trace", { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${root}artifacts/devtools-export.png` })

  const counter = page.getByRole("region", { name: "Counter", exact: true })

  await counter.getByRole("button", { name: "Add 1" }).click()
  await counter.getByRole("button", { name: "Add 1" }).click()
  await counter.getByRole("button", { name: "Reset after a delay" }).click()
  await counter.getByRole("button", { name: "Reset after a delay" }).click()
  await page.keyboard.press("+")
  await counter.getByLabel("Count", { exact: true }).filter({ hasText: "3" }).waitFor()

  const duringReset = (await counter.getByLabel("Count", { exact: true }).textContent()) ?? ""
  const resetsStarted = await log.locator("ol li", { hasText: "resetClicked" }).count()

  await log.locator("ol li", { hasText: "resetClicked" }).first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${root}artifacts/devtools-reset.png` })
  await counter
    .getByLabel("Counter status")
    .filter({ hasText: "Counting" })
    .waitFor({ timeout: 8000 })

  const afterReset = (await counter.getByLabel("Count", { exact: true }).textContent()) ?? ""

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
    ...(exportedCsv === "name,email\nAda Lovelace,ada@example.com\nAlan Turing,alan@example.com"
      ? []
      : [`the exported file was: ${exportedCsv}`]),
    ...(["requested", "loaded"].every((word) => loadedBy.some((line) => line.includes(word)))
      ? []
      : [`the users query was logged as: ${loadedBy.join(" | ")}`]),
    ...(duringReset === "3" ? [] : [`during the reset the count was "${duringReset}"`]),
    ...(resetsStarted === 1
      ? []
      : [`a second reset was not ignored: ${resetsStarted} resets started`]),
    ...(afterReset === "0" ? [] : [`after the reset the count was "${afterReset}"`]),
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
    ...(/^At \d+$/.test(position) ? [] : [`the timeline said "${position}"`]),
    ...(live === "" ? [] : [`back at now the filter was "${live}"`]),
    ...(highlighted === "SidebarView" ? [] : [`hovering highlighted "${highlighted}"`]),
    ...(picked === "SidebarView" ? [] : [`picking gave "${picked}"`]),
    ...(where === "Shell / Sidebar" ? [] : [`the picked component was at "${where}"`]),
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
  "Devtools in the dev server: the tools load, log an action, rewind it, pick a component, show what changed in it, draw one trace across the page and the backend, load people into a store and export the selected ones' emails from it, ignore a second reset while one runs and keep counting from a button and the keyboard, and fork the program and go back",
)
process.exit(0)
