import { Effect, Layer, Queue, Schedule } from "effect"
import type { Schema } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { FetchHttpClient } from "effect/http"
import { engine, launch } from "@spar/browsers"
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

  await section.getByRole("checkbox", { name: "Buy milk" }).focus()
  await section.getByRole("button", { name: "Reverse order" }).evaluate((button) => {
    if (button instanceof HTMLElement) button.click()
  })
  await shows(items.first(), "Walk the dog")
  await page.waitForFunction(() => {
    if (!("moveBefore" in Element.prototype)) return true

    return document.activeElement?.closest("li")?.textContent?.includes("Buy milk") === true
  })
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
  await page.bringToFront()
  await shows(here.getByRole("listitem").filter({ hasText: "Feed the cat" }), "Feed the cat")
  await addTodo(here, "Water the plants")
  await other.bringToFront()
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

const offlineNoise = ["ERR_INTERNET_DISCONNECTED", "WebKit encountered an internal error"]

const devtoolsPort = 4189

const devtoolsUrl = `http://127.0.0.1:${devtoolsPort}`

const answering = async (left: number): Promise<void> => {
  const up = await fetch(`${devtoolsUrl}/mcp`).then(
    () => true,
    () => false,
  )
  if (up) return
  if (left === 0) throw new Error("The devtools server did not start")

  await Bun.sleep(100)

  return answering(left - 1)
}

const asAgent = Effect.gen(function* () {
  const client = yield* McpClient.McpClient
  const tools = yield* client.listTools()
  const call = (name: string, given: Readonly<Record<string, Schema.Json>>) =>
    Effect.fromNullishOr(tools.find((tool) => tool.name === name)).pipe(
      Effect.flatMap((tool) => client.callTool({ tool, arguments: given })),
      Effect.map((result) =>
        result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(""),
      ),
    )
  const counterStore = "demo/counter/CounterStore"
  const listed = yield* Effect.repeat(call("list_stores", {}), {
    until: (text) => text.includes(counterStore),
    schedule: Schedule.spaced("100 millis"),
  })
  const ran = yield* call("run_action", {
    store: counterStore,
    action: "incremented",
    payload: { by: 7 },
  })

  return { listed, ran }
}).pipe(
  Effect.provide(
    McpClient.layerHttp({
      name: "browser test",
      version: "0.0.0",
      url: `${devtoolsUrl}/mcp`,
      protocol: McpProtocol.v2025_11_25,
    }).pipe(Layer.provide(FetchHttpClient.layer)),
  ),
)

const drivenByAnAgent = async (page: Page, appUrl: string): Promise<void> => {
  const devtools = Bun.spawn(["bun", `${root}../../packages/devtools-mcp/src/main.ts`], {
    env: { ...Bun.env, SPAR_DEVTOOLS_PORT: String(devtoolsPort) },
    stdout: "ignore",
    stderr: "inherit",
  })

  await answering(100)
    .then(async () => {
      await page.goto(`${new URL(appUrl).origin}/?devtools=${encodeURIComponent(devtoolsUrl)}`)

      const section = page.getByRole("region", { name: "Counter", exact: true })
      const before = Number(await section.getByLabel("Count").textContent())
      const { listed, ran } = await Effect.runPromise(asAgent)

      if (!listed.includes("demo/todos/TodoStore")) throw new Error(`The agent saw only ${listed}`)
      if (!ran.includes(String(before + 7))) throw new Error(`The agent was told ${ran}`)

      await shows(section.getByLabel("Count"), new RegExp(`^${before + 7}$`))
    })
    .finally(async () => {
      devtools.kill()
      await devtools.exited
      await page.close()
    })
}

const isExpectedOffline = (text: string): boolean =>
  offlineNoise.some((noise) => text.includes(noise))

const run = async (): Promise<void> => {
  const browser = await launch()
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
  await drivenByAnAgent(await context.newPage(), page.url())
  await browser.close()

  const failures = Effect.runSync(Queue.clear(errors)).filter((text) => !isExpectedOffline(text))

  if (failures.length > 0) throw new Error(`The page logged errors:\n${failures.join("\n")}`)
}

await run().finally(() => server.stop(true))
console.log(
  `Browser test passed in ${engine()}: counter, keyed list, mail thread, state kept across a reload, two tabs kept in step, sending held while offline, an agent driving it through the devtools server`,
)
