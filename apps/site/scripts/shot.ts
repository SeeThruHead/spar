import { chromium } from "playwright"

const [file = "", out = "", width = "1440", top = "0", height = "1000"] = Bun.argv.slice(2)

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
})

await page.goto(file.startsWith("http") ? file : `file://${file}`)
await page.evaluate((y) => window.scrollTo(0, y), Number(top))
await page.screenshot({ path: out })
console.log(
  await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })),
)
await browser.close()
