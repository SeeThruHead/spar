import { describe, expect, it } from "vitest"
import { check } from "../src/transform/check.ts"

const rules = (source: string): ReadonlyArray<string> =>
  check("View.tsx", source).map((violation) => violation.rule)

describe("the JSX build check", () => {
  it("accepts a view whose body is JSX with reactive holes", () => {
    const source = `
      export const Row = ({ title, onRemove }) => (
        <li>{Reactive.map(title, (text) => text.trim())}<button onClick={onRemove}>Remove</button></li>
      )
    `

    expect(rules(source)).toEqual([])
  })

  it("rejects a list built by mapping to JSX inside a hole", () => {
    const source = `export const List = ({ items }) => <ul>{items.map((item) => <li>{item}</li>)}</ul>`

    expect(rules(source)).toEqual(["jsx-only-in-views"])
  })

  it("rejects a conditional that picks JSX inside a hole", () => {
    const source = `export const Panel = ({ open }) => <div>{open ? <p>Open</p> : "Closed"}</div>`

    expect(rules(source)).toEqual(["jsx-only-in-views"])
  })

  it("rejects an inline function returning JSX passed to mapBy", () => {
    const source = `const rows = Reactive.mapBy((todo) => todo.id, ({ todo }) => <li>{todo}</li>, (todo) => ({ todo }))`

    expect(rules(source)).toEqual(["jsx-only-in-views"])
  })

  it("rejects running an Effect from a view and reports where", () => {
    const source = `export const Count = ({ count }) => {\n  const now = Effect.runSync(count.get)\n  return <output>{now}</output>\n}`

    expect(check("Count.tsx", source)).toMatchObject([
      { rule: "no-effect-run-in-views", file: "Count.tsx", line: 2, column: 15 },
    ])
  })
})
