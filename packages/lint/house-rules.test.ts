import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(
      Schema.Struct({
        code: Schema.String,
        filename: Schema.String,
        labels: Schema.Array(Schema.Struct({ span: Schema.Struct({ line: Schema.Int }) })),
      }),
    ),
  }),
)

const expected = [
  "casts.ts house(no-casts) 1",
  "comments.ts house(no-comments) 1",
  "deterministic.ts effecttsgo(global-date) 1",
  "deterministic.ts effecttsgo(global-date) 1",
  "deterministic.ts effecttsgo(global-random) 1",
  "deterministic.ts house(deterministic) 1",
  "deterministic.ts house(deterministic) 1",
  "deterministic.ts house(deterministic) 1",
  "gen-wrapper.ts house(no-gen-wrapper) 2",
  "let.ts house(no-let) 2",
  "loops.ts house(no-loops) 3",
  "loops.ts house(no-mutation) 3",
  "multiline-logical.ts house(no-multiline-logical) 2",
  "mutation.ts house(no-mutation) 13",
  "mutation.ts house(no-mutation) 2",
  "mutation.ts house(no-mutation) 3",
  "mutation.ts house(no-mutation) 4",
  "nested-if.ts house(no-nested-if) 3",
  "run.ts house(run-at-entry-only) 2",
]

class NoReport extends Schema.TaggedError<NoReport, { readonly brand: unique symbol }>()(
  "NoReport",
  {
    hint: Schema.String,
    stderr: Schema.String,
  },
) {}

const textOf = (stream: ReadableStream<Uint8Array>) =>
  Effect.promise(() => new Response(stream).text())

const lintFixtures = Effect.gen(function* () {
  const child = Bun.spawn(["bun", "run", "--silent", "lint:fixtures"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = yield* Effect.all([textOf(child.stdout), textOf(child.stderr)])

  return yield* Schema.decodeEffect(Report)(stdout).pipe(
    Effect.mapError(
      () =>
        new NoReport({
          hint: "oxlint printed no report; the Effect rules only load when oxlint runs through effect-tsgo",
          stderr,
        }),
    ),
  )
})

it.effect(
  "each house rule and the Effect rules report exactly the fixture lines they should, and clean code reports nothing",
  () =>
    Effect.gen(function* () {
      const report = yield* lintFixtures
      const found = report.diagnostics
        .map(
          (diagnostic) =>
            `${diagnostic.filename.replace(/^.*fixtures\//, "")} ${diagnostic.code} ${diagnostic.labels[0]?.span.line ?? 0}`,
        )
        .toSorted()

      assert.deepStrictEqual(found, expected)
    }),
)
