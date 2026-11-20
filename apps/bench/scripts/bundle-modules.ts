import { sparJsx } from "spar/transform/vite"
import { build } from "vite"

type Sized = { readonly id: string; readonly bytes: number }

const root = new URL("..", import.meta.url).pathname

const sizes = Promise.withResolvers<ReadonlyArray<Sized>>()

const nameOf = (id: string): string =>
  id
    .replace(/^.*\/node_modules\/effect\//, "effect/")
    .replace(/^.*\/packages\/spar\//, "spar/")
    .replace(/^.*\/apps\/bench\//, "app/")

await build({
  configFile: false,
  root: `${root}src/spar`,
  base: "./",
  logLevel: "silent",
  plugins: [
    sparJsx,
    {
      name: "module-sizes",
      generateBundle: (_options, bundle) => {
        sizes.resolve(
          Object.values(bundle).flatMap((chunk) =>
            chunk.type === "chunk"
              ? Object.entries(chunk.modules).map(([id, module]) => ({
                  id: nameOf(id),
                  bytes: module.renderedLength,
                }))
              : [],
          ),
        )
      },
    },
  ],
  oxc: { jsx: { runtime: "automatic", importSource: "spar" } },
  build: { outDir: `${root}dist-sizes`, emptyOutDir: true, minify: false, write: false },
})

const all = await sizes.promise
const total = all.reduce((sum, each) => sum + each.bytes, 0)
const groupOf = (id: string): string => id.split("/")[0] ?? id
const groups = Object.entries(Object.groupBy(all, (each) => groupOf(each.id))).map(
  ([group, members]) =>
    [group, (members ?? []).reduce((sum, each) => sum + each.bytes, 0)] as const,
)
const share = (bytes: number): string => `${((bytes / total) * 100).toFixed(1)}%`

console.log(
  `Unminified, after tree-shaking: ${(total / 1024).toFixed(0)} kB in ${all.length} modules`,
)
console.log(
  groups
    .toSorted((left, right) => right[1] - left[1])
    .map(([group, bytes]) => `${group}: ${(bytes / 1024).toFixed(0)} kB (${share(bytes)})`)
    .join("\n"),
)
console.log(
  all
    .toSorted((left, right) => right.bytes - left.bytes)
    .slice(0, Number(Bun.argv[2] ?? 40))
    .map(
      (each) =>
        `${(each.bytes / 1024).toFixed(1).padStart(7)} kB  ${share(each.bytes).padStart(6)}  ${each.id}`,
    )
    .join("\n"),
)
