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

const isWrapper = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    start: Schema.Finite,
    callee: Schema.Struct({
      type: Schema.Literal("Identifier"),
      name: Schema.Literals(["withEffectProps", "withHandlers", "withEffect"]),
    }),
    arguments: Schema.NonEmptyArray(Schema.Unknown),
  }),
)

const isCall = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    arguments: Schema.Array(Schema.Struct({ start: Schema.Finite })),
  }),
)

const passedOn = (nodes: ReadonlyArray<unknown>): ReadonlySet<number> =>
  new Set(nodes.flatMap((node) => (isCall(node) ? node.arguments.map(({ start }) => start) : [])))

const untypedInCompose = (node: unknown): ReadonlyArray<number> =>
  isCompose(node)
    ? node.arguments.slice(0, -1).flatMap((given) => (untyped(given) ? [given.start] : []))
    : []

const untypedOutside = (node: unknown, given: ReadonlySet<number>): ReadonlyArray<number> => {
  if (!isWrapper(node)) return []
  if (given.has(node.start)) return []

  return untyped(node.arguments[0]) ? [node.start] : []
}

const isDeclared = Schema.is(
  Schema.Struct({
    type: Schema.Literal("VariableDeclarator"),
    id: Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.String }),
    init: Schema.Unknown,
  }),
)

const isFunctionDeclared = Schema.is(
  Schema.Struct({
    type: Schema.Literal("FunctionDeclaration"),
    id: Schema.Struct({ name: Schema.String }),
    params: Schema.Array(Schema.Unknown),
  }),
)

const isNamed = Schema.is(
  Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.String }),
)

const takesNothing = (node: unknown): boolean => {
  if (isFunction(node)) return node.params.length === 0
  if (!isEffectFn(node)) return false

  return node.arguments.some((given) => isFunction(given) && given.params.length === 0)
}

const propsless = (nodes: ReadonlyArray<unknown>): ReadonlySet<string> =>
  new Set(
    nodes.flatMap((node) => {
      if (isFunctionDeclared(node)) return node.params.length === 0 ? [node.id.name] : []
      if (!isDeclared(node)) return []

      return takesNothing(node.init) ? [node.id.name] : []
    }),
  )

const firstTakesNothing = (given: unknown, named: ReadonlySet<string>): boolean =>
  isNamed(given) ? named.has(given.name) : takesNothing(given)

export const propslessFirstEnhancers = (program: unknown): ReadonlyArray<number> => {
  const nodes = everyNode(program)
  const named = propsless(nodes)

  return nodes.flatMap((node) => {
    if (!isCompose(node)) return []

    const [first, second] = node.arguments
    if (first === undefined || second === undefined) return []

    return firstTakesNothing(first, named) ? [first.start] : []
  })
}

export const untypedEnhancers = (program: unknown): ReadonlyArray<number> => {
  const nodes = everyNode(program)
  const given = passedOn(nodes)

  return nodes.flatMap((node) => [...untypedInCompose(node), ...untypedOutside(node, given)])
}
