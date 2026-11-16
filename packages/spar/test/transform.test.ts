import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { sparJsx as bunPlugin } from "spar/transform/bun"
import { check, format } from "spar/transform/check"
import { sparJsx as vitePlugin } from "spar/transform/vite"

const mapped = `export const List = ({ items }) => <ul>{items.map((item) => <li>{item}</li>)}</ul>`

const clean = `export const Title = ({ title }) => <h1>{title}</h1>`

const fixture = (name: string): string => `${process.cwd()}/test/fixtures/${name}`

const build = (name: string) =>
  Effect.tryPromise(() =>
    Bun.build({
      entrypoints: [fixture(name)],
      plugins: [bunPlugin],
      external: ["spar", "spar/*"],
    }),
  )

describe("the JSX build check in a build", () => {
  it("prints each violation as file, line, column, rule and what to do instead", () => {
    const [line] = format(check("List.tsx", mapped)).split("\n")

    expect(line).toMatch(/^List\.tsx:1:\d+ jsx-only-in-views: JSX can only be the body of a view/)
  })

  it("the Vite plugin stops the build on a view that breaks a rule", () => {
    expect(() => vitePlugin.transform(mapped, "/app/List.tsx")).toThrow("jsx-only-in-views")
  })

  it("the Vite plugin lets a clean view and every non-view file through untouched", () => {
    expect(vitePlugin.transform(clean, "/app/Title.tsx?v=1")).toBeNull()
    expect(vitePlugin.transform(mapped, "/app/notes.ts")).toBeNull()
  })

  it.live("the Bun plugin stops the build on a view that breaks a rule", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(build("Mapped.tsx"))

      expect(Bun.inspect(error.cause)).toContain("jsx-only-in-views")
    }),
  )

  it.live("the Bun plugin builds a clean view", () =>
    Effect.gen(function* () {
      const result = yield* build("Clean.tsx")

      expect(result.success).toBe(true)
    }),
  )
})
