import { Effect, Queue } from "effect"
import { chromium } from "playwright"
import type { Locator, Page } from "playwright"
import { start } from "./site.ts"

const root = new URL("..", import.meta.url).pathname

const server = start(0)

const shows = (locator: Locator, text: string | RegExp): Promise<void> =>
  locator.filter({ hasText: text }).first().waitFor({ timeout: 5000 })

const counter = async (page: Page): Promise<void> => {
  const section = page.getByRole("region", { name: "Counter", exact: true })

  await shows(section.getByLabel("Count"), /^0$/)
  await section.getByRole("button", { name: "Add one" }).click()
  await section.getByRole("button", { name: "Add one" }).click()
  await shows(section.getByLabel("Count"), /^2$/)
  await shows(section.getByLabel("Doubled"), /^4$/)
  await section.getByRole("button", { name: "Reset" }).click()
  await shows(section.getByLabel("Count"), /^0$/)

  const tools = page.getByRole("region", { name: "demo/counter/CounterStore" })

  await tools.getByRole("button", { name: "Back" }).click()
  await shows(section.getByLabel("Count"), /^2$/)
  await shows(tools.getByLabel("demo/counter/CounterStore position"), "action 2")
  await tools.getByRole("button", { name: "Live" }).click()
  await shows(section.getByLabel("Count"), /^0$/)
}

const addTodo = async (section: Locator, title: string): Promise<void> => {
  await section.getByLabel("New todo").fill(title)
  await section.getByRole("button", { name: "Add todo" }).click()
  await shows(section.getByRole("listitem"), title)
}

const todos = async (page: Page): Promise<void> => {
  const section = page.getByRole("region", { name: "Todos", exact: true })
  const items = section.getByRole("listitem")

  await addTodo(section, "Buy milk")
  await addTodo(section, "Walk the dog")
  await section.getByLabel("New todo").and(page.locator(":placeholder-shown")).waitFor()
  await shows(section.getByLabel("Remaining"), /^2$/)

  await items.first().evaluate((node) => node.setAttribute("data-kept", "yes"))
  await section.getByRole("checkbox", { name: "Buy milk" }).check()
  await shows(section.getByLabel("Remaining"), /^1$/)

  await section.getByRole("button", { name: "Reverse order" }).click()
  await shows(items.first(), "Walk the dog")
  await items
    .last()
    .and(page.locator('[data-kept="yes"]'))
    .filter({ hasText: "Buy milk" })
    .waitFor()

  await items.first().getByRole("button", { name: "Remove" }).click()
  await items.filter({ hasText: "Walk the dog" }).waitFor({ state: "detached" })
}

const mail = async (page: Page): Promise<void> => {
  const thread = page.getByRole("article", { name: "Welcome to the hangar" })

  await thread.waitFor()
  await shows(page.getByRole("alert"), 'The server has no thread called "missing"')

  await thread.getByRole("button", { name: "Actions" }).click()
  await thread.getByRole("menu", { name: "Thread actions" }).waitFor()
  await thread.getByRole("button", { name: "Actions", expanded: true }).waitFor()
  await thread.getByRole("menuitem", { name: "Archive" }).click()
  await shows(thread.getByLabel("Thread status"), "Archived")
  await thread.getByRole("menu").waitFor({ state: "detached" })

  await thread.getByRole("button", { name: "Actions" }).click()
  await thread.getByRole("menu").waitFor()
  await page.keyboard.press("Escape")
  await thread.getByRole("menu").waitFor({ state: "detached" })

  await thread.getByRole("button", { name: "Actions" }).click()
  await thread.getByRole("menu").waitFor()
  await page.getByRole("heading", { name: "Mail threads" }).click()
  await thread.getByRole("menu").waitFor({ state: "detached" })
  await shows(thread.getByLabel("Thread status"), "Archived")

  await thread.getByLabel("Reply", { exact: true }).fill("On my way")
  await thread.getByRole("button", { name: "Send reply" }).click()
  await shows(thread.getByRole("list", { name: "Replies" }).getByRole("listitem"), "On my way")
  await shows(thread.getByLabel("Unsent replies"), /^0$/)
}

const afterReload = async (page: Page): Promise<void> => {
  const section = page.getByRole("region", { name: "Todos", exact: true })

  await page.reload()
  await shows(section.getByRole("listitem"), "Buy milk")
  await section.getByRole("checkbox", { name: "Buy milk", checked: true }).waitFor()
  await shows(section.getByLabel("Remaining"), /^0$/)
}

const twoTabs = async (page: Page): Promise<void> => {
  const other = await page.context().newPage()
  const here = page.getByRole("region", { name: "Todos", exact: true })
  const there = other.getByRole("region", { name: "Todos", exact: true })

  await other.goto(page.url())
  await shows(there.getByRole("listitem"), "Buy milk")
  await addTodo(there, "Feed the cat")
  await shows(here.getByRole("listitem").filter({ hasText: "Feed the cat" }), "Feed the cat")
  await addTodo(here, "Water the plants")
  await shows(
    there.getByRole("listitem").filter({ hasText: "Water the plants" }),
    "Water the plants",
  )
  await here
    .getByRole("listitem")
    .filter({ hasText: "Feed the cat" })
    .getByRole("button", { name: "Remove" })
    .click()
  await there
    .getByRole("listitem")
    .filter({ hasText: "Feed the cat" })
    .waitFor({ state: "detached" })
  await other.reload()
  await shows(
    there.getByRole("listitem").filter({ hasText: "Water the plants" }),
    "Water the plants",
  )
  await shows(there.getByRole("listitem"), /Buy milk/)
  await other.close()
}

const offline = async (page: Page): Promise<void> => {
  const thread = page.getByRole("article", { name: "Welcome to the hangar" })
  const unsent = thread.getByLabel("Unsent replies")

  await thread.waitFor()
  await page.context().setOffline(true)
  await thread.getByLabel("Reply", { exact: true }).fill("Sent from a tunnel")
  await thread.getByRole("button", { name: "Send reply" }).click()
  await shows(
    thread.getByRole("list", { name: "Replies" }).getByRole("listitem"),
    "Sent from a tunnel",
  )
  await shows(unsent, /^1$/)
  await page.waitForTimeout(1500)
  await shows(unsent, /^1$/)
  await page.context().setOffline(false)
  await shows(unsent, /^0$/)
}

const isExpectedOffline = (text: string): boolean => text.includes("ERR_INTERNET_DISCONNECTED")

const run = async (): Promise<void> => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 820, height: 1100 } })
  const page = await context.newPage()
  const errors = Effect.runSync(Queue.unbounded<string>())

  page.on("pageerror", (error) => Queue.offerUnsafe(errors, String(error)))
  page.on(
    "console",
    (message) => message.type() === "error" && Queue.offerUnsafe(errors, message.text()),
  )

  const tracesSent = page.waitForResponse((response) => response.url().includes("/otlp/v1/traces"))

  await page.goto(`http://127.0.0.1:${server.port}/`)
  await shows(page.getByRole("status"), "Loading thread welcome")
  await counter(page)
  await todos(page)
  await mail(page)
  await tracesSent
  await page.screenshot({ path: `${root}artifacts/demo.png`, fullPage: true })
  await afterReload(page)
  await twoTabs(page)
  await offline(page)
  await browser.close()

  const failures = Effect.runSync(Queue.clear(errors)).filter((text) => !isExpectedOffline(text))

  if (failures.length > 0) throw new Error(`The page logged errors:\n${failures.join("\n")}`)
}

await run().finally(() => server.stop(true))
console.log(
  "Browser test passed: counter, keyed list, mail thread, state kept across a reload, two tabs kept in step, sending held while offline",
)
