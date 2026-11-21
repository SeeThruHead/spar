import { Effect } from "effect"
import { contentIn, pageHtml, toggle } from "./site.ts"

const root = new URL("..", import.meta.url).pathname
const out = `${root}static/`
const domain = Bun.env["SITE_DOMAIN"] ?? "spar.seethruhead.vip"

const content = await contentIn()

const routes = ["/", ...content.pages.map((page) => `/docs/${page.slug}`)]

const fileFor = (route: string): string =>
  route === "/" ? `${out}index.html` : `${out}${route.slice(1)}/index.html`

await Promise.all(
  routes.map(async (route) =>
    Bun.write(fileFor(route), await Effect.runPromise(pageHtml(content, route))),
  ),
)
await Bun.write(`${out}404.html`, await Effect.runPromise(pageHtml(content, "/not-found")))
await Bun.write(`${out}devtools/toggle/index.html`, toggle)

const copied = [
  ["dist/entry.js", "entry.js"],
  ["dist/entry-devtools.js", "entry-devtools.js"],
  ["dist/site.css", "site.css"],
  ["dist/search.json", "search.json"],
  ["public/spar-promo.mp4", "spar-promo.mp4"],
  ["public/spar-promo.jpg", "spar-promo.jpg"],
  ["../../LLMS.md", "llms.txt"],
  ...content.pages.map((page) => [`dist/pages/${page.slug}.json`, `pages/${page.slug}.json`]),
] as const

await Promise.all(copied.map(([from, to]) => Bun.write(`${out}${to}`, Bun.file(`${root}${from}`))))
await Bun.write(`${out}CNAME`, `${domain}\n`)
await Bun.write(`${out}.nojekyll`, "")

console.log(`Wrote ${routes.length} pages, a 404 page and their files into static/ for ${domain}`)
