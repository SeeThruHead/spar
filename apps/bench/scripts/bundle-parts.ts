import { sparJsx } from "spar/transform/bun"

const root = new URL("..", import.meta.url).pathname

const sizeOf = async (label: string, entry: string): Promise<string> => {
  const built = await Bun.build({
    entrypoints: [`${root}${entry}`],
    target: "browser",
    minify: true,
    plugins: [sparJsx],
  })
  if (!built.success) return `${label}: did not build: ${built.logs.map(String).join(" | ")}`

  const text = (await built.outputs[0]?.text()) ?? ""
  const bytes = new TextEncoder().encode(text)

  return `${label}: ${(bytes.length / 1024).toFixed(1)} kB minified, ${(Bun.gzipSync(bytes).length / 1024).toFixed(1)} kB gzipped`
}

console.log(await sizeOf("Effect, one effect run", "src/parts/effect-core.ts"))
console.log(
  await sizeOf(
    "Effect, a service, a layer, a Schema, a stream, a span",
    "src/parts/effect-usual.ts",
  ),
)
console.log(await sizeOf("Spar, one reactive value read", "src/parts/spar-least.ts"))
console.log(await sizeOf("The Spar benchmark app", "src/spar/main.ts"))
