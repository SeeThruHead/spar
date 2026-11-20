import { chromium } from "playwright"
import type { Browser, Page } from "playwright"
import { start } from "./site.ts"

type Size = { readonly name: string; readonly width: number; readonly height: number }

const root = new URL("..", import.meta.url).pathname

const sizes: ReadonlyArray<Size> = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]

const ready = (page: Page) => page.locator("#root[data-ready]").waitFor({ timeout: 10_000 })

const shot = (page: Page, size: Size, name: string) =>
  page.screenshot({ path: `${root}artifacts/${size.name}-${name}.png` })

const wide = async (page: Page): Promise<ReadonlyArray<string>> => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )

  return overflow > 1 ? [`${page.url()} is ${overflow}px wider than the screen`] : []
}

const lowContrast = async (page: Page): Promise<ReadonlyArray<string>> => {
  await page.addScriptTag({ path: `${root}scripts/contrast.js` })

  const found: unknown = await page.evaluate(() => {
    const measure: unknown = Reflect.get(globalThis, "lowContrast")

    return typeof measure === "function" ? Reflect.apply(measure, undefined, []) : ["not measured"]
  })

  return Array.isArray(found) ? found.map(String) : ["not measured"]
}

const dark = async (page: Page, origin: string, size: Size): Promise<ReadonlyArray<string>> => {
  await page.emulateMedia({ colorScheme: "dark" })

  const found = await ["/", "/docs/getting-started"].reduce<Promise<ReadonlyArray<string>>>(
    (all, path) =>
      all.then(async (done) => {
        await page.goto(`${origin}${path}`)
        await ready(page)
        await shot(page, size, `dark${path.replaceAll("/", "-")}`)

        return [
          ...done,
          ...(await lowContrast(page)).map((line) => `${size.name} dark ${path}: ${line}`),
        ]
      }),
    Promise.resolve([]),
  )

  await page.emulateMedia({ colorScheme: "light" })

  return found
}

const diagramText = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const svg = document.querySelector("figure.diagram svg")
    const label = svg?.querySelector("text, .nodeLabel, .messageText, .edgeLabel")
    if (!(svg instanceof SVGSVGElement) || label === null || label === undefined) return 0

    const font = Number.parseFloat(getComputedStyle(label).fontSize)

    return (font * svg.getBoundingClientRect().width) / svg.viewBox.baseVal.width
  })

const diagrams = async (page: Page, origin: string, size: Size): Promise<ReadonlyArray<string>> => {
  await page.goto(`${origin}/docs/principles`)
  await ready(page)

  const figure = page.locator("figure.diagram").first()

  await figure.scrollIntoViewIfNeeded()
  await figure.screenshot({ path: `${root}artifacts/${size.name}-diagram.png` })

  const text = await diagramText(page)

  return text >= 13 ? [] : [`${size.name}: the principles diagram's text is ${text.toFixed(1)}px`]
}

const looked = async (page: Page, origin: string, size: Size): Promise<ReadonlyArray<string>> => {
  await page.goto(`${origin}/`)
  await ready(page)
  await shot(page, size, "home")

  const demo = page.getByRole("region", { name: "Live example: a store that refuses" })

  await demo.scrollIntoViewIfNeeded()
  await demo.getByRole("button", { name: "Add 1" }).click()
  await demo.getByRole("button", { name: "Reset after two seconds" }).click()
  await demo.getByRole("button", { name: "Add 1" }).click()
  await demo.getByLabel("Last refusal").getByText("was refused").waitFor({ timeout: 5000 })
  await shot(page, size, "home-refused")

  const homeWide = await wide(page)

  const sent = await fetch(`${origin}/docs/getting-started`).then((answer) => answer.text())
  const sentTitle = /<title>([^<]*)<\/title>/.exec(sent)?.[1] ?? ""

  await page.goto(`${origin}/docs/getting-started`)
  await ready(page)
  await shot(page, size, "docs")

  const docsWide = await wide(page)

  await page.evaluate(() => Reflect.set(window, "stayed", true))
  await page.locator("article.prose").getByRole("link", { name: "Principles" }).first().click()
  await page.getByRole("heading", { level: 1, name: "Principles" }).waitFor({ timeout: 5000 })

  const reloaded = (await page.evaluate(() => Reflect.get(window, "stayed"))) !== true
  const titled = await page.title()

  await page.goBack()
  await page.getByRole("heading", { level: 1, name: "Getting started" }).waitFor({ timeout: 5000 })

  await page
    .getByRole("navigation", { name: "Documentation" })
    .getByRole("link", { name: "API", exact: true })
    .click()
  await page.getByRole("heading", { level: 1, name: "API" }).waitFor({ timeout: 5000 })
  await page.getByRole("searchbox").fill("refused command")
  await page.getByRole("status").getByText("place").waitFor({ timeout: 5000 })
  await shot(page, size, "search")

  const drawn = await diagrams(page, origin, size)
  const night = await dark(page, origin, size)
  const day = await (async () => {
    await page.goto(`${origin}/docs/getting-started`)
    await ready(page)

    return (await lowContrast(page)).map((line) => `${size.name} light: ${line}`)
  })()

  return [
    ...homeWide,
    ...docsWide,
    ...drawn,
    ...night,
    ...day,
    ...(reloaded ? [`${size.name}: a link inside a doc page reloaded the page`] : []),
    ...(titled === "Principles · Spar"
      ? []
      : [`${size.name}: the Principles page was titled "${titled}"`]),
    ...(sentTitle === "Getting started · Spar"
      ? []
      : [`${size.name}: the server titled Getting started "${sentTitle}"`]),
  ]
}

const walked = async (
  browser: Browser,
  origin: string,
  size: Size,
): Promise<ReadonlyArray<string>> => {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
  const broke = new Promise<never>((_resolve, reject) => {
    page.on("pageerror", reject)
  })

  return Promise.race([looked(page, origin, size), broke]).finally(() => page.close())
}

const server = await start(0, "127.0.0.1")
const browser = await chromium.launch()
const problems = await sizes
  .reduce<Promise<ReadonlyArray<string>>>(
    (all, size) =>
      all.then(async (done) => [
        ...done,
        ...(await walked(browser, `http://127.0.0.1:${server.port}`, size)),
      ]),
    Promise.resolve([]),
  )
  .finally(async () => {
    await browser.close()
    await server.stop(true)
  })

if (problems.length > 0) throw new Error(problems.join("\n"))

console.log(`Looked at the site at ${sizes.length} sizes and found nothing`)
