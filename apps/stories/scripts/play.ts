import { Schema } from "effect"
import { engine, launch } from "@spar/browsers"
import type { Browser, Page } from "playwright"

type Size = { readonly name: string; readonly width: number; readonly height: number }

type Story = {
  readonly path: string
  readonly title: string
  readonly play: (page: Page) => Promise<void>
}

const root = new URL("..", import.meta.url).pathname

const sizes: ReadonlyArray<Size> = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1280, height: 900 },
]

const Audit = Schema.Struct({
  violations: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      help: Schema.String,
      nodes: Schema.Array(Schema.Struct({ html: Schema.String })),
    }),
  ),
})

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}dist${path}`)

    return (await file.exists()) && !path.endsWith("/")
      ? new Response(file)
      : new Response(Bun.file(`${root}dist/index.html`))
  },
})

const shows = (page: Page, label: string, text: string): Promise<void> =>
  page.getByLabel(label, { exact: true }).filter({ hasText: text }).waitFor({ timeout: 5000 })

const focusIsOn = (page: Page, name: string): Promise<unknown> =>
  page.waitForFunction((expected) => document.activeElement?.textContent?.trim() === expected, name)

const dayHasFocus = (page: Page, name: string): Promise<unknown> =>
  page.waitForFunction(
    (expected) => document.activeElement?.getAttribute("aria-label") === expected,
    name,
  )

const staysOnScreen = async (page: Page, role: "tooltip" | "dialog" | "listbox"): Promise<void> => {
  const box = await page.getByRole(role).boundingBox()
  const view = page.viewportSize()
  if (box === null || view === null) throw new Error(`The ${role} has no place on the page`)
  if (box.x < 0 || box.x + box.width > view.width) {
    throw new Error(`The ${role} runs off the side: ${box.x} to ${box.x + box.width}`)
  }
  if (box.y < 0 || box.y + box.height > view.height) {
    throw new Error(`The ${role} runs off the top or bottom: ${box.y} to ${box.y + box.height}`)
  }
}

const optionHasFocus = (page: Page, name: string): Promise<unknown> =>
  page.waitForFunction((expected) => {
    const active = document.activeElement
    if (active?.getAttribute("role") !== "option") return false

    return active.textContent.trim() === expected
  }, name)

const stories: ReadonlyArray<Story> = [
  {
    path: "/controls",
    title: "Form controls",
    play: async (page) => {
      await page.getByRole("button", { name: "Save profile" }).click()
      await page.getByText("Enter a name").waitFor()
      await page.getByRole("textbox", { name: "Name" }).fill("Ada Lovelace")
      await page.getByRole("combobox", { name: "Plan" }).selectOption("free")
      await page.getByRole("checkbox", { name: "Send me news" }).check()
      await page.getByRole("textbox", { name: "Name" }).press("Enter")
      await shows(page, "Last saved", "Ada Lovelace on the free plan")
      await page.getByRole("switch", { name: "Compact layout" }).click()
      await page.getByRole("switch", { name: "Compact layout", checked: true }).waitFor()
    },
  },
  {
    path: "/tabs",
    title: "Tabs",
    play: async (page) => {
      await page.getByRole("tab", { name: "Overview" }).focus()
      await page.keyboard.press("ArrowRight")
      await page.getByRole("tab", { name: "Members", selected: true }).waitFor()
      await page.getByText("Who is on it.").waitFor()
      await page.keyboard.press("End")
      await page.getByRole("tab", { name: "Billing", selected: true }).waitFor()
      await page.keyboard.press("Home")
      await page.getByRole("tab", { name: "Overview", selected: true }).waitFor()
    },
  },
  {
    path: "/menu",
    title: "Menu",
    play: async (page) => {
      await page.getByRole("button", { name: "More actions" }).click()
      await page.getByRole("menu", { name: "More actions" }).waitFor()
      await focusIsOn(page, "Rename")
      await page.keyboard.press("ArrowDown")
      await focusIsOn(page, "Duplicate")
      await page.keyboard.press("Enter")
      await shows(page, "Last choice", "Duplicate")
      await page.getByRole("menu").waitFor({ state: "detached" })
      await focusIsOn(page, "More actions")
      await page.getByRole("button", { name: "More actions" }).click()
      await page.getByRole("menu").waitFor()
      await page.keyboard.press("Escape")
      await page.getByRole("menu").waitFor({ state: "detached" })
    },
  },
  {
    path: "/dialog",
    title: "Dialog",
    play: async (page) => {
      await page.getByRole("button", { name: "Open details" }).click()
      await page.getByRole("dialog", { name: "Project details" }).waitFor()
      await focusIsOn(page, "Close")
      await page.keyboard.press("Tab")
      await focusIsOn(page, "Close")
      await page.keyboard.press("Escape")
      await page.getByRole("dialog").waitFor({ state: "detached" })
      await focusIsOn(page, "Open details")
    },
  },
  {
    path: "/toast",
    title: "Toasts",
    play: async (page) => {
      await page.getByRole("button", { name: "Show a notice" }).click()
      await page.getByText("Your changes are saved").waitFor()
      await page.getByRole("button", { name: "Show a problem" }).click()
      await page.getByText("The server could not be reached").waitFor()
      await page.getByRole("button", { name: "Dismiss" }).first().click()
      await page.getByText("Your changes are saved").waitFor({ state: "detached" })
    },
  },
  {
    path: "/tooltip",
    title: "Tooltip",
    play: async (page) => {
      const button = page.getByRole("button", { name: "Delete project" })

      await button.hover()
      await page.getByRole("tooltip").waitFor()
      await page.getByRole("heading", { name: "Tooltip" }).hover()
      await page.getByRole("tooltip").waitFor({ state: "detached" })
      await button.focus()
      await page.getByRole("tooltip").waitFor()
      await page.keyboard.press("Escape")
      await page.getByRole("tooltip").waitFor({ state: "detached" })
      await button.blur()
      await button.focus()
      await page
        .getByRole("button", { name: "Delete project", description: /Removes the project/ })
        .waitFor()
      await staysOnScreen(page, "tooltip")
    },
  },
  {
    path: "/popover",
    title: "Popover",
    play: async (page) => {
      await page.getByRole("button", { name: "Sharing" }).click()
      await page.getByRole("dialog", { name: "Sharing" }).waitFor()
      await staysOnScreen(page, "dialog")
      await page.keyboard.press("Escape")
      await page.getByRole("dialog").waitFor({ state: "detached" })
      await focusIsOn(page, "Share")
      await page.keyboard.press("Enter")
      await page.getByRole("dialog", { name: "Sharing" }).waitFor()
    },
  },
  {
    path: "/listbox",
    title: "Listbox",
    play: async (page) => {
      await page.getByRole("combobox", { name: "Size" }).focus()
      await page.keyboard.press("ArrowDown")
      await page.getByRole("listbox", { name: "Size" }).waitFor()
      await optionHasFocus(page, "Medium")
      await page.keyboard.press("l")
      await optionHasFocus(page, "Large")
      await page.keyboard.press("Enter")
      await page.getByRole("listbox").waitFor({ state: "detached" })
      await shows(page, "Chosen size", "l")
      await page.getByRole("combobox", { name: "Size" }).click()
      await page.getByRole("option", { name: "Small" }).click()
      await shows(page, "Chosen size", "s")
      await page.getByRole("combobox", { name: "Size" }).click()
      await page.getByRole("listbox", { name: "Size" }).waitFor()
      await staysOnScreen(page, "listbox")
    },
  },
  {
    path: "/combobox",
    title: "Combobox",
    play: async (page) => {
      const fruit = page.getByRole("combobox", { name: "Fruit" })
      const typed = async (text: string) => {
        await fruit.focus()
        await page.keyboard.press("ControlOrMeta+a")
        await page.keyboard.type(text)
      }

      await typed("an")
      await page.getByRole("listbox", { name: "Fruit" }).waitFor()
      await page.keyboard.press("ArrowDown")
      await page.getByRole("option", { name: "Mango", selected: true }).waitFor()
      await page.keyboard.press("Enter")
      await page.getByRole("listbox").waitFor({ state: "detached" })
      await shows(page, "Picked fruit", "mango")
      await typed("ap")
      await page.getByRole("option", { name: "Apple" }).click()
      await shows(page, "Picked fruit", "apple")
      await typed("o")
      await page.getByRole("listbox", { name: "Fruit" }).waitFor()
      await staysOnScreen(page, "listbox")
    },
  },
  {
    path: "/calendar",
    title: "Calendar",
    play: async (page) => {
      await page.getByRole("button", { name: "Thursday, November 26, 2026" }).focus()
      await page.keyboard.press("ArrowRight")
      await dayHasFocus(page, "Friday, November 27, 2026")
      await page.keyboard.press("PageDown")
      await page.getByRole("grid", { name: "December 2026" }).waitFor()
      await dayHasFocus(page, "Sunday, December 27, 2026")
      await page.keyboard.press("Enter")
      await shows(page, "Picked day", "2026-12-27")
      await page.getByRole("button", { name: "Previous month" }).click()
      await page.getByRole("button", { name: "Monday, November 2, 2026" }).click()
      await shows(page, "Picked day", "2026-11-02")
    },
  },
  {
    path: "/date-picker",
    title: "Date picker",
    play: async (page) => {
      await page.getByRole("button", { name: "Start: Thursday, November 26, 2026" }).click()
      await page.getByRole("dialog", { name: "Start" }).waitFor()
      await dayHasFocus(page, "Thursday, November 26, 2026")
      await staysOnScreen(page, "dialog")
      await page.keyboard.press("ArrowDown")
      await dayHasFocus(page, "Thursday, December 3, 2026")
      await page.keyboard.press("Enter")
      await page.getByRole("dialog").waitFor({ state: "detached" })
      await shows(page, "Picked start", "2026-12-03")
      await page.getByRole("button", { name: "Start: Thursday, December 3, 2026" }).click()
      await page.keyboard.press("Escape")
      await page.getByRole("dialog").waitFor({ state: "detached" })
      await shows(page, "Picked start", "2026-12-03")
    },
  },
]

const audit = async (page: Page): Promise<ReadonlyArray<string>> => {
  const found = await page.evaluate(async () => {
    const run: unknown = Reflect.get(Reflect.get(globalThis, "axe") ?? {}, "run")

    return typeof run === "function"
      ? run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })
      : { violations: [{ id: "axe-missing", help: "axe did not load", nodes: [] }] }
  })

  return Schema.decodeUnknownSync(Audit)(found).violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.html).join(" ")})`,
  )
}

const visit = async (
  browser: Browser,
  size: Size,
  story: Story,
): Promise<ReadonlyArray<string>> => {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })

  await page.goto(`http://127.0.0.1:${server.port}${story.path}`)
  await page.getByRole("heading", { name: story.title }).waitFor()
  await page.addScriptTag({ path: Bun.resolveSync("axe-core/axe.min.js", root) })

  const before = await audit(page)

  await story.play(page)

  const after = await audit(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )

  await page.screenshot({ path: `${root}artifacts/${size.name}${story.path}.png` })
  await page.close()

  return [...before, ...after, ...(overflow ? ["the page scrolls sideways"] : [])].map(
    (problem) => `${story.title} at ${size.name}: ${problem}`,
  )
}

const browser = await launch()
const visits = sizes.flatMap((size) => stories.map((story) => ({ size, story })))
const problems = await visits
  .reduce<Promise<ReadonlyArray<string>>>(
    (collected, { size, story }) =>
      collected.then(async (all) => [...all, ...(await visit(browser, size, story))]),
    Promise.resolve([]),
  )
  .finally(async () => {
    await browser.close()
    await server.stop(true)
  })

if (problems.length > 0) {
  console.error([...new Set(problems)].join("\n"))
  process.exit(1)
}

console.log(
  `${stories.length} stories played at ${sizes.length} sizes with no accessibility problems in ${engine()}`,
)
