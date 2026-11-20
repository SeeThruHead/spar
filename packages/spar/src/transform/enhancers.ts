import { Schema } from "effect"
import { everyNode } from "./services.ts"

const isCompose = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.Literal("compose") }),
    arguments: Schema.Array(Schema.Struct({ start: Schema.Finite })),
  }),
)

const isFunction = Schema.is(
  Schema.Struct({
    type: Schema.Literals(["ArrowFunctionExpression", "FunctionExpression"]),
    params: Schema.Array(Schema.Unknown),
  }),
)

const isTyped = Schema.is(Schema.Struct({ typeAnnotation: Schema.Struct({ type: Schema.String }) }))

const isEffectFn = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      type: Schema.Literal("MemberExpression"),
      object: Schema.Struct({ name: Schema.Literal("Effect") }),
      property: Schema.Struct({ name: Schema.Literals(["fn", "fnUntraced"]) }),
    }),
    arguments: Schema.NonEmptyArray(Schema.Unknown),
  }),
)

const untypedFunction = (node: unknown): boolean => {
  if (!isFunction(node)) return false

  const [first] = node.params
  if (first === undefined) return false

  return !isTyped(first)
}

const untyped = (node: unknown): boolean => {
  if (untypedFunction(node)) return true
  if (!isEffectFn(node)) return false

  return node.arguments.some(untypedFunction)
}

export const untypedEnhancers = (program: unknown): ReadonlyArray<number> =>
  everyNode(program).flatMap((node) =>
    isCompose(node)
      ? node.arguments.slice(0, -1).flatMap((given) => (untyped(given) ? [given.start] : []))
      : [],
  )
