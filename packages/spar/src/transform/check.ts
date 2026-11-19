import { Array, Schema } from "effect"
import { parseSync } from "oxc-parser"

export type Violation = {
  readonly rule: "jsx-only-in-views" | "no-effect-run-in-views"
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
  "no-effect-run-in-views":
    "A view cannot run an Effect. Do the work in the component's Effect (View.connect) and pass the result in as a prop.",
} as const satisfies Record<Violation["rule"], string>

const opensHole = (node: unknown, type: string, key: string): boolean => {
  if (type === "JSXExpressionContainer") return true
  if (isViewMake(node)) return false

  return type === "CallExpression" && key === "arguments"
}

const ruleFor = (
  node: unknown,
  type: string,
  inHole: boolean,
): ReadonlyArray<Violation["rule"]> => {
  if (inHole && jsxTypes.has(type)) return ["jsx-only-in-views"]
  if (isEffectCall(node)) return ["no-effect-run-in-views"]

  return []
}

const visit = (
  node: unknown,
  inHole: boolean,
): ReadonlyArray<readonly [Violation["rule"], number]> => {
  if (!isNode(node)) return []

  const found = ruleFor(node, node.type, inHole).map((rule) => [rule, node.start] as const)
  if (found.length > 0) return found

  return Object.entries(node).flatMap(([key, value]) =>
    Array.ensure(value).flatMap((child) => visit(child, inHole || opensHole(node, node.type, key))),
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
  visit(parseSync(file, source).program, false).map(([rule, offset]) => ({
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
