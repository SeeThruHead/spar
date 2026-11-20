import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { sparJsx as bunPlugin } from "spar/transform/bun"

const fixture = (name: string): string => `${process.cwd()}/test/fixtures/${name}`

const build = (name: string) =>
  Effect.tryPromise(() =>
    Bun.build({
      entrypoints: [fixture(name)],
      plugins: [bunPlugin],
      external: ["spar", "spar/*"],
    }),
  )

describe("the JSX build check in a Bun build", () => {
  it.live("the Bun plugin stops the build on a view that breaks a rule", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(build("Mapped.tsx"))

      expect(Bun.inspect(error.cause)).toContain("SPAR_JSX_OUTSIDE_VIEW")
    }),
  )

  it.live("the Bun plugin builds a clean view", () =>
    Effect.gen(function* () {
      const result = yield* build("Clean.tsx")

      expect(result.success).toBe(true)
    }),
  )

  it.live("the Bun plugin also loads plain TypeScript, and builds it", () =>
    Effect.gen(function* () {
      const result = yield* build("Composed.ts")

      expect(result.success).toBe(true)
    }),
  )
})
