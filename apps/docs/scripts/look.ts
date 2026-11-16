import { chromium } from "playwright"
import type { Browser } from "playwright"

type Seen = { readonly where: string; readonly effective: number }

const root = new URL("..", import.meta.url).pathname

const widths = [520, 1100]

const pages = ["principles", "api"]

const smallestText = 13

const measured = (browser: Browser, name: string, width: number): Promise<ReadonlyArray<Seen>> =>
  browser.newPage({ viewport: { width, height: 900 } }).then(async (page) => {
    const errors = new Promise<never>((_resolve, reject) => {
      page.on("pageerror", reject)
    })
    const look = async (): Promise<ReadonlyArray<Seen>> => {
      await page.goto(`file://${root}dist/${name}.html`)

      await page.screenshot({ path: `${root}artifacts/${name}-page-at-${width}.png` })

      const figures = page.locator("figure.diagram")
      const count = await figures.count()
      const sizes = await figures.evaluateAll((all) =>
        all.map((figure) => {
          const svg = figure.querySelector("svg")
          const label = figure.querySelector("text, .nodeLabel, .messageText")
          const natural = svg?.viewBox.baseVal.width ?? 0
          const shown = svg?.getBoundingClientRect().width ?? 0
          const size = label === null ? 0 : Number.parseFloat(getComputedStyle(label).fontSize)

          return natural === 0 ? 0 : (size * shown) / natural
        }),
      )

      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          figures
            .nth(index)
            .screenshot({ path: `${root}artifacts/${name}-${index + 1}-at-${width}.png` }),
        ),
      )

      return sizes.map((effective, index) => ({
        where: `${name} diagram ${index + 1} at ${width}px`,
        effective,
      }))
    }

    return Promise.race([look(), errors]).finally(() => page.close())
  })

const browser = await chromium.launch()
const seen = await pages
  .flatMap((name) => widths.map((width) => ({ name, width })))
  .reduce<Promise<ReadonlyArray<Seen>>>(
    (all, { name, width }) =>
      all.then(async (done) => [...done, ...(await measured(browser, name, width))]),
    Promise.resolve([]),
  )
  .finally(() => browser.close())

const small = seen.filter((each) => each.effective < smallestText)

console.log(seen.map((each) => `${each.where}: text ${each.effective.toFixed(1)}px`).join("\n"))

if (seen.length === 0) throw new Error("No diagrams were found in the built pages")
if (small.length > 0)
  throw new Error(`Too small to read: ${small.map((each) => each.where).join(", ")}`)
