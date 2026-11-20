import { engine, launch } from "@spar/browsers"
import { Schema } from "effect"
import type { Browser, Page } from "playwright"
import { Server } from "spar"
import { Recorded } from "spar/devtools/spans"
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

const Sent = Schema.fromJsonString(Server.Dehydrated)

const spansOf = async (traceId: string, left: number): Promise<ReadonlyArray<Recorded>> => {
  const spans = Schema.decodeUnknownSync(Schema.Array(Recorded))(
    await (await fetch(`${origin}/spans/${traceId}`)).json(),
  )
  if (spans.some((span) => span.name === "App.hydrate") || left === 0) return spans

  await Bun.sleep(50)

  return spansOf(traceId, left - 1)
}

const sameTrace = async (page: Page, wanted: ReadonlyArray<string>): Promise<void> => {
  const state = Schema.decodeSync(Sent)(
    await page.evaluate(() => document.getElementById("spar-state")?.textContent ?? ""),
  )
  const spans = await spansOf(state.trace?.traceId ?? "none", 40)
  const names = spans.map((span) => span.name)
  const takeover = spans.find((span) => span.name === "App.hydrate")
  const missing = wanted.filter((name) => !names.includes(name))

  if (missing.length > 0) throw new Error(`The trace of the render lacks: ${missing.join(", ")}`)
  if (takeover?.parentSpanId !== state.trace?.spanId)
    throw new Error("The browser's takeover is not a child of the server's render")
}

const firstPart = async (): Promise<string> => {
  const reader = (await fetch(`${origin}/`)).body?.getReader()
  const part = await reader?.read()

  await reader?.cancel()

  return new TextDecoder().decode(part?.value)
}

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
  await sameTrace(page, ["Server.render", "Database.items", "Database.crates", "App.hydrate"])
  await page.getByRole("button", { name: "Put one in the basket" }).click()
  await page.getByLabel("Basket").filter({ hasText: /^1$/ }).waitFor()

  const replaced = await unmarked(page)
  if (replaced !== 0) throw new Error(`${replaced} of the server's nodes were made again`)

  await page.getByRole("button", { name: "Stock pears" }).click()
  await page.getByLabel("Kinds").filter({ hasText: /^4$/ }).waitFor()
  await page.getByRole("button", { name: "Remove Bread" }).click()
  await page
    .getByRole("list", { name: "Shelf" })
    .getByText("Bread", { exact: true })
    .waitFor({ state: "detached" })

  const made = await unmarked(page)
  if (made !== 3) throw new Error(`Expected only the new row's 3 nodes to be new, found ${made}`)
}

const asked = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/rpc"))
        .length,
  )

const said = (page: Page, label: string, text: string): Promise<void> =>
  page.getByLabel(label, { exact: true }).filter({ hasText: text }).waitFor()

const routed = async (page: Page): Promise<void> => {
  await page.goto(`${origin}/shelf/cheese`)
  await page.locator("#root[data-ready]").waitFor()
  await said(page, "Product", "Cheese & crackers")
  await said(page, "Supplier", "Valley dairy")
  await said(page, "Supplier status", "loaded")
  await sameTrace(page, ["Server.render", "Database.product", "Database.supplier", "App.hydrate"])
  await page.waitForTimeout(200)

  const afterTakeover = await asked(page)
  if (afterTakeover !== 0)
    throw new Error(
      `The browser asked the server ${afterTakeover} times for data the page came with`,
    )

  await page.evaluate(() => Reflect.set(window, "sameDocument", true))
  const call = page.waitForRequest((request) => request.url().includes("/rpc"))

  await page.getByRole("link", { name: "About the bread" }).click()
  await said(page, "Product", "Bread")
  await said(page, "Supplier", "The mill on the hill")

  const sentWith = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Struct({ traceId: Schema.String })),
  )((await call).postData())
  const reached = (await spansOf(sentWith.traceId, 0)).map((span) => span.name)
  const unreached = ["Database.product", "Database.supplier"].filter(
    (name) => !reached.includes(name),
  )
  if (unreached.length > 0)
    throw new Error(
      `The navigation in the browser is not one trace with the server: ${unreached.join(", ")} missing from ${reached.join(", ")}`,
    )

  const afterBread = await asked(page)
  if (afterBread !== 2)
    throw new Error(`Going to another product asked the server ${afterBread} times, not 2`)

  await page.getByRole("link", { name: "Back to the shop" }).click()
  await page.getByRole("heading", { name: "Corner shop" }).waitFor()
  await said(page, "Stock", "12 crates in the stockroom")
  await said(page, "Kinds", "3")
  await page.goBack()
  await said(page, "Supplier", "The mill on the hill")

  const afterBack = await asked(page)
  if (afterBack !== 2) throw new Error("Going back asked the server again for data it had")

  const kept = await page.evaluate(() => Reflect.get(window, "sameDocument") === true)
  if (!kept) throw new Error("Following a link loaded a new document")
}

const readUntil = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  text: string,
  done: (text: string) => boolean,
): Promise<string> => {
  if (done(text)) return text

  const part = await reader.read()
  if (part.done) return text

  return readUntil(reader, text + new TextDecoder().decode(part.value), done)
}

const sentInPieces = async (): Promise<void> => {
  const started = performance.now()
  const reader = (await fetch(`${origin}/slow/cheese`)).body?.getReader()
  if (reader === undefined) throw new Error("The page sent in pieces has no body")

  const first = await readUntil(reader, "", (text) => text.includes('id="spar-state"'))
  const firstAfter = performance.now() - started
  const all = await readUntil(reader, first, () => false)
  const wholeAfter = performance.now() - started

  if (first.includes("Valley dairy"))
    throw new Error("The first part of the page already held the slow supplier")
  if (!first.includes('aria-label="Supplier status"'))
    throw new Error("The first part of the page was not the page as first drawn")
  if (firstAfter > 200)
    throw new Error(
      `The page as first drawn took ${firstAfter.toFixed(0)} ms, as long as the slow query`,
    )
  if (wholeAfter < 280)
    throw new Error(
      `The whole page took ${wholeAfter.toFixed(0)} ms, less than the slow query takes`,
    )
  if (!all.slice(first.length).includes("__sparPieces") || !all.includes("Valley dairy"))
    throw new Error("The slow supplier did not follow as a piece")
  if (!all.trimEnd().endsWith("</body></html>")) throw new Error("The document was not closed")
}

const takenInPieces = async (page: Page): Promise<void> => {
  await page.goto(`${origin}/slow/cheese`, { waitUntil: "commit" })
  await said(page, "Product", "Cheese & crackers")
  await said(page, "Supplier", "Valley dairy")
  await said(page, "Supplier status", "loaded")
  await page.locator("#root[data-ready]").waitFor()
  await sameTrace(page, ["Server.render", "Database.product", "Database.supplier", "App.hydrate"])
  await page.waitForTimeout(200)

  const afterPieces = await asked(page)
  if (afterPieces !== 0)
    throw new Error(
      `The browser asked the server ${afterPieces} times for data that was sent in pieces`,
    )

  await page.getByRole("link", { name: "Back to the shop" }).click()
  await page.getByRole("heading", { name: "Corner shop" }).waitFor()
}

const withoutTheBundle = async (browser: Browser): Promise<void> => {
  const page = await browser.newPage({ viewport: { width: 820, height: 900 } })

  await page.route("**/client.js", (route) => route.abort())
  await page.goto(`${origin}/slow/cheese`)
  await said(page, "Supplier", "Valley dairy")
  await said(page, "Supplier status", "loaded")

  const taken = await page.locator("#root[data-spar-taken]").count()

  await page.close()
  if (taken !== 0) throw new Error("A page whose bundle never loaded was marked as taken over")
}

const bundleAfterTheStream = async (browser: Browser): Promise<void> => {
  const page = await browser.newPage({ viewport: { width: 820, height: 900 } })
  const broke = new Promise<never>((_resolve, reject) => {
    page.on("pageerror", reject)
  })

  await page.route("**/client.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })

  const checked = (async () => {
    await page.goto(`${origin}/slow/cheese`, { waitUntil: "commit" })
    await said(page, "Supplier", "Valley dairy")
    await page.locator("#root[data-ready]").waitFor({ timeout: 10_000 })
    await said(page, "Supplier status", "loaded")
    await page.waitForTimeout(200)

    const again = await asked(page)

    if (again !== 0)
      throw new Error(`The browser asked again ${again} times after taking over a finished page`)
    await page.getByRole("link", { name: "Back to the shop" }).click()
    await page.getByRole("heading", { name: "Corner shop" }).waitFor()
  })()

  await Promise.race([checked, broke]).finally(() => page.close())
}

const run = async (): Promise<void> => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 820, height: 900 } })
  const broke = new Promise<never>((_resolve, reject) => {
    page.on("pageerror", reject)
  })

  await Promise.race([
    walk(page)
      .then(() => routed(page))
      .then(() => takenInPieces(page))
      .then(() => withoutTheBundle(browser))
      .then(() => bundleAfterTheStream(browser)),
    broke,
  ]).finally(() => browser.close())
}

expectSent("<h1>Corner shop</h1>")
expectSent("Cheese &amp; crackers")
expectSent("12 crates in the stockroom")
expectSent('"ssr/ShopStore":{"items":[{"id":"apples","name":"Apples"}')

const product = await (await fetch(`${origin}/shelf/cheese`)).text()

const missing = ["Cheese &amp; crackers", "Valley dairy", '"ssr/Product"', '"ssr/Supplier"'].filter(
  (text) => !product.includes(text),
)

if (missing.length > 0)
  throw new Error(`The server's product page does not hold: ${missing.join(", ")}`)

await sentInPieces()

const opening = await firstPart()

if (!opening.includes("<title>Corner shop</title>") || opening.includes("Cheese"))
  throw new Error("The opening of the document did not arrive before the page was drawn")

await run().finally(() => server.stop(true))
console.log(
  `Server rendering passed in ${engine()}: the document opens before the page is drawn, the page arrives complete with its state, its nodes are kept, the browser starts from the server stores, the takeover is in the trace of the render, and a routed page arrives with what its queries loaded, asks for none of it again, and goes on to other pages without a new document, each navigation one trace with the server; and a page with a slow query is sent as first drawn, with the slow data following as a piece that the browser takes without asking again; with the app's bundle blocked the slow data still shows, drawn by the server, and a bundle that arrives after the stream takes over the finished page without asking again`,
)
