import { describe, expect, it } from "vitest"
import { check, format } from "spar/transform/check"
import { named } from "../src/transform/named.ts"
import { sparJsx as vitePlugin } from "spar/transform/vite"

const mapped = `export const List = View.make("List", {}, ({ items }) => <ul>{items.map((item) => <li>{item}</li>)}</ul>)`

const clean = `export const Title = View.make("Title", {}, ({ title }) => <h1>{title}</h1>)`

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

const rules = (source: string) => check("Draft.tsx", source).map((violation) => violation.rule)

describe("an enhancer written inline before other enhancers", () => {
  it("is refused when its parameter has no type, as a function or inside Effect.fn", () => {
    expect(
      rules("const D = compose(withProps({}), (props) => Effect.succeed({}), withHandlers(f))(V)"),
    ).toEqual(["enhancers-typed-or-wrapped"])
    expect(
      rules(
        "const D = compose(withProps({}), function (props) { return Effect.succeed({}) }, g)(V)",
      ),
    ).toEqual(["enhancers-typed-or-wrapped"])
    expect(
      rules(
        "const D = compose(withProps({}), Effect.fnUntraced(function* (props) { return {} }), g)(V)",
      ),
    ).toEqual(["enhancers-typed-or-wrapped"])
  })

  it("is let through when typed, wrapped, last, or taking nothing", () => {
    expect(
      rules("const D = compose(withProps({}), (props: P) => Effect.succeed({}), g)(V)"),
    ).toEqual([])
    expect(
      rules(
        "const D = compose(withProps({}), withEffectProps((props) => Effect.succeed({})), g)(V)",
      ),
    ).toEqual([])
    expect(rules("const D = compose(withProps({}), g, (props) => Effect.succeed({}))(V)")).toEqual(
      [],
    )
    expect(rules("const D = compose(() => Effect.succeed({}), g)(V)")).toEqual([])
    expect(
      rules(
        "const D = compose(withProps({}), Effect.fn(function* (props: P) { return {} }), g)(V)",
      ),
    ).toEqual([])
    expect(rules("const D = compose(withProps({}), Effect.map(x, f), g)(V)")).toEqual([])
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
    expect(
      named("Shop.tsx", "const compose = 1\nconst Card = make(withA)((props) => <b />)"),
    ).toBeNull()
    expect(named("Shop.tsx", "const { Card } = compose(withA)((props) => <b />)")).toBeNull()
    expect(named("Shop.tsx", "const Card = compose(withA)()")).toBeNull()
  })

  it("is applied by the Vite plugin to source files, and not to dependencies", () => {
    const source = "export const Counter = compose(withA)((props) => <b />)"

    expect(vitePlugin.transform(source, "/app/Counter.tsx")?.code).toContain('"Counter"')
    expect(
      vitePlugin.transform("export const Counter = compose(withA)(CounterView)", "/app/Counter.ts")
        ?.code,
    ).toContain('"Counter"')
    expect(vitePlugin.transform(source, "/app/node_modules/x/Counter.ts")).toBeNull()
    expect(vitePlugin.transform(source, "/app/node_modules/x/Counter.tsx")).toBeNull()
    expect(vitePlugin.transform(source, "/app/Counter.css")).toBeNull()
  })
})
