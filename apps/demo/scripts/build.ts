import { Effect, Schema } from "effect"
import { sparJsx } from "spar/transform/bun"

class BuildFailed extends Schema.TaggedError<BuildFailed, { readonly brand: unique symbol }>()(
  "BuildFailed",
  {
    message: Schema.String,
  },
) {}

const root = new URL("..", import.meta.url).pathname

const build = Effect.tryPromise({
  try: () =>
    Bun.build({
      entrypoints: [`${root}src/main.ts`],
      outdir: `${root}dist`,
      target: "browser",
      sourcemap: "linked",
      plugins: [sparJsx],
    }),
  catch: (cause) => new BuildFailed({ message: String(cause) }),
})

const copyPage = Effect.tryPromise({
  try: () => Bun.write(`${root}dist/index.html`, Bun.file(`${root}index.html`)),
  catch: (cause) => new BuildFailed({ message: String(cause) }),
})

const program = Effect.gen(function* () {
  const result = yield* build

  if (!result.success) {
    return yield* new BuildFailed({ message: result.logs.map(String).join("\n") })
  }

  yield* copyPage
  yield* Effect.log(`Built ${result.outputs.length} files into dist/`)
})

await Effect.runPromise(program)
