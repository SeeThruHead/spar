import { Array, Option, Schema } from "effect"
import { parseSync } from "oxc-parser"

const Node = Schema.Struct({ type: Schema.String, start: Schema.Finite, end: Schema.Finite })

const isNode = Schema.is(Node)

const Named = Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.String })

const isNamed = Schema.is(Named)

const isMember = Schema.is(
  Schema.Struct({ type: Schema.Literal("MemberExpression"), object: Named, property: Named }),
)

const isYielded = Schema.is(
  Schema.Struct({
    type: Schema.Literal("YieldExpression"),
    delegate: Schema.Literal(true),
    argument: Schema.Unknown,
  }),
)

const isComponentCall = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      type: Schema.Literal("MemberExpression"),
      start: Schema.Finite,
      end: Schema.Finite,
      object: Schema.Struct({ name: Schema.Literal("View") }),
      property: Schema.Struct({ name: Schema.Literals(["connect", "taking"]) }),
    }),
    arguments: Schema.Array(Schema.Unknown),
  }),
)

const isDeclared = Schema.is(
  Schema.Struct({
    type: Schema.Literal("VariableDeclarator"),
    id: Named,
    init: Schema.Unknown,
  }),
)

const isCapital = (name: string): boolean => /^[A-Z]/.test(name)

const serviceName = (argument: unknown): ReadonlyArray<string> => {
  if (isNamed(argument)) return isCapital(argument.name) ? [argument.name] : []
  if (!isMember(argument)) return []
  if (!isCapital(argument.object.name) || !isCapital(argument.property.name)) return []

  return [`${argument.object.name}.${argument.property.name}`]
}

const childrenOf = (node: object): ReadonlyArray<unknown> =>
  Object.values(node).flatMap((value) => Array.ensure(value))

const everyNode = (node: unknown): ReadonlyArray<object> =>
  isNode(node) ? [node, ...childrenOf(node).flatMap(everyNode)] : []

const yieldedIn = (node: unknown, declared: ReadonlyMap<string, unknown>): ReadonlyArray<string> =>
  everyNode(node).flatMap((inner) => {
    if (isYielded(inner)) return serviceName(inner.argument)
    if (!isNamed(inner)) return []

    return Option.match(Option.fromUndefinedOr(declared.get(inner.name)), {
      onNone: () => [],
      onSome: (init) => yieldedIn(init, new Map()),
    })
  })

export const describeServices = (file: string, source: string): string => {
  const program: unknown = parseSync(file, source).program
  const nodes = everyNode(program)
  const declared = new Map(
    nodes.flatMap((node) => (isDeclared(node) ? [[node.id.name, node.init] as const] : [])),
  )
  const calls = nodes.flatMap((node) => (isComponentCall(node) ? [node] : []))

  return calls
    .toSorted((left, right) => right.callee.start - left.callee.start)
    .reduce((text, call) => {
      const services = Array.dedupe(call.arguments.flatMap((given) => yieldedIn(given, declared)))
      const listed = services.map((name) => `"${name}"`).join(",")
      const made = `View.described([${listed}]).${call.callee.property.name}`

      return `${text.slice(0, call.callee.start)}${made}${text.slice(call.callee.end)}`
    }, source)
}

export const mentionsComponents = (source: string): boolean =>
  source.includes("View.connect(") || source.includes("View.taking(")
