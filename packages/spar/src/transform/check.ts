import { Array, Schema } from "effect"
import { parseSync } from "oxc-parser"
import * as Diagnostics from "../Diagnostics.ts"

export type Violation = {
  readonly rule: "jsx-only-in-views" | "no-effect-run-in-views" | "views-need-a-schema"
  readonly code: Diagnostics.Code
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

const isComposedView = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      type: Schema.Literal("CallExpression"),
      callee: Schema.Struct({ name: Schema.Literal("compose") }),
    }),
  }),
)

const isFor = Schema.is(
  Schema.Struct({
    type: Schema.Literal("JSXElement"),
    openingElement: Schema.Struct({ name: Schema.Struct({ name: Schema.Literal("For") }) }),
  }),
)

const jsxTypes: ReadonlySet<string> = new Set(["JSXElement", "JSXFragment"])

const codes = {
  "jsx-only-in-views": "SPAR_JSX_OUTSIDE_VIEW",
  "views-need-a-schema": "SPAR_VIEW_WITHOUT_SCHEMA",
  "no-effect-run-in-views": "SPAR_EFFECT_RUN_IN_VIEW",
} as const satisfies Record<Violation["rule"], Diagnostics.Code>

type Where = "outside" | "view" | "hole" | "listed"

const jsxRule: Readonly<Record<Where, ReadonlyArray<Violation["rule"]>>> = {
  outside: ["views-need-a-schema"],
  view: [],
  hole: ["jsx-only-in-views"],
  listed: ["jsx-only-in-views"],
}

const inside = (node: unknown, type: string, key: string, where: Where): Where => {
  if (isViewMake(node)) return key === "arguments" ? "view" : where
  if (isComposedView(node)) return key === "arguments" ? "view" : where
  if (isFor(node) && key === "children") return "listed"
  if (type === "JSXExpressionContainer") return where === "listed" ? "view" : "hole"
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
    code: codes[rule],
    message: `${Diagnostics.all[codes[rule]].what} ${Diagnostics.all[codes[rule]].fix}`,
    file,
    ...locate(source, offset),
  }))

export const format = (
  violations: ReadonlyArray<Omit<Violation, "rule"> & { readonly rule: string }>,
): string =>
  violations
    .map(({ file, line, column, code }) =>
      Diagnostics.text(code, { at: `${file}:${line}:${column}` }),
    )
    .join("\n\n")

export const isViewFile = (path: string): boolean => /\.tsx(\?|$)/.test(path)
