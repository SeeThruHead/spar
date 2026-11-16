import { sparJsx } from "spar/transform/bun"

const root = new URL("..", import.meta.url).pathname

const result = await Bun.build({
  entrypoints: [`${root}src/main.ts`],
  outdir: `${root}dist`,
  target: "browser",
  naming: "client.js",
  plugins: [sparJsx],
})

if (!result.success) throw new Error(result.logs.map(String).join("\n"))

console.log(`Built ${result.outputs.length} file into dist/`)
