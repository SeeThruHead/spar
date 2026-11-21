const root = new URL("..", import.meta.url).pathname

const domain = `${root}../../packages/alchemy-domain/src/`

const aliased = {
  name: "domain-source",
  setup: (build: Bun.PluginBuilder) => {
    build.onResolve({ filter: /^@alchemy\.run\/domain(\/.*)?$/ }, (found) => ({
      path:
        found.path === "@alchemy.run/domain"
          ? `${domain}index.ts`
          : `${domain}${found.path.replace("@alchemy.run/domain/", "")}.ts`,
    }))
  },
}

const sizeOf = async (entry: string): Promise<string> => {
  const built = await Bun.build({
    entrypoints: [`${root}${entry}`],
    target: "browser",
    minify: true,
    plugins: [aliased],
  })
  if (!built.success)
    return `${entry}: did not build: ${built.logs.map(String).join(" | ").slice(0, 600)}`

  const text = await built.outputs[0]?.text()
  const bytes = new TextEncoder().encode(text ?? "")

  return `${entry}: ${(bytes.length / 1024).toFixed(0)} KB minified, ${(Bun.gzipSync(bytes).length / 1024).toFixed(0)} KB gzipped`
}

console.log(await sizeOf("src/size/domain.ts"))
console.log(await sizeOf("src/size/spar.ts"))
