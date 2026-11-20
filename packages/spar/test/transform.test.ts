import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { sparJsx as bunPlugin } from "spar/transform/bun"
import { check, format } from "spar/transform/check"
import { named } from "../src/transform/named.ts"
import { sparJsx as vitePlugin } from "spar/transform/vite"

const mapped = `export const List = View.make("List", {}, ({ items }) => <ul>{items.map((item) => <li>{item}</li>)}</ul>)`

const clean = `export const Title = View.make("Title", {}, ({ title }) => <h1>{title}</h1>)`

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
    expect(format(check("List.tsx", mapped))).toMatch(
      /^\[SPAR_JSX_OUTSIDE_VIEW\] JSX can only be the body of a view.*\n {2}at List\.tsx:1:\d+\n {2}fix: Give it its own view.*\n {2}see: LLMS\.md, section "SPAR_JSX_OUTSIDE_VIEW"$/,
    )
  })

  it("the Vite plugin stops the build on a view that breaks a rule", () => {
    expect(() => vitePlugin.transform(mapped, "/app/List.tsx")).toThrow("SPAR_JSX_OUTSIDE_VIEW")
  })

  it("the Vite plugin lets a clean view and every non-view file through untouched", () => {
    expect(vitePlugin.transform(clean, "/app/Title.tsx?v=1")).toBeNull()
    expect(vitePlugin.transform(mapped, "/app/notes.ts")).toBeNull()
  })

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

const composedView = `export const Title = compose(withProps({}))((props) => <h1>{props.title}</h1>)`

const listed = `export const List = compose(withProps({}))((props) => (
  <ul><For each={props.items} by={(item) => item}>{(item) => <li>{item}</li>}</For></ul>
))`

const elsewhere = `export const List = compose(withProps({}))((props) => <ul>{props.items.map((item) => <li>{item}</li>)}</ul>)`

describe("the build check on a composed component", () => {
  it("accepts JSX as the inline view at the end of compose, and as the body of a For", () => {
    expect(check("Title.tsx", composedView)).toEqual([])
    expect(check("List.tsx", listed)).toEqual([])
  })

  it("still refuses JSX made in a hole of that view", () => {
    expect(check("List.tsx", elsewhere).map((violation) => violation.code)).toEqual([
      "SPAR_JSX_OUTSIDE_VIEW",
    ])
  })
})

describe("naming a composed component after the constant it is given to", () => {
  it("passes the name to the component, and to each one in the file", () => {
    expect(
      named(
        "Shop.tsx",
        `export const Counter = compose(withA)((props) => <b />)\nconst Panel = compose(withB)((props) => <i />,)`,
      ),
    ).toBe(
      `export const Counter = compose(withA)((props) => <b />, "Counter")\nconst Panel = compose(withB)((props) => <i />, "Panel",)`,
    )
  })

  it("leaves alone a file with no composed component, and a group of enhancers with no view", () => {
    expect(named("Shop.ts", "export const x = 1")).toBeNull()
    expect(named("Shop.ts", "export const withHover = compose(withA, withB)")).toBeNull()
  })

  it("is applied by the Vite plugin to source files, and not to dependencies", () => {
    const source = "export const Counter = compose(withA)((props) => <b />)"

    expect(vitePlugin.transform(source, "/app/Counter.tsx")?.code).toContain('"Counter"')
    expect(vitePlugin.transform(source, "/app/node_modules/x/Counter.ts")).toBeNull()
  })
})
