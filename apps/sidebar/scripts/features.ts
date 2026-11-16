import { engine, launch } from "@spar/browsers"
import type { Browser, Page } from "playwright"

type Scenario = { readonly name: string; readonly steps: ReadonlyArray<string> }

type Size = { readonly name: string; readonly width: number; readonly height: number }

type Step = readonly [RegExp, (page: Page, ...words: ReadonlyArray<string>) => Promise<unknown>]

const root = new URL("..", import.meta.url).pathname

const sizes: ReadonlyArray<Size> = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
]

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    if (path.startsWith("/otlp/")) return new Response(null, { status: 204 })

    const file = Bun.file(`${root}dist${path}`)

    return (await file.exists()) && !path.endsWith("/")
      ? new Response(file)
      : new Response(Bun.file(`${root}dist/index.html`))
  },
})

const origin = (): string => `http://127.0.0.1:${server.port}`

const section = (page: Page, title: string) =>
  page.getByRole("region", { name: title, exact: true })

const row = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("link", { name }) })

const steps: ReadonlyArray<Step> = [
  [/^the app is open$/, (page) => page.goto(origin())],
  [/^the app is open at "(.+)"$/, (page, path) => page.goto(`${origin()}${path}`)],
  [
    /^"(.+)" shows "(.*)"$/,
    (page, label, text) =>
      page
        .getByLabel(label, { exact: true })
        .filter({ hasText: new RegExp(`^${text}$`) })
        .waitFor(),
  ],
  [
    /^the "(.+)" section lists "(.*)"$/,
    (page, title, names) =>
      page.waitForFunction(
        ({ wanted, expected }) =>
          [...document.querySelectorAll(`section[aria-label="${wanted}"] .agent-name`)]
            .map((node) => node.textContent)
            .join(", ") === expected,
        { wanted: title, expected: names },
      ),
  ],
  [
    /^there is no "(.+)" section$/,
    (page, title) => section(page, title).waitFor({ state: "detached" }),
  ],
  [/^I filter agents by "(.*)"$/, (page, text) => page.getByLabel("Filter agents").fill(text)],
  [
    /^I toggle the "(.+)" section$/,
    (page, title) => section(page, title).getByRole("button").first().click(),
  ],
  [/^I reload the page$/, (page) => page.reload()],
  [
    /^I choose "(.+)" from the menu of "(.+)"$/,
    async (page, item, name) => {
      await page.getByRole("button", { name: `Actions for ${name}` }).click()
      await page.getByRole("menuitem", { name: item }).click()
    },
  ],
  [
    /^I fill "(.+)" with "(.*)"$/,
    (page, label, text) => page.getByRole("textbox", { name: label, exact: true }).fill(text),
  ],
  [/^I press "(.+)"$/, (page, name) => page.getByRole("button", { name, exact: true }).click()],
  [
    /^I select "(.+)" for "(.+)"$/,
    (page, option, label) =>
      page.getByLabel(label, { exact: true }).selectOption({ label: option }),
  ],
  [
    /^the row "(.+)" shows "(.+)"$/,
    (page, name, text) => row(page, name).getByText(text).waitFor(),
  ],
  [/^I go offline$/, (page) => page.context().setOffline(true)],
  [/^I go online$/, (page) => page.context().setOffline(false)],
  [/^I open the agent "(.+)"$/, (page, name) => page.getByRole("link", { name }).click()],
  [
    /^the page heading is "(.+)"$/,
    (page, name) => page.getByRole("heading", { level: 1, name, exact: true }).waitFor(),
  ],
  [/^I go back$/, (page) => page.goBack()],
  [
    /^I see the alert "(.+)"$/,
    (page, text) => page.getByRole("alert").filter({ hasText: text }).waitFor(),
  ],
]

const stepText = (line: string): string => line.trim().replace(/^(Given|When|Then|And|But) /, "")

const parse = (feature: string): ReadonlyArray<Scenario> =>
  feature
    .split(/\n\s*Scenario: /)
    .slice(1)
    .map((block) => {
      const [name = "", ...lines] = block.split("\n")

      return {
        name: name.trim(),
        steps: lines.map(stepText).filter((line) => line !== ""),
      }
    })

const perform = (page: Page, text: string): Promise<unknown> => {
  const found = steps.find(([pattern]) => pattern.test(text))
  if (found === undefined) return Promise.reject(new Error(`No step matches: ${text}`))

  const [pattern, action] = found

  return action(page, ...(pattern.exec(text) ?? []).slice(1))
}

const play = async (
  browser: Browser,
  size: Size,
  scenario: Scenario,
): Promise<ReadonlyArray<string>> => {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } })
  const page = await context.newPage()

  page.setDefaultTimeout(8000)

  const outcome = await scenario.steps
    .reduce<Promise<unknown>>(
      (done, text) => done.then(() => perform(page, text)),
      Promise.resolve(),
    )
    .then(
      () => [],
      (error: unknown) => [`${scenario.name} at ${size.name}: ${String(error).split("\n")[0]}`],
    )

  await context.close()

  return outcome
}

const scenarios = parse(await Bun.file(`${root}features/sidebar.feature`).text())
const browser = await launch()
const runs = sizes.flatMap((size) => scenarios.map((scenario) => ({ size, scenario })))
const failures = await runs
  .reduce<Promise<ReadonlyArray<string>>>(
    (collected, { size, scenario }) =>
      collected.then(async (all) => [...all, ...(await play(browser, size, scenario))]),
    Promise.resolve([]),
  )
  .finally(async () => {
    await browser.close()
    await server.stop(true)
  })

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}

console.log(`${scenarios.length} scenarios passed at ${sizes.length} sizes in ${engine()}`)
