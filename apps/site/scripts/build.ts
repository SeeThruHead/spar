import { sparJsx } from "spar/transform/bun"
import { built } from "./content.ts"

const root = new URL("..", import.meta.url).pathname

const result = await Bun.build({
  entrypoints: [`${root}src/main.ts`],
  outdir: `${root}dist`,
  target: "browser",
  naming: "client.js",
  minify: true,
  plugins: [sparJsx],
})

if (!result.success) throw new Error(result.logs.map(String).join("\n"))

const components = await Bun.file(`${root}../../packages/ui/src/styles.css`).text()
const own = await Bun.file(`${root}src/site.css`).text()
const content = await built()

await Bun.write(`${root}dist/site.css`, `${components}\n${own}`)
await Bun.write(`${root}dist/content.json`, JSON.stringify(content))

console.log(
  `Built the client, the styles and ${content.pages.length} pages (${content.sections.length} sections to search) into dist/`,
)
