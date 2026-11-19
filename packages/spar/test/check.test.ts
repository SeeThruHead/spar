import { describe, expect, it } from "vitest"
import { check, format, isViewFile } from "../src/transform/check.ts"

const rules = (source: string): ReadonlyArray<string> =>
  check("View.tsx", source).map((violation) => violation.rule)

const made = (name: string, params: string, body: string): string =>
  `export const ${name} = View.make("${name}", {}, (${params}) => ${body})`

describe("the JSX build check", () => {
  it("says where each problem is, one to a line", () => {
    const source = [
      made("List", "{ items }", "<ul>{items.map((item) => <li>{item}</li>)}</ul>"),
      made("Panel", "{ open }", '<div>{open ? <p>Open</p> : "Closed"}</div>'),
    ].join("\n")
    const reports = format(check("src/Views.tsx", source)).split("\n\n")

    expect(reports).toHaveLength(2)
    expect(reports[0]).toMatch(/^\[SPAR_JSX_OUTSIDE_VIEW\] \S.*\n {2}at src\/Views\.tsx:1:\d+\n/)
    expect(reports[1]).toMatch(/^\[SPAR_JSX_OUTSIDE_VIEW\] \S.*\n {2}at src\/Views\.tsx:2:\d+\n/)
  })

  it("only looks at view files, whatever a bundler adds after the name", () => {
    expect(isViewFile("src/RowView.tsx")).toBe(true)
    expect(isViewFile("src/RowView.tsx?v=3")).toBe(true)
    expect(isViewFile("src/Row.ts")).toBe(false)
    expect(isViewFile("src/RowView.tsx.map")).toBe(false)
    expect(isViewFile("src/notes.tsxt")).toBe(false)
  })

  it("accepts a view made with its props, whose body is JSX with reactive holes", () => {
    const body = `(
        <li>{Reactive.map(title, (text) => text.trim())}<button onClick={onRemove}>Remove</button></li>
      )`

    expect(rules(made("Row", "{ title, onRemove }", body))).toEqual([])
    expect(
      rules(`const Rows = pipe(${made("Row", "", "<><li>One</li></>").slice(7)}, wrap)`),
    ).toEqual([])
  })

  it("rejects a view written as a plain function, which has no Schema for its props", () => {
    const plain = `export const Row = ({ title }: { readonly title: string }) => <li>{title}</li>`
    const block = `export function Row() {\n  return <li>Row</li>\n}`
    const loose = `export const row = <li>Row</li>`

    expect(rules(plain)).toEqual(["views-need-a-schema"])
    expect(rules(block)).toEqual(["views-need-a-schema"])
    expect(rules(loose)).toEqual(["views-need-a-schema"])
    expect(format(check("Row.tsx", plain))).toMatch(
      /^\[SPAR_VIEW_WITHOUT_SCHEMA\] .*\n {2}at Row\.tsx:1:\d+\n {2}fix: Make the view with View\.make/,
    )
  })

  it("rejects a list built by mapping to JSX inside a hole", () => {
    const source = made("List", "{ items }", "<ul>{items.map((item) => <li>{item}</li>)}</ul>")

    expect(rules(source)).toEqual(["jsx-only-in-views"])
  })

  it("rejects a conditional that picks JSX inside a hole", () => {
    const source = made("Panel", "{ open }", '<div>{open ? <p>Open</p> : "Closed"}</div>')

    expect(rules(source)).toEqual(["jsx-only-in-views"])
  })

  it("rejects an inline function returning JSX passed to mapBy", () => {
    const source = `const rows = Reactive.mapBy((todo) => todo.id, ({ todo }) => <li>{todo}</li>, (todo) => ({ todo }))`

    expect(rules(source)).toEqual(["jsx-only-in-views"])
  })

  it("rejects running an Effect from a view and reports where", () => {
    const source = `export const Count = View.make("Count", {}, ({ count }) => {\n  const now = Effect.runSync(count.get)\n  return <output>{now}</output>\n})`

    expect(check("Count.tsx", source)).toMatchObject([
      { rule: "no-effect-run-in-views", file: "Count.tsx", line: 2, column: 15 },
    ])
  })
})
