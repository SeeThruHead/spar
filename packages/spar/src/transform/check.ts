import { Array, Schema } from "effect"
import { parseSync } from "oxc-parser"

export type Violation = {
  readonly rule: "jsx-only-in-views" | "no-effect-run-in-views" | "views-need-a-schema"
  readonly message: string
  readonly file: string
  readonly line: number
  readonly column: number
}

const isNode = Schema.is(Schema.Struct({ type: Schema.String, start: Schema.Finite }))

const isEffectCall = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      object: Schema.Struct({ name: Schema.Literal("Effect") }),
      property: Schema.Struct({ name: Schema.String.check(Schema.isStartingWith("run")) }),
    }),
  }),
)

const isViewMake = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      object: Schema.Struct({ name: Schema.Literal("View") }),
      property: Schema.Struct({ name: Schema.Literal("make") }),
    }),
  }),
)

const jsxTypes: ReadonlySet<string> = new Set(["JSXElement", "JSXFragment"])

const messages = {
  "jsx-only-in-views":
    "JSX can only be the body of a view. Inside an expression or a call it becomes template control flow: give it its own view, and use Reactive.when or Reactive.mapBy in the component's Effect.",
  "views-need-a-schema":
    "A view is made with View.make(name, props, draw), where props gives a Schema for each prop. A plain function that returns JSX has no Schema for its props.",
  "no-effect-run-in-views":
    "A view cannot run an Effect. Do the work in the component's Effect (View.connect) and pass the result in as a prop.",
} as const satisfies Record<Violation["rule"], string>

type Where = "outside" | "view" | "hole"

const jsxRule: Readonly<Record<Where, ReadonlyArray<Violation["rule"]>>> = {
  outside: ["views-need-a-schema"],
  view: [],
  hole: ["jsx-only-in-views"],
}

const inside = (node: unknown, type: string, key: string, where: Where): Where => {
  if (isViewMake(node)) return key === "arguments" ? "view" : where
  if (type === "JSXExpressionContainer") return "hole"
  if (type === "CallExpression" && key === "arguments") return "hole"

  return where
}

const ruleFor = (node: unknown, type: string, where: Where): ReadonlyArray<Violation["rule"]> => {
  if (jsxTypes.has(type)) return jsxRule[where]
  if (isEffectCall(node)) return ["no-effect-run-in-views"]

  return []
}

const isJsx = (type: string, where: Where): Where => (jsxTypes.has(type) ? "view" : where)

const visit = (
  node: unknown,
  where: Where,
): ReadonlyArray<readonly [Violation["rule"], number]> => {
  if (!isNode(node)) return []

  const found = ruleFor(node, node.type, where).map((rule) => [rule, node.start] as const)
  if (found.length > 0) return found

  return Object.entries(node).flatMap(([key, value]) =>
    Array.ensure(value).flatMap((child) =>
      visit(child, inside(node, node.type, key, isJsx(node.type, where))),
    ),
  )
}

const locate = (
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } => {
  const before = source.slice(0, offset)

  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") }
}

export const check = (file: string, source: string): ReadonlyArray<Violation> =>
  visit(parseSync(file, source).program, "outside").map(([rule, offset]) => ({
    rule,
    message: messages[rule],
    file,
    ...locate(source, offset),
  }))

export const format = (violations: ReadonlyArray<Violation>): string =>
  violations
    .map(({ file, line, column, rule, message }) => `${file}:${line}:${column} ${rule}: ${message}`)
    .join("\n")

export const isViewFile = (path: string): boolean => /\.tsx(\?|$)/.test(path)
