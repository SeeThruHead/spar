import { engine, launch } from "@spar/browsers"
import type { Page } from "playwright"
import { start } from "./site.ts"

const server = start(0)

const origin = `http://127.0.0.1:${server.port}`

const sent = await (await fetch(`${origin}/`)).text()

const expectSent = (text: string): void => {
  if (!sent.includes(text)) throw new Error(`The server's HTML does not hold: ${text}`)
}

const unmarked = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("#root *")].filter(
        (node) => Reflect.get(node, "fromTheServer") !== true,
      ).length,
  )

const walk = async (page: Page): Promise<void> => {
  const script = Promise.withResolvers<void>()

  await page.route("**/client.js", async (route) => {
    await script.promise
    await route.continue()
  })
  await page.goto(origin, { waitUntil: "commit" })
  await page
    .getByRole("list", { name: "Shelf" })
    .getByText("Cheese & crackers", { exact: true })
    .waitFor()
  await page.getByLabel("Stock").filter({ hasText: "12 crates in the stockroom" }).waitFor()
  await page.evaluate(() =>
    document
      .querySelectorAll("#root *")
      .forEach((node) => Reflect.set(node, "fromTheServer", true)),
  )
  script.resolve()
  await page.locator("#root[data-ready]").waitFor()
  await page.getByRole("button", { name: "Put one in the basket" }).click()
  await page.getByLabel("Basket").filter({ hasText: /^1$/ }).waitFor()

  const replaced = await unmarked(page)
  if (replaced !== 0) throw new Error(`${replaced} of the server's nodes were made again`)

  await page.getByRole("button", { name: "Stock pears" }).click()
  await page.getByLabel("Kinds").filter({ hasText: /^4$/ }).waitFor()
  await page.getByRole("button", { name: "Remove Bread" }).click()
  await page.getByText("Bread").first().waitFor({ state: "detached" })

  const made = await unmarked(page)
  if (made !== 3) throw new Error(`Expected only the new row's 3 nodes to be new, found ${made}`)
}

const run = async (): Promise<void> => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 820, height: 900 } })
  const broke = new Promise<never>((_resolve, reject) => {
    page.on("pageerror", reject)
  })

  await Promise.race([walk(page), broke]).finally(() => browser.close())
}

expectSent("<h1>Corner shop</h1>")
expectSent("Cheese &amp; crackers")
expectSent("12 crates in the stockroom")
await run().finally(() => server.stop(true))
console.log(
  `Server rendering passed in ${engine()}: the page arrives complete, its nodes are kept, and it works`,
)
