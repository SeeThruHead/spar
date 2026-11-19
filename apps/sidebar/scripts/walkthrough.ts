import { Schema } from "effect"
import { engine, launch } from "@spar/browsers"
import type { Browser, Page } from "playwright"

type Size = { readonly name: string; readonly width: number; readonly height: number }

const root = new URL("..", import.meta.url).pathname

const sizes: ReadonlyArray<Size> = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
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
    if (path.startsWith("/otlp/")) return new Response(null, { status: 204 })

    const file = Bun.file(`${root}dist${path}`)

    return (await file.exists()) && !path.endsWith("/")
      ? new Response(file)
      : new Response(Bun.file(`${root}dist/index.html`))
  },
})

const audit = async (page: Page, where: string): Promise<ReadonlyArray<string>> => {
  const found = await page.evaluate(async () => {
    const run: unknown = Reflect.get(Reflect.get(globalThis, "axe") ?? {}, "run")

    return typeof run === "function"
      ? run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })
      : { violations: [{ id: "axe-missing", help: "axe did not load", nodes: [] }] }
  })
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )

  return [
    ...Schema.decodeUnknownSync(Audit)(found).violations.map(
      (violation) =>
        `${where}: ${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.html.slice(0, 120)).join(" ")})`,
    ),
    ...(sideways ? [`${where}: the page scrolls sideways`] : []),
  ]
}

const spoken = async (page: Page, size: Size, name: string): Promise<ReadonlyArray<string>> => {
  if (size.name !== "desktop") return []

  const read = await page.locator("body").ariaSnapshot()
  const tree = `${read.replace(/(status "Not yet sent": )"\d+"/, "$1a count")}\n`
  const file = Bun.file(`${root}spoken/${name}.txt`)
  if (Bun.env["SPOKEN"] === "write") return Bun.write(file, tree).then(() => [])

  const kept = (await file.exists()) ? await file.text() : ""

  return kept === tree
    ? []
    : [`${name}: what assistive technology is given has changed from spoken/${name}.txt:\n${tree}`]
}

const told = (held: boolean, problem: string): ReadonlyArray<string> => (held ? [] : [problem])

const focusedText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const active = document.activeElement
    const label = active?.getAttribute("aria-label") ?? active?.textContent?.trim() ?? ""

    return active === document.body ? "" : label
  })

const tabTo = async (page: Page, text: string, left = 40): Promise<void> => {
  if ((await focusedText(page)).includes(text)) return
  if (left === 0) throw new Error(`Tab never reached "${text}"`)

  await page.keyboard.press("Tab")

  return tabTo(page, text, left - 1)
}

const walk = async (browser: Browser, size: Size): Promise<ReadonlyArray<string>> => {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } })
  const page = await context.newPage()
  const shot = (name: string) =>
    page.screenshot({ path: `${root}artifacts/${size.name}-${name}.png` })

  page.setDefaultTimeout(8000)
  await page.goto(`http://127.0.0.1:${server.port}/`)
  await page.getByRole("heading", { level: 1, name: "Agents" }).waitFor()
  await page.addScriptTag({ path: Bun.resolveSync("axe-core/axe.min.js", root) })

  const start = [
    ...(await audit(page, `${size.name} first view`)),
    ...(await spoken(page, size, "first-view")),
  ]

  await shot("1-first-view")
  await tabTo(page, "Start an agent")
  await page.keyboard.press("Enter")
  await page.getByRole("dialog", { name: "Start an agent" }).waitFor()

  const dialog = [
    ...(await audit(page, `${size.name} start dialog`)),
    ...(await spoken(page, size, "start-dialog")),
    ...told(
      await page
        .getByRole("dialog", { name: "Start an agent" })
        .evaluate((opened) => opened.contains(document.activeElement)),
      `${size.name}: opening the dialog did not move focus into it`,
    ),
  ]

  await page.keyboard.press("Tab")
  await page.keyboard.press("Enter")
  await page.getByText("Enter a name").waitFor()
  await shot("2-dialog-with-problem")
  await page
    .getByRole("textbox", { name: "What should it work on?" })
    .fill("Tidy the release notes")
  await page.keyboard.press("Enter")
  await page.getByRole("dialog").waitFor({ state: "detached" })
  await page.getByText("Started Tidy the release notes").waitFor()
  await shot("3-started-with-toast")

  const toast = [
    ...(await audit(page, `${size.name} toast`)),
    ...(await spoken(page, size, "toast")),
    ...told(
      await page
        .getByText("Started Tidy the release notes")
        .evaluate((shown) => shown.closest("[aria-live], [role=status], [role=alert]") !== null),
      `${size.name}: the toast is not in a live region, so it is never announced`,
    ),
    ...told(
      (await focusedText(page)).includes("Start an agent"),
      `${size.name}: closing the dialog did not return focus to the button that opened it`,
    ),
  ]

  await tabTo(page, "Actions for Trip planning")
  await page.keyboard.press("Enter")
  await page.getByRole("menu", { name: "Actions for Trip planning" }).waitFor()
  await shot("4-menu-open")

  const menu = [...(await audit(page, `${size.name} menu`)), ...(await spoken(page, size, "menu"))]

  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await page.getByRole("dialog", { name: "Edit tags" }).waitFor()
  await page.getByRole("textbox", { name: "Tags" }).fill("travel")
  await page.keyboard.press("Enter")
  await page.getByRole("dialog").waitFor({ state: "detached" })
  await page.getByRole("link", { name: /Trip planning/ }).click()
  await page.getByRole("heading", { level: 1, name: "Trip planning" }).waitFor()
  await page.getByText("The server has no record of Trip planning yet.").waitFor()
  await shot("5-agent-page")

  const agent = [
    ...(await audit(page, `${size.name} agent page`)),
    ...(await spoken(page, size, "agent-page")),
  ]

  await page.setViewportSize({ width: Math.round(size.width * 0.6), height: size.height })
  await shot("6-narrower")

  const narrow = await audit(page, `${size.name} narrower`)

  await page.getByLabel("Filter agents").fill("zzz")
  await shot("7-nothing-matches")
  await context.setOffline(true)
  await page.getByLabel("Connection").filter({ hasText: "Offline" }).waitFor()
  await context.setOffline(false)
  await page.getByLabel("Connection").filter({ hasText: "Online" }).waitFor()
  await context.close()

  return [...start, ...dialog, ...toast, ...menu, ...agent, ...narrow]
}

const browser = await launch()
const findings = await sizes
  .reduce<Promise<ReadonlyArray<string>>>(
    (collected, size) => collected.then(async (all) => [...all, ...(await walk(browser, size))]),
    Promise.resolve([]),
  )
  .finally(async () => {
    await browser.close()
    await server.stop(true)
  })

console.log(
  findings.length === 0
    ? `Walked the app by keyboard at ${sizes.length} sizes in ${engine()} and found nothing`
    : [...new Set(findings)].join("\n"),
)

if (findings.length > 0) process.exit(1)
